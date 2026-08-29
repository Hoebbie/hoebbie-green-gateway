import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { MusicAssistantClient, MusicAssistantRealtime, validMusicAllRoomsCommand, validMusicCommand, validMusicGroupCommand, validMusicQueueTransferCommand, validMusicSeekCommand, validMusicShuffleCommand, validMusicSkipCommand, validMusicStartCommand, validMusicVolumeCommand } from "./music-assistant-client.mjs";
import { personalProfileStatusConfig, personalProfileStatusFromStates, vehicleStatusFromStates } from "./personal-profile-status.mjs";
import { radioStreamMetadata } from "./radio-stream-metadata.mjs";
import { runReadOnlyReporter } from "./read-only-reporter.mjs";
import { BoundedQueueDrain, CoalescedAsyncTask, GROUP_COMMAND_RECOVERY_INTERVAL_MS, withinDeadline } from "./queue-drain.mjs";
import { reportGatewayCompletion, safeGatewayError, safeGatewayResponseFailure } from "./gateway-response.mjs";
import { colorTemperature, currentBrightness, currentColorTemperature, currentRgbColor, lightTargetMatches, percentage, rgbColor } from "./routine-target.mjs";
import { decodeRealtimeMessage, heartbeatMessage, isCommandReady, isInventoryRefresh, joinMessage, realtimeSocketUrl, realtimeTopic, validRealtimeSession } from "./realtime-protocol.mjs";
import { wasteCollectionFromHomeAssistantState, wasteCollectionSyncLog } from "./waste-collection.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ist nicht konfiguriert.`);
  return value;
};

const homeAssistantUrl = required("HOME_ASSISTANT_URL").replace(/\/$/, "");
const homeAssistantToken = required("HOME_ASSISTANT_ACCESS_TOKEN");
const gatewayUrl = required("HOEBBIE_GATEWAY_URL").replace(/\/$/, "");
const gatewayKeyPath = "/data/hoebbie_gateway_key";
const profileQueuePath = "/data/hoebbie_profile_queue_id";

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
const profileStatusConfig = (() => {
  try { return personalProfileStatusConfig(process.env.PERSONAL_PROFILE_STATUS_ENTITIES_JSON ?? "{}"); }
  catch {
    console.error("gateway.profile_status_disabled:invalid_config");
    return null;
  }
})();

function persistedProfileQueueId() {
  if (!existsSync(profileQueuePath)) return null;
  const value = readFileSync(profileQueuePath, "utf8").trim();
  return /^[A-Za-z0-9:._/-]{1,200}$/.test(value) ? value : null;
}

