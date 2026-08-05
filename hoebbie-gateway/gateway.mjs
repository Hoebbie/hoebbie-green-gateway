import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ist nicht konfiguriert.`);
  return value;
};

const homeAssistantUrl = required("HOME_ASSISTANT_URL").replace(/\/$/, "");
const homeAssistantToken = required("HOME_ASSISTANT_ACCESS_TOKEN");
const gatewayUrl = required("HOEBBIE_GATEWAY_URL").replace(/\/$/, "");
const gatewayKeyPath = "/data/hoebbie_gateway_key";

function gatewayKeyFromPersistentStorage() {
  if (existsSync(gatewayKeyPath)) {
    const existing = readFileSync(gatewayKeyPath, "utf8").trim();
    if (existing.length >= 32) return existing;
    throw new Error("Der gespeicherte Gateway-Schlüssel ist ungültig.");
  }
  const created = randomBytes(32).toString("base64url");
  writeFileSync(gatewayKeyPath, `${created}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(gatewayKeyPath, 0o600);
  return created;
}

const gatewayKey = gatewayKeyFromPersistentStorage();
const gatewayKeyDigest = createHash("sha256").update(gatewayKey).digest("hex");

if (!gatewayUrl.startsWith("https://") || homeAssistantToken.length < 24) throw new Error("Die Green-Gateway-Konfiguration ist ungültig.");

console.log(`Hoebbie-Gateway-Prüfwert für die einmalige Kopplung: ${gatewayKeyDigest}`);

const homeHeaders = { Authorization: `Bearer ${homeAssistantToken}`, "Content-Type": "application/json" };
const gatewayHeaders = { "Content-Type": "application/json", "X-Hoebbie-Gateway-Key": gatewayKey };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const supportedKinds = new Set(["light", "cover", "switch"]);

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!response) throw new Error("Die Verbindung ist nicht erreichbar.");
  return response;
}

async function resolvePilotEntityId() {
  const response = await request(`${homeAssistantUrl}/api/states`, { headers: homeHeaders });
  const states = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(states)) throw new Error("gateway.discovery_failed");

  const matches = states.filter((state) =>
    typeof state?.entity_id === "string" &&
    /^light\.[a-z0-9_]+$/.test(state.entity_id) &&
    state.attributes?.friendly_name === "Kugel",
  );
  if (matches.length !== 1) throw new Error("gateway.pilot_not_unique");
  return matches[0].entity_id;
}

const pilotEntityId = await resolvePilotEntityId();
console.log("D2-Pilot „Kugel“ wurde lokal erkannt.");

function discoveredEntity(state) {
  if (typeof state?.entity_id !== "string") return null;
  const kind = state.entity_id.split(".", 1)[0];
  if (!supportedKinds.has(kind) || typeof state.state !== "string") return null;
  const attributes = state.attributes && typeof state.attributes === "object" ? state.attributes : {};
  const displayName = typeof attributes.friendly_name === "string" ? attributes.friendly_name.trim() : "";
  if (!displayName) return null;
  const capabilities = [];
  if (kind === "light") {
    capabilities.push("turn_on", "turn_off");
    if (Array.isArray(attributes.supported_color_modes) && attributes.supported_color_modes.some((mode) => mode === "brightness" || mode === "color_temp" || mode === "xy")) capabilities.push("brightness");
  } else if (kind === "cover") {
    capabilities.push("open", "close");
    if (attributes.current_position !== undefined) capabilities.push("set_position");
  } else {
    capabilities.push("turn_on", "turn_off");
  }
  return { capabilities, displayName, entityId: state.entity_id, kind, state: state.state };
}

async function reportInventory() {
  const response = await request(`${homeAssistantUrl}/api/states`, { headers: homeHeaders });
  const states = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(states)) throw new Error("gateway.discovery_failed");
  const entities = states.map(discoveredEntity).filter((entity) => entity !== null);
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ entities, mode: "inventory" }) });
  if (!reported.ok) throw new Error("gateway.inventory_report_failed");
}

async function verifiedHomeState(expected) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request(`${homeAssistantUrl}/api/states/${encodeURIComponent(pilotEntityId)}`, { headers: homeHeaders });
    const state = await response.json().catch(() => null);
    if (response.ok && state?.entity_id === pilotEntityId && state.state === expected) return state.state;
    await wait(500);
  }
  throw new Error("gateway.verification_failed");
}

async function runOnce() {
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "claim" }) });
  if (claimed.status === 204) return;
  const command = await claimed.json().catch(() => null);
  if (claimed.ok && command === null) return;
  if (!claimed.ok) {
    const detail = typeof command?.error === "string" ? command.error : `http_${claimed.status}`;
    throw new Error(`gateway.claim_${detail}`);
  }
  if (!command || typeof command.commandId !== "string" || !["on", "off"].includes(command.action)) throw new Error("gateway.claim_response_invalid");
  let completion;
  try {
    const action = await request(`${homeAssistantUrl}/api/services/light/turn_${command.action}`, { method: "POST", headers: homeHeaders, body: JSON.stringify({ entity_id: pilotEntityId }) });
    if (!action.ok) throw new Error("gateway.action_failed");
    completion = { commandId: command.commandId, mode: "complete", observedState: await verifiedHomeState(command.action), success: true };
  } catch (error) {
    completion = { commandId: command.commandId, errorCode: error instanceof Error ? error.message.slice(0, 100) : "gateway.unexpected_error", mode: "complete", success: false };
  }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("Das Ergebnis konnte nicht sicher protokolliert werden.");
}

let polling = false;
let nextInventoryAt = 0;

async function poll() {
  if (polling) return;
  polling = true;
  try {
    if (Date.now() >= nextInventoryAt) {
      await reportInventory();
      nextInventoryAt = Date.now() + 60_000;
    }
    await runOnce();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Green-Gateway-Fehler");
  } finally {
    polling = false;
  }
}

setInterval(() => { void poll(); }, 2_000);
void poll();
