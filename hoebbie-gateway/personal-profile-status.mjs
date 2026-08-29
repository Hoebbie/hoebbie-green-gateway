const sensorEntityId = /^sensor\.[a-z0-9_]+$/;
const trackerEntityId = /^device_tracker\.[a-z0-9_]+$/;
const allowedConfigKeys = new Set([
  "battery_level_entity_id",
  "battery_state_entity_id",
  "location_entity_id",
  "profile_key",
  "steps_entity_id"
]);

function requiredEntityId(value, pattern) {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

export function personalProfileStatusConfig(value) {
  if (typeof value !== "string" || value.trim() === "" || value.trim() === "{}") return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error("gateway.profile_status_config_invalid"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).some((key) => !allowedConfigKeys.has(key))) {
    throw new Error("gateway.profile_status_config_invalid");
  }
  const config = {
    batteryLevelEntityId: requiredEntityId(parsed.battery_level_entity_id, sensorEntityId),
    batteryStateEntityId: requiredEntityId(parsed.battery_state_entity_id, sensorEntityId),
    locationEntityId: requiredEntityId(parsed.location_entity_id, trackerEntityId),
    profileKey: parsed.profile_key === "profile-lars" ? parsed.profile_key : null,
    stepsEntityId: requiredEntityId(parsed.steps_entity_id, sensorEntityId)
  };
  if (Object.values(config).some((item) => item === null)) throw new Error("gateway.profile_status_config_invalid");
  return config;
}

function numericState(state, minimum, maximum) {
  const value = Number(state?.state);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? Math.round(value) : undefined;
}

function booleanAttribute(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "on") return true;
  if (value === "false" || value === "off") return false;
  return undefined;
}

function zoneName(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("de-DE").replaceAll("_", " ");
  if (normalized === "unknown" || normalized === "unavailable" || normalized === "") return undefined;
  if (normalized === "home" || normalized === "zuhause") return "Zuhause";
  if (normalized === "work" || normalized === "arbeit" || normalized === "südsee camp" || normalized === "südsee-camp") return "Arbeit";
  if (normalized === "padel" || normalized === "padeln") return "Padeln";
  return "Unterwegs";
}

function observedAt(states) {
  const timestamps = states
    .map((state) => typeof state?.last_updated === "string" && !Number.isNaN(Date.parse(state.last_updated)) ? state.last_updated : null)
    .filter((value) => value !== null)
    .sort();
  return timestamps[0];
}

export function personalProfileStatusFromStates(states, config) {
  if (!Array.isArray(states) || !config) return null;
  const byId = new Map(states.filter((state) => state && typeof state.entity_id === "string").map((state) => [state.entity_id, state]));
  const batteryLevel = byId.get(config.batteryLevelEntityId);
  const batteryState = byId.get(config.batteryStateEntityId);
  const steps = byId.get(config.stepsEntityId);
  const location = byId.get(config.locationEntityId);
  const batteryPercent = numericState(batteryLevel, 0, 100);
  const stepCount = numericState(steps, 0, 200_000);
  const chargingState = typeof batteryState?.state === "string" ? batteryState.state.trim().toLocaleLowerCase("en-US") : "";
  const lowPowerMode = booleanAttribute(batteryState?.attributes?.["Low Power Mode"]);
  const zone = zoneName(location?.state);
  const timestamp = observedAt([batteryLevel, batteryState, steps, location]);
  return {
    ...(batteryPercent === undefined ? {} : { battery_percent: batteryPercent }),
    ...(!["charging", "full", "not charging"].includes(chargingState) ? {} : { charging: chargingState !== "not charging" }),
    ...(lowPowerMode === undefined ? {} : { low_power_mode: lowPowerMode }),
    ...(timestamp ? { observed_at: timestamp } : {}),
    ...(stepCount === undefined ? {} : { steps: stepCount }),
    ...(zone ? { zone_name: zone } : {})
  };
}