function persistProfileQueueId(value) {
  // Player identifiers remain local to the add-on data volume and are never
  // put in logs, broadcasts or the mobile response.
  writeFileSync(profileQueuePath, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(profileQueuePath, 0o600);
}

function clearPersistedProfileQueueId() {
  writeFileSync(profileQueuePath, "", { encoding: "utf8", mode: 0o600 });
  chmodSync(profileQueuePath, 0o600);
}

function musicAssistantClientFromEnvironment() {
  const baseUrl = process.env.MUSIC_ASSISTANT_URL?.trim() ?? "";
  const accessToken = process.env.MUSIC_ASSISTANT_ACCESS_TOKEN?.trim() ?? "";
  if (!baseUrl && !accessToken) return null;
  if (!baseUrl || !accessToken) throw new Error("Die Music-Assistant-Konfiguration ist unvollständig.");
  return new MusicAssistantClient({ accessToken, baseUrl });
}

const musicAssistant = musicAssistantClientFromEnvironment();
const activeRadioStreams = new Map();
const musicProfileProviders = (() => {
  try {
    const value = JSON.parse(process.env.MUSIC_PROFILE_PROVIDERS_JSON ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { throw new Error("Die Music-Assistant-Profilzuordnung ist ungültig."); }
})();

if (musicAssistant) musicAssistant.restoreProfileQueue(persistedProfileQueueId());

if (!gatewayUrl.startsWith("https://") || homeAssistantToken.length < 24) throw new Error("Die Green-Gateway-Konfiguration ist ungültig.");

console.log(`Hoebbie-Gateway-Prüfwert für die einmalige Kopplung: ${gatewayKeyDigest}`);

async function reportMusicAssistantGroupCapabilities() {
  if (!musicAssistant) return;
  const capabilities = await musicAssistant.groupCapabilities();
  // These booleans describe only the generated documentation shell. They are
  // never treated as a feature decision because MA's HTML can omit commands.
  console.info(`music_assistant.api_docs_shell:group=${capabilities.group},next=${capabilities.next},play_media=${capabilities.playMedia},previous=${capabilities.previous},queue_get=${capabilities.queueGet},queue_transfer=${capabilities.queueTransfer},set_members=${capabilities.setMembers},shuffle=${capabilities.shuffle},ungroup=${capabilities.ungroup}`);
  const queueRegistryAvailable = await musicAssistant.queueRegistryAvailable();
  // No queue, title, media id or player identifier is logged or persisted.
  console.info(`music_assistant.queue_registry_readable=${queueRegistryAvailable}`);
  const radioMetadata = await musicAssistant.radioMetadataAvailability();
  // This temporary diagnosis contains only aggregate availability. It never
  // logs a queue, station, artist, title, player identifier or credential.
  console.info(`music_assistant.radio_metadata:stream_title_count=${radioMetadata.streamTitleCount},artist_title_pair_count=${radioMetadata.artistTitlePairCount}`);
  const radio = await musicAssistant.radioContract();
  // Only fixed capability booleans leave the local Music Assistant process.
  console.info(`music_assistant.radio_contract:direct_uri_playback=${radio.directUriPlayback},radio_library_readable=${radio.radioLibraryReadable}`);
}

void reportMusicAssistantGroupCapabilities().catch((error) => console.error(error instanceof Error && typeof error.code === "string" ? error.code : "music_assistant.group_capability_failed"));

async function reportMusicAssistantDiscovery() {
  if (!musicAssistant) return;
  const players = await musicAssistant.listPlayers();
  const reported = await request(gatewayUrl, {
    method: "POST",
    headers: gatewayHeaders,
    body: JSON.stringify({
      mode: "music_inventory",
      players: players.map((player) => ({
        available: player.available,
        displayName: player.displayName,
        groupMembers: player.groupMembers,
        isPlaying: player.isPlaying,
        playerId: player.id,
        powered: player.powered,
        syncedTo: player.syncedTo,
        ...(player.volume === null ? {} : { volume: player.volume })
      }))
    })
  });
  if (!reported.ok) {
    const failure = await reported.json().catch(() => null);
    const reason = typeof failure?.reason === "string" && /^[A-Za-z0-9_]{1,30}$/.test(failure.reason) ? `:${failure.reason}` : "";
    throw new Error(`gateway.music_inventory_report_failed:${reported.status}${reason}`);
  }
  const rejectedPlayerIds = [];
  for (let attempt = 0; attempt < Math.min(players.length, 8); attempt += 1) {
    const snapshot = await musicAssistant.activeQueueSnapshot(rejectedPlayerIds);
    if (!snapshot) break;
    // The radio session is identified by the station title confirmed at start,
    // not by Music Assistant's provider-dependent duration representation.
    // A Spotify title cannot match that confirmed station title.
    const activeRadioStream = activeRadioStreams.get(snapshot.sourcePlayerId);
    const streamMetadata = activeRadioStream?.stationTitle === snapshot.title ? await radioStreamMetadata(activeRadioStream.streamUri) : null;
    // Temporary redacted trace: it contains no sender, title, artist, player
    // identifier, URL or credential, only the three decision outcomes.
    console.info(`music_assistant.radio_icy_fallback:tracked=${activeRadioStream !== undefined},session_match=${activeRadioStream?.stationTitle === snapshot.title},metadata_available=${streamMetadata !== null}`);
    const projectedSnapshot = streamMetadata ? { ...snapshot, artist: streamMetadata.artist, title: streamMetadata.title } : snapshot;
    const sessionReported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_snapshot", snapshot: { album: projectedSnapshot.album, artist: projectedSnapshot.artist, artworkRef: projectedSnapshot.artworkRef, durationSeconds: projectedSnapshot.durationSeconds, isPlaying: projectedSnapshot.isPlaying, nextTracks: projectedSnapshot.nextTracks, observedAt: projectedSnapshot.observedAt, progressSeconds: projectedSnapshot.progressSeconds, sourceTime: projectedSnapshot.sourceTime, title: projectedSnapshot.title }, sourcePlayerId: projectedSnapshot.sourcePlayerId }) });
    if (!sessionReported.ok) throw new Error(await safeGatewayResponseFailure(sessionReported, "gateway.music_profile_snapshot_report_failed"));
    const confirmation = await sessionReported.json().catch(() => null);
    if (!confirmation || !Number.isInteger(confirmation.updated) || confirmation.updated < 0) throw new Error("gateway.music_profile_snapshot_confirmation_invalid");
    if (streamMetadata) console.info(`music_assistant.radio_snapshot_update:updated=${confirmation.updated}`);
    if (confirmation.updated > 0) {
      persistProfileQueueId(snapshot.sourcePlayerId);
      break;
    }
    rejectedPlayerIds.push(snapshot.sourcePlayerId);
    musicAssistant.clearProfileQueue(snapshot.sourcePlayerId);
    clearPersistedProfileQueueId();
  }
  const available = players.filter((player) => player.available).length;
  const playing = players.filter((player) => player.isPlaying).length;
  // Logs deliberately contain neither player ids/names nor credentials.
  console.info(`music_assistant.discovery:available=${available},playing=${playing}`);
}

const musicDiscoveryReporter = new CoalescedAsyncTask({
  delayMilliseconds: 250,
  onError: (error) => console.error(safeGatewayError(error, "music_assistant.live_state_report_failed")),
  run: reportMusicAssistantDiscovery
});

// Music Assistant does not currently surface ICY titles for the configured
// direct streams. Refresh only an actively selected radio source; this never
// sends a playback command and remains bounded to one request per 30 seconds.
const radioMetadataRefresh = setInterval(() => {
  if (activeRadioStreams.size > 0) void musicDiscoveryReporter.request();
}, 30_000);
radioMetadataRefresh.unref?.();

let lastMusicAssistantContractEventAt = null;
const musicAssistantRealtime = musicAssistant
  ? new MusicAssistantRealtime(musicAssistant.config, ({ eventType, timingAnchor }) => {
    // The temporary E4.7.2 contract probe records only the documented event
    // category. It does not expose payloads, IDs, credentials or media data.
    const now = Date.now();
    const gapMilliseconds = lastMusicAssistantContractEventAt === null ? null : Math.max(0, now - lastMusicAssistantContractEventAt);
    lastMusicAssistantContractEventAt = now;
    console.info(`music_assistant.contract_event:${eventType},timing_anchor=${timingAnchor},gap_ms=${gapMilliseconds ?? "first"}`);
    void musicDiscoveryReporter.request();
  })
  : null;

const homeHeaders = { Authorization: `Bearer ${homeAssistantToken}`, "Content-Type": "application/json" };
const gatewayHeaders = { "Content-Type": "application/json", "X-Hoebbie-Gateway-Key": gatewayKey };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const supportedKinds = new Set(["light", "cover", "switch"]);
const maintenanceSwitch = /(autoplay|gruppierung|hue bridge|sonos|loudness|lautstärke|volume|equalizer|night sound)/i;
const nonHouseholdEntity = /^(bürostrahler|ess?zimmer überblenden|küche überblenden|erdgeschoss|flur sensor aktiviert|flur lichtsensor aktiviert|wohnzimmer nachtton|wohnzimmer sprachverbesserung|wohnzimmer surround aktiviert|wohnzimmer überblenden)$/i;
// Meross MSG100 exposes buzzer and do-not-disturb implementation entities next
// to the actual `cover.*_garage`. They are setup switches, not household
// controls, and must never be offered to Hoebbie or Alfred.
const merossGarageMaintenanceEntity = /(?:_dnd$|_buzzerenable$)/i;

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

async function reportCommandCompletion(completion, failureCode) {
  await reportGatewayCompletion({
    failureCode,
    post: () => request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) })
  });
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
await reportMusicAssistantDiscovery().catch((error) => console.error(safeGatewayError(error, "music_assistant.discovery_unavailable")));

function discoveredEntity(state, areaNames) {
  if (typeof state?.entity_id !== "string") return null;
  const kind = state.entity_id.split(".", 1)[0];
  if (!supportedKinds.has(kind) || typeof state.state !== "string") return null;
  const attributes = state.attributes && typeof state.attributes === "object" ? state.attributes : {};
  const displayName = typeof attributes.friendly_name === "string" ? attributes.friendly_name.trim() : "";
  if (!displayName) return null;
  // Media and bridge-maintenance switches are not household controls. They
  // remain available to a future explicit media/Alfred adapter, never D3 touch.
  if (nonHouseholdEntity.test(displayName) || (kind === "switch" && maintenanceSwitch.test(displayName)) || merossGarageMaintenanceEntity.test(state.entity_id)) return null;
  const capabilities = [];
  if (kind === "light") {
    capabilities.push("turn_on", "turn_off");
    const colorModes = Array.isArray(attributes.supported_color_modes) ? attributes.supported_color_modes : [];
    if (colorModes.some((mode) => mode === "brightness" || mode === "color_temp" || mode === "hs" || mode === "xy" || mode === "rgb" || mode === "rgbw" || mode === "rgbww")) capabilities.push("brightness");
    if (colorModes.includes("color_temp")) capabilities.push("set_color_temperature");
    if (colorModes.some((mode) => mode === "hs" || mode === "xy" || mode === "rgb" || mode === "rgbw" || mode === "rgbww")) capabilities.push("set_rgb");
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
    safetyClass: kind === "cover" && attributes.device_class === "garage" ? "garage" : "standard",
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

async function reportWasteCollection() {
  const response = await request(`${homeAssistantUrl}/api/states`, { headers: homeHeaders });
  const states = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(states)) throw new Error("gateway.waste_read_failed");
  const collections = new Map();
  for (const state of states) {
    const collection = wasteCollectionFromHomeAssistantState(state);
    if (collection && !collections.has(collection.kind)) collections.set(collection.kind, collection);
  }
  const reported = await request(gatewayUrl, {
    method: "POST",
    headers: gatewayHeaders,
    body: JSON.stringify({
      collections: [...collections.values()].map(({ kind, originalName, pickupDate, sourceEntityId }) => ({ kind, originalName, pickupDate, sourceEntityId })),
      mode: "waste_collection"
    })
  });
  if (!reported.ok) throw new Error("gateway.waste_report_failed");
  console.info(wasteCollectionSyncLog(collections.size));
}

async function reportPersonalProfileStatus() {
  if (!profileStatusConfig) return;
  const response = await request(`${homeAssistantUrl}/api/states`, { headers: homeHeaders });
  const states = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(states)) throw new Error("gateway.profile_status_read_failed");
  const appleStatus = personalProfileStatusFromStates(states, profileStatusConfig);
  const vehicleStatus = vehicleStatusFromStates(states, profileStatusConfig);
  if (!appleStatus) throw new Error("gateway.profile_status_projection_failed");
  const reported = await request(gatewayUrl, {
    method: "POST",
    headers: gatewayHeaders,
    body: JSON.stringify({ appleStatus, mode: "profile_status", profileKey: profileStatusConfig.profileKey, ...(vehicleStatus ? { vehicleStatus } : {}) })
  });
  if (!reported.ok) throw new Error(await safeGatewayResponseFailure(reported, "gateway.profile_status_report_failed"));
  console.info("gateway.profile_status_reported");
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
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (claimed.ok && command === null) return false;
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
  return true;
}

function validEntityCommand(command) {
  return Boolean(command && typeof command.commandId === "string" && typeof command.entityId === "string" && ["light", "cover", "switch"].includes(command.kind) && ["turn_on", "turn_off", "open", "close", "stop", "set_position", "set_light"].includes(command.action));
}

async function executeEntityCommand(command) {
  let completion;
  try {
    if ((command.action === "stop" || command.action === "set_position") && command.kind !== "cover") throw new Error("gateway.entity_action_invalid");
    if (command.action === "set_position" && !percentage(command.targetPosition)) throw new Error("gateway.entity_position_invalid");
    if (command.action === "set_light" && (command.kind !== "light" || !percentage(command.targetBrightness))) throw new Error("gateway.entity_light_target_invalid");
    const domain = ["turn_on", "turn_off", "set_light"].includes(command.action) ? command.kind : "cover";
    const service = command.action === "turn_on" ? "turn_on" : command.action === "turn_off" ? "turn_off" : command.action === "open" ? "open_cover" : command.action === "close" ? "close_cover" : command.action === "stop" ? "stop_cover" : command.action === "set_position" ? "set_cover_position" : "turn_on";
    const action = await request(`${homeAssistantUrl}/api/services/${domain}/${service}`, { method: "POST", headers: homeHeaders, body: JSON.stringify({ entity_id: command.entityId, ...(command.action === "set_position" ? { position: command.targetPosition } : {}), ...(command.action === "set_light" ? { brightness_pct: command.targetBrightness, ...(colorTemperature(command.targetColorTemperature) ? { color_temp_kelvin: command.targetColorTemperature } : rgbColor(command.targetRgbColor) ? { rgb_color: command.targetRgbColor } : {}) } : {}) }) });
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
  return completion;
}

async function reportEntityCompletion(completion) {
  await reportCommandCompletion(completion, "gateway.entity_completion_failed");
}

async function refreshAfterEntitySuccess(successful) {
  // A Home Assistant group can change several member lamps at once. Refresh
  // their inventory once after direct or parallel routine commands instead of
  // waiting for the regular one-minute inventory pass.
  if (successful) {
    inventoryBurstUntil = Date.now() + 12_000;
    nextInventoryAt = Date.now() + 500;
    await reportInventory();
  }
}

async function runEntityRoutineBatch() {
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "entity_claim_batch" }) });
  if (claimed.status === 204) return false;
  const response = await claimed.json().catch(() => null);
  const commands = response?.commands;
  if (!claimed.ok || !Array.isArray(commands) || commands.length === 0 || commands.some((command) => !validEntityCommand(command))) throw new Error("gateway.entity_claim_batch_invalid");
  const completions = await Promise.all(commands.map((command) => executeEntityCommand(command)));
  await Promise.all(completions.map((completion) => reportEntityCompletion(completion)));
  await refreshAfterEntitySuccess(completions.some((completion) => completion.success));
  return true;
}

