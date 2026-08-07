import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { colorTemperature, currentBrightness, currentColorTemperature, currentRgbColor, lightTargetMatches, percentage, rgbColor } from "./routine-target.mjs";

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
const maintenanceSwitch = /(autoplay|gruppierung|hue bridge|sonos|loudness|lautstärke|volume|equalizer|night sound)/i;
const nonHouseholdEntity = /^(bürostrahler|ess?zimmer überblenden|küche überblenden|erdgeschoss|flur sensor aktiviert|flur lichtsensor aktiviert|wohnzimmer nachtton|wohnzimmer sprachverbesserung|wohnzimmer surround aktiviert|wohnzimmer überblenden)$/i;

function currentPosition(attributes) {
  const value = typeof attributes?.current_position === "number" ? attributes.current_position : Number(attributes?.current_position);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : undefined;
}

async function websocketRegistry(type, id) {
  const socketUrl = `${homeAssistantUrl.replace(/^http/, "ws")}/websocket`;
  const socket = new WebSocket(socketUrl);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("gateway.registry_timeout")); }, 8_000);
    const fail = (error) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error("gateway.registry_failed")); };
    socket.addEventListener("error", () => fail(new Error("gateway.registry_failed")), { once: true });
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { fail(new Error("gateway.registry_invalid")); return; }
      if (message.type === "auth_required") { socket.send(JSON.stringify({ type: "auth", access_token: homeAssistantToken })); return; }
      if (message.type === "auth_invalid") { fail(new Error("gateway.registry_unauthorized")); return; }
      if (message.type === "auth_ok") { socket.send(JSON.stringify({ id, type })); return; }
      if (message.type === "result" && message.id === id) {
        clearTimeout(timer); socket.close();
        if (message.success !== true) { reject(new Error("gateway.registry_rejected")); return; }
        resolve(message.result);
      }
    });
  });
}

async function homeAssistantAreas() {
  const [areas, devices, entities] = await Promise.all([
    websocketRegistry("config/area_registry/list", 1),
    websocketRegistry("config/device_registry/list", 2),
    websocketRegistry("config/entity_registry/list_for_display", 3)
  ]);
  const entityEntries = entities && typeof entities === "object" && Array.isArray(entities.entities) ? entities.entities : entities;
  if (!Array.isArray(areas) || !Array.isArray(devices) || !Array.isArray(entityEntries)) throw new Error("gateway.registry_invalid");
  const names = new Map(areas.filter((area) => typeof area?.area_id === "string" && typeof area?.name === "string").map((area) => [area.area_id, area.name]));
  const deviceAreas = new Map(devices.filter((device) => typeof device?.id === "string" && typeof device?.area_id === "string").map((device) => [device.id, device.area_id]));
  return new Map(entityEntries.filter((entity) => typeof entity?.ei === "string").map((entity) => {
    const areaId = typeof entity.ai === "string" ? entity.ai : deviceAreas.get(entity.di);
    return [entity.ei, typeof areaId === "string" ? names.get(areaId) ?? null : null];
  }));
}

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

function discoveredEntity(state, areaNames) {
  if (typeof state?.entity_id !== "string") return null;
  const kind = state.entity_id.split(".", 1)[0];
  if (!supportedKinds.has(kind) || typeof state.state !== "string") return null;
  const attributes = state.attributes && typeof state.attributes === "object" ? state.attributes : {};
  const displayName = typeof attributes.friendly_name === "string" ? attributes.friendly_name.trim() : "";
  if (!displayName) return null;
  // Media and bridge-maintenance switches are not household controls. They
  // remain available to a future explicit media/Alfred adapter, never D3 touch.
  if (nonHouseholdEntity.test(displayName) || (kind === "switch" && maintenanceSwitch.test(displayName))) return null;
  const capabilities = [];
  if (kind === "light") {
    capabilities.push("turn_on", "turn_off");
    if (Array.isArray(attributes.supported_color_modes) && attributes.supported_color_modes.some((mode) => mode === "brightness" || mode === "color_temp" || mode === "xy")) capabilities.push("brightness");
  } else if (kind === "cover") {
    capabilities.push("open", "close", "stop");
    if (currentPosition(attributes) !== undefined) capabilities.push("set_position");
  } else {
    capabilities.push("turn_on", "turn_off");
  }
  return {
    areaName: areaNames.get(state.entity_id) ?? null,
    brightness: currentBrightness(attributes),
    capabilities,
    colorTemperature: currentColorTemperature(attributes),
    displayName,
    entityId: state.entity_id,
    kind,
    position: currentPosition(attributes),
    rgbColor: currentRgbColor(attributes),
    state: state.state
  };
}

