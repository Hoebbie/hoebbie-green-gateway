import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ist nicht konfiguriert.`);
  return value;
};

const homeAssistantUrl = required("HOME_ASSISTANT_URL").replace(/\/$/, "");
const homeAssistantToken = required("HOME_ASSISTANT_ACCESS_TOKEN");
const pilotEntityId = required("HOME_ASSISTANT_PILOT_ENTITY_ID");
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

if (!/^light\.[a-z0-9_]+$/.test(pilotEntityId)) throw new Error("D2 erlaubt ausschließlich eine einzelne Licht-Entität.");
if (!gatewayUrl.startsWith("https://") || homeAssistantToken.length < 24) throw new Error("Die Green-Gateway-Konfiguration ist ungültig.");

console.log(`Hoebbie-Gateway-Prüfwert für die einmalige Kopplung: ${gatewayKeyDigest}`);

const homeHeaders = { Authorization: `Bearer ${homeAssistantToken}`, "Content-Type": "application/json" };
const gatewayHeaders = { "Content-Type": "application/json", "X-Hoebbie-Gateway-Key": gatewayKey };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!response) throw new Error("Die Verbindung ist nicht erreichbar.");
  return response;
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

async function poll() {
  if (polling) return;
  polling = true;
  try {
    await runOnce();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Green-Gateway-Fehler");
  } finally {
    polling = false;
  }
}

setInterval(() => { void poll(); }, 2_000);
void poll();