async function runEntityOnce() {
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "entity_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validEntityCommand(command)) throw new Error("gateway.entity_claim_invalid");
  const completion = await executeEntityCommand(command);
  await reportEntityCompletion(completion);
  await refreshAfterEntitySuccess(completion.success);
  return true;
}

async function runMusicOnce() {
  // Without both locally configured Music Assistant values, music control is
  // disabled. A claim never carries a free endpoint, token, or command.
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicCommand(command)) throw new Error("gateway.music_claim_invalid");
  let completion;
  try {
    completion = {
      commandId: command.commandId,
      mode: "music_complete",
      observedIsPlaying: await withinDeadline(musicAssistant.setPlayback(command), 7_000, "music_assistant.command_timeout"),
      success: true
    };
  } catch (error) {
    const errorCode = error && typeof error === "object" && typeof error.code === "string"
      ? error.code
      : error instanceof Error
        ? error.message
        : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: errorCode.slice(0, 100), mode: "music_complete", success: false };
  }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("gateway.music_completion_failed");
  return true;
}

async function runMusicVolumeOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_volume_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicVolumeCommand(command)) throw new Error("gateway.music_volume_claim_invalid");
  let completion;
  try {
    completion = {
      commandId: command.commandId,
      mode: "music_volume_complete",
      observedVolumes: await withinDeadline(musicAssistant.setVolumes(command), 14_000, "music_assistant.command_timeout"),
      success: true
    };
  } catch (error) {
    const errorCode = error && typeof error === "object" && typeof error.code === "string"
      ? error.code
      : error instanceof Error ? error.message : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: errorCode.slice(0, 100), mode: "music_volume_complete", success: false };
  }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("gateway.music_volume_completion_failed");
  return true;
}