async function reportInventory() {
  const response = await request(`${homeAssistantUrl}/api/states`, { headers: homeHeaders });
  const states = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(states)) throw new Error("gateway.discovery_failed");
  const areaNames = await homeAssistantAreas();
  const entities = states.map((state) => discoveredEntity(state, areaNames)).filter((entity) => entity !== null);
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

async function runEntityOnce() {
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "entity_claim" }) });
  if (claimed.status === 204) return;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !command || typeof command.commandId !== "string" || typeof command.entityId !== "string" || !["light", "cover", "switch"].includes(command.kind) || !["turn_on", "turn_off", "open", "close", "stop", "set_position", "set_light"].includes(command.action)) throw new Error("gateway.entity_claim_invalid");
  let completion;
  try {
    if ((command.action === "stop" || command.action === "set_position") && command.kind !== "cover") throw new Error("gateway.entity_action_invalid");
    if (command.action === "set_position" && !percentage(command.targetPosition)) throw new Error("gateway.entity_position_invalid");
    if (command.action === "set_light" && (command.kind !== "light" || !percentage(command.targetBrightness) || (!colorTemperature(command.targetColorTemperature) && !rgbColor(command.targetRgbColor)))) throw new Error("gateway.entity_light_target_invalid");
    const domain = ["turn_on", "turn_off", "set_light"].includes(command.action) ? command.kind : "cover";
    const service = command.action === "turn_on" ? "turn_on" : command.action === "turn_off" ? "turn_off" : command.action === "open" ? "open_cover" : command.action === "close" ? "close_cover" : command.action === "stop" ? "stop_cover" : command.action === "set_position" ? "set_cover_position" : "turn_on";
    const action = await request(`${homeAssistantUrl}/api/services/${domain}/${service}`, { method: "POST", headers: homeHeaders, body: JSON.stringify({ entity_id: command.entityId, ...(command.action === "set_position" ? { position: command.targetPosition } : {}), ...(command.action === "set_light" ? { brightness_pct: command.targetBrightness, ...(colorTemperature(command.targetColorTemperature) ? { color_temp_kelvin: command.targetColorTemperature } : { rgb_color: command.targetRgbColor }) } : {}) }) });
    if (!action.ok) throw new Error("gateway.action_failed");
    let state;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request(`${homeAssistantUrl}/api/states/${encodeURIComponent(command.entityId)}`, { headers: homeHeaders });
      state = await response.json().catch(() => null);
      if (!response.ok || state?.entity_id !== command.entityId || typeof state.state !== "string") throw new Error("gateway.state_unavailable");
      const position = currentPosition(state.attributes);
      const verified = command.action === "set_position" ? position !== undefined && Math.abs(position - command.targetPosition) <= 2 : command.action === "set_light" ? lightTargetMatches(state, command) : command.action === "stop" ? !["opening", "closing"].includes(state.state) : command.action === "open" ? state.state === "open" : command.action === "close" ? state.state === "closed" : state.state === (command.action === "turn_on" ? "on" : "off");
      if (verified) break;
      state = null;
      await wait(500);
    }
    if (!state) throw new Error("gateway.verification_failed");
    completion = {
      commandId: command.commandId,
      mode: "entity_complete",
      observedBrightness: currentBrightness(state.attributes),
      observedColorTemperature: currentColorTemperature(state.attributes),
      observedPosition: currentPosition(state.attributes),
      observedRgbColor: currentRgbColor(state.attributes),
      observedState: state.state,
      success: true
    };
  } catch (error) { completion = { commandId: command.commandId, errorCode: error instanceof Error ? error.message.slice(0, 100) : "gateway.unexpected_error", mode: "entity_complete", success: false }; }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("gateway.entity_completion_failed");
  // A Home Assistant group can change several member lamps at once. Refresh
  // their inventory immediately after the verified group command instead of
  // waiting for the regular one-minute inventory pass.
  if (completion.success) {
    inventoryBurstUntil = Date.now() + 12_000;
    nextInventoryAt = Date.now() + 500;
    await reportInventory();
  }
}

let polling = false;
let nextInventoryAt = 0;
let inventoryBurstUntil = 0;

async function poll() {
  if (polling) return;
  polling = true;
  try {
    if (Date.now() >= nextInventoryAt) {
      await reportInventory();
      nextInventoryAt = Date.now() + (Date.now() < inventoryBurstUntil ? 500 : 60_000);
    }
    await runOnce();
    await runEntityOnce();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Green-Gateway-Fehler");
  } finally {
    polling = false;
  }
}

// Commands are claimed at sub-second cadence; inventory itself remains limited
// to once per minute inside poll().
setInterval(() => { void poll(); }, 500);
void poll();