async function runMusicGroupOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_group_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicGroupCommand(command)) throw new Error("gateway.music_group_claim_invalid");
  let completion;
  try {
    await withinDeadline(command.operation === "ungroup" ? musicAssistant.ungroupPlayers(command) : musicAssistant.groupPlayers(command), 12_000, "music_assistant.command_timeout");
    completion = { commandId: command.commandId, mode: "music_group_complete", success: true };
  } catch (error) {
    const errorCode = error && typeof error === "object" && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: errorCode.slice(0, 100), mode: "music_group_complete", success: false };
  }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("gateway.music_group_completion_failed");
  await musicDiscoveryReporter.request();
  return true;
}

async function runMusicProfileTransferOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_transfer_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicQueueTransferCommand(command)) throw new Error("gateway.music_profile_transfer_claim_invalid");
  let completion;
  try {
    const snapshot = await withinDeadline(musicAssistant.transferQueue(command), 12_000, "music_assistant.queue_transfer_timeout");
    completion = { commandId: command.commandId, mode: "music_profile_transfer_complete", snapshot, success: true };
  } catch (error) {
    const errorCode = error && typeof error === "object" && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: errorCode.slice(0, 100), mode: "music_profile_transfer_complete", success: false };
  }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("gateway.music_profile_transfer_completion_failed");
  await musicDiscoveryReporter.request();
  return true;
}

async function runMusicProfileAllRoomsOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_all_rooms_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicAllRoomsCommand(command)) throw new Error("gateway.music_profile_all_rooms_claim_invalid");
  let completion;
  try { completion = { commandId: command.commandId, mode: "music_profile_all_rooms_complete", snapshot: await withinDeadline(musicAssistant.groupAllRooms(command), 15_000, "music_assistant.all_rooms_timeout"), success: true }; }
  catch (error) { const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error"; completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_profile_all_rooms_complete", success: false }; }
  await reportCommandCompletion(completion, "gateway.music_profile_all_rooms_completion_failed");
  await musicDiscoveryReporter.request();
  return true;
}

async function runMusicProfileSeekOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_seek_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicSeekCommand(command)) throw new Error("gateway.music_profile_seek_claim_invalid");
  let completion;
  try { completion = { commandId: command.commandId, mode: "music_profile_seek_complete", snapshot: await withinDeadline(musicAssistant.seekQueue(command), 12_000, "music_assistant.seek_timeout"), success: true }; }
  catch (error) { const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error"; completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_profile_seek_complete", success: false }; }
  const reported = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify(completion) });
  if (!reported.ok) throw new Error("gateway.music_profile_seek_completion_failed");
  return true;
}

async function runMusicProfileSkipOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_skip_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicSkipCommand(command)) throw new Error("gateway.music_profile_skip_claim_invalid");
  let completion;
  try { completion = { commandId: command.commandId, mode: "music_profile_skip_complete", snapshot: await withinDeadline(musicAssistant.skipQueue(command), 12_000, "music_assistant.skip_timeout"), success: true }; }
  catch (error) { const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error"; completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_profile_skip_complete", success: false }; }
  await reportCommandCompletion(completion, "gateway.music_profile_skip_completion_failed");
  return true;
}

async function runMusicProfileShuffleOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_shuffle_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicShuffleCommand(command)) throw new Error("gateway.music_profile_shuffle_claim_invalid");
  let completion;
  try { completion = { commandId: command.commandId, mode: "music_profile_shuffle_complete", snapshot: await withinDeadline(musicAssistant.setShuffle(command), 12_000, "music_assistant.shuffle_timeout"), success: true }; }
  catch (error) { const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error"; completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_profile_shuffle_complete", success: false }; }
  await reportCommandCompletion(completion, "gateway.music_profile_shuffle_completion_failed");
  return true;
}

async function runMusicCatalogOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_catalog_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || typeof command?.commandId !== "string" || typeof command?.profileKey !== "string" || !["title", "playlists"].includes(command.queryKind)) throw new Error("gateway.music_catalog_claim_invalid");
  const provider = musicProfileProviders[command.profileKey];
  let completion;
  try {
    const items = command.queryKind === "title"
      ? await withinDeadline(musicAssistant.searchTracks(command.query, provider), 8_000, "music_assistant.search_timeout")
      : await withinDeadline(musicAssistant.listPlaylists(command.pageOffset, provider), 8_000, "music_assistant.playlists_timeout");
    completion = { commandId: command.commandId, items, mode: "music_catalog_complete", success: true };
  } catch (error) {
    const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_catalog_complete", success: false };
  }
  await reportCommandCompletion(completion, "gateway.music_catalog_completion_failed");
  console.info(`gateway.music_catalog_completed:${command.queryKind}:${completion.success ? "success" : "failed"}`);
  return true;
}

async function runMusicAlbumCatalogOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_album_catalog_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || typeof command?.commandId !== "string" || typeof command?.query !== "string" || command.query.trim().length < 3 || command.query.trim().length > 100) throw new Error("gateway.music_album_catalog_claim_invalid");
  let completion;
  try {
    const items = await withinDeadline(musicAssistant.searchAlbums(command.query), 8_000, "music_assistant.search_timeout");
    completion = { commandId: command.commandId, items, mode: "music_catalog_complete", success: true };
  } catch (error) {
    const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_catalog_complete", success: false };
  }
  await reportCommandCompletion(completion, "gateway.music_album_catalog_completion_failed");
  console.info(`gateway.music_album_catalog_completed:${completion.success ? "success" : "failed"}`);
  return true;
}

async function runMusicStartOnce() {
  if (!musicAssistant) return false;
  const claimed = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "music_profile_start_claim" }) });
  if (claimed.status === 204) return false;
  const command = await claimed.json().catch(() => null);
  if (!claimed.ok || !validMusicStartCommand(command)) throw new Error("gateway.music_profile_start_claim_invalid");
  let completion;
  try {
    const snapshot = await withinDeadline(musicAssistant.startPlayback(command), command.mediaKind === "radio" ? 45_000 : 35_000, "music_assistant.start_timeout");
    if (command.mediaKind === "radio") {
      const radioSession = { stationTitle: snapshot.title, streamUri: command.mediaUri };
      activeRadioStreams.set(command.targetPlayerId, radioSession);
      if (typeof snapshot.sourcePlayerId === "string") activeRadioStreams.set(snapshot.sourcePlayerId, radioSession);
    } else activeRadioStreams.delete(command.targetPlayerId);
    completion = { commandId: command.commandId, mode: "music_profile_start_complete", snapshot, success: true };
  } catch (error) {
    const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "music_assistant.unexpected_error";
    completion = { commandId: command.commandId, errorCode: code.slice(0, 100), mode: "music_profile_start_complete", success: false };
  }
  await reportCommandCompletion(completion, "gateway.music_profile_start_completion_failed");
  // Publish a selected radio title as soon as the start confirmation exists.
  // The report is deliberately detached: missing stream metadata must never
  // delay or turn a confirmed playback command into a failure.
  if (completion.success) void musicDiscoveryReporter.request();
  console.info(`gateway.music_profile_start_completed:${completion.success ? "success" : `failed:${completion.errorCode}`}`);
  return true;
}

let polling = false;
let nextInventoryAt = 0;
let nextMusicInventoryAt = 0;
let nextProfileStatusAt = 0;
let inventoryBurstUntil = 0;

const musicCommandDrain = new BoundedQueueDrain({
  claimOnce: runMusicOnce,
  onClaimed: (count) => console.info(`gateway.music_command_claimed:${count}`),
  onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"),
  onLimit: () => console.error("Der Music-Assistant-Gateway hat die Auftragsgrenze erreicht und wartet auf das nächste sichere Wecksignal.")
});
const musicVolumeCommandDrain = new BoundedQueueDrain({
  claimOnce: runMusicVolumeOnce,
  onClaimed: (count) => console.info(`gateway.music_volume_command_claimed:${count}`),
  onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"),
  onLimit: () => console.error("Der Music-Assistant-Gateway hat die Lautstärke-Auftragsgrenze erreicht und wartet auf das nächste sichere Wecksignal.")
});
const musicProfileTransferCommandDrain = new BoundedQueueDrain({
  claimOnce: runMusicProfileTransferOnce,
  onClaimed: (count) => console.info(`gateway.music_profile_transfer_claimed:${count}`),
  onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"),
  onLimit: () => console.error("Der Music-Assistant-Gateway hat die Auftragsgrenze erreicht und wartet auf das nächste sichere Wecksignal.")
});
const musicProfileAllRoomsCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicProfileAllRoomsOnce, onClaimed: (count) => console.info(`gateway.music_profile_all_rooms_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Alle-Räume-Auftragsgrenze erreicht.") });
const musicProfileSeekCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicProfileSeekOnce, onClaimed: (count) => console.info(`gateway.music_profile_seek_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Seek-Auftragsgrenze erreicht.") });
const musicProfileSkipCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicProfileSkipOnce, onClaimed: (count) => console.info(`gateway.music_profile_skip_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Skip-Auftragsgrenze erreicht.") });
const musicProfileShuffleCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicProfileShuffleOnce, onClaimed: (count) => console.info(`gateway.music_profile_shuffle_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Shuffle-Auftragsgrenze erreicht.") });
const musicCatalogCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicCatalogOnce, onClaimed: (count) => console.info(`gateway.music_catalog_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Suchauftragsgrenze erreicht.") });
const musicAlbumCatalogCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicAlbumCatalogOnce, onClaimed: (count) => console.info(`gateway.music_album_catalog_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Album-Suchauftragsgrenze erreicht.") });
const musicStartCommandDrain = new BoundedQueueDrain({ claimOnce: runMusicStartOnce, onClaimed: (count) => console.info(`gateway.music_profile_start_claimed:${count}`), onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"), onLimit: () => console.error("Der Music-Assistant-Gateway hat die Startauftragsgrenze erreicht.") });
const musicGroupCommandDrain = new BoundedQueueDrain({
  claimOnce: runMusicGroupOnce,
  onClaimed: (count) => console.info(`gateway.music_group_command_claimed:${count}`),
  onError: (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Gateway-Fehler"),
  onLimit: () => console.error("Der Music-Assistant-Gateway hat die Gruppen-Auftragsgrenze erreicht und wartet auf das nächste sichere Wecksignal.")
});

async function drainDeviceCommands() {
  if (polling) return;
  polling = true;
  let claimedCommands = 0;
  try {
    // Ein Realtime-Signal enthält nie eine Aktion. Es löst nur die bestehenden,
    // serverseitig autorisierten Claims aus. Die Schleife leert begrenzt auch
    // mehrere dicht hintereinander eingereihte Aufträge.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const [pilotClaimed, routineClaimed, entityClaimed] = [await runOnce(), await runEntityRoutineBatch(), await runEntityOnce()];
      if (!pilotClaimed && !routineClaimed && !entityClaimed) break;
      claimedCommands += Number(pilotClaimed) + Number(routineClaimed) + Number(entityClaimed);
    }
    if (Date.now() >= nextInventoryAt && await runReadOnlyReporter(
      reportInventory,
      (error) => console.error(error instanceof Error ? error.message : "Green-Inventarfehler")
    )) nextInventoryAt = Date.now() + (Date.now() < inventoryBurstUntil ? 500 : 60_000);
    if (Date.now() >= nextMusicInventoryAt && await runReadOnlyReporter(
      () => musicDiscoveryReporter.request(),
      (error) => console.error(error instanceof Error ? error.message : "Music-Assistant-Inventarfehler")
    )) nextMusicInventoryAt = Date.now() + 60_000;
    if (Date.now() >= nextProfileStatusAt && await runReadOnlyReporter(
      reportPersonalProfileStatus,
      (error) => console.error(error instanceof Error ? error.message : "Profilstatusfehler")
    )) nextProfileStatusAt = Date.now() + 60_000;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Green-Gateway-Fehler");
  } finally {
    polling = false;
    if (claimedCommands > 0) console.info(`gateway.command_claimed:${claimedCommands}`);
  }
}

function drainCommands() {
  // Music has its own bounded worker. It must never wait behind a slow light,
  // routine or inventory request and cannot keep those queues locked either.
  void musicCommandDrain.request();
  void musicVolumeCommandDrain.request();
  void musicProfileTransferCommandDrain.request();
  void musicProfileAllRoomsCommandDrain.request();
  void musicProfileSeekCommandDrain.request();
  void musicProfileSkipCommandDrain.request();
  void musicProfileShuffleCommandDrain.request();
  void musicCatalogCommandDrain.request();
  void musicAlbumCatalogCommandDrain.request();
  void musicStartCommandDrain.request();
  void musicGroupCommandDrain.request();
  void drainDeviceCommands();
}

async function realtimeSession() {
  const response = await request(gatewayUrl, { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ mode: "realtime_session" }) });
  const session = await response.json().catch(() => null);
  if (!response.ok || !validRealtimeSession(session)) throw new Error("gateway.realtime_session_invalid");
  return session;
}

let realtimeSocket = null;
let reconnectTimer = null;
let refreshTimer = null;
let heartbeatTimer = null;
let joinTimer = null;
let realtimeRef = 0;
let reconnectDelay = 5_000;

function clearRealtimeTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (joinTimer) clearTimeout(joinTimer);
  reconnectTimer = null;
  refreshTimer = null;
  heartbeatTimer = null;
  joinTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void connectRealtime(); }, delay);
}

async function connectRealtime() {
  clearRealtimeTimers();
  try {
    const session = await realtimeSession();
    const topic = realtimeTopic(session.gatewayId);
    const socket = new WebSocket(realtimeSocketUrl(session));
    socket.binaryType = "arraybuffer";
    realtimeSocket = socket;
    socket.addEventListener("open", () => {
      const ref = ++realtimeRef;
      console.info("gateway.realtime_socket_open");
      socket.send(JSON.stringify(joinMessage(topic, session.accessToken, ref)));
      // A socket without a phx_join reply cannot receive private broadcasts.
      // Close it explicitly instead of leaving command delivery stalled until
      // the rare fallback poll happens.
      joinTimer = setTimeout(() => {
        console.error("gateway.realtime_join_timeout");
        socket.close();
      }, 15_000);
    });
    socket.addEventListener("message", async (event) => {
      const message = await decodeRealtimeMessage(event.data);
      if (!message) return;
      if (isCommandReady(message, topic)) {
        console.info("gateway.realtime_command_ready");
        void drainCommands();
      }
      // This signal contains no device data and only advances the next
      // read-only inventory report. It never enters a command path.
      if (isInventoryRefresh(message, topic)) {
        nextInventoryAt = Date.now();
        void drainDeviceCommands();
      }
      if (Array.isArray(message) && message[2] === topic && message[3] === "phx_reply") {
        if (message[4]?.status === "ok") {
          if (joinTimer) clearTimeout(joinTimer);
          joinTimer = null;
          reconnectDelay = 5_000;
          console.info("gateway.realtime_joined");
          heartbeatTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(heartbeatMessage(++realtimeRef))), 20_000);
          const delay = Math.max(60_000, (session.expiresAt * 1_000) - Date.now() - 60_000);
          refreshTimer = setTimeout(() => socket.close(), delay);
          // A command queued while the channel was reconnecting is claimed
          // only after the private subscription is confirmed.
          void drainCommands();
        } else {
          if (joinTimer) clearTimeout(joinTimer);
          joinTimer = null;
          const reason = typeof message[4]?.response?.reason === "string" ? message[4].response.reason : "unknown";
          console.error(`gateway.realtime_join_rejected:${reason}`);
          socket.close();
        }
      }
      if (Array.isArray(message) && message[2] === topic && (message[3] === "phx_error" || message[3] === "phx_close")) socket.close();
    });
    socket.addEventListener("error", () => console.error("Die private Realtime-Verbindung des Green-Gateways ist unterbrochen."));
    socket.addEventListener("close", () => {
      if (realtimeSocket !== socket) return;
      clearRealtimeTimers();
      realtimeSocket = null;
      console.warn("gateway.realtime_closed");
      scheduleReconnect();
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Die private Realtime-Verbindung des Green-Gateways ist nicht erreichbar.");
    scheduleReconnect();
  }
}

// Supabase Broadcast remains the low-latency wake-up. This focused recovery
// pass protects the durable 90-second group queue without increasing polling
// for unrelated workers.
setInterval(() => { void musicGroupCommandDrain.request(); }, GROUP_COMMAND_RECOVERY_INTERVAL_MS);
// The broad pass remains a rare reconciliation for unrelated queues.
setInterval(() => { void drainCommands(); }, 5 * 60_000);
void drainCommands();
void reportWasteCollection().catch((error) => console.error(safeGatewayError(error, "gateway.waste_unavailable")));
const wasteCollectionRefresh = setInterval(() => { void reportWasteCollection().catch((error) => console.error(safeGatewayError(error, "gateway.waste_unavailable"))); }, 6 * 60 * 60_000);
wasteCollectionRefresh.unref?.();
void connectRealtime();
musicAssistantRealtime?.start();
