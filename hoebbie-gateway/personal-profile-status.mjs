const sensorEntityId = /^sensor\.[a-z0-9_]+$/;
const trackerEntityId = /^device_tracker\.[a-z0-9_]+$/;
const vehicleEntityId = /^(?:binary_sensor|device_tracker|lock|sensor)\.[a-z0-9_]+$/;
const allowedConfigKeys = new Set([
  "battery_level_entity_id",
  "battery_state_entity_id",
  "location_entity_id",
  "profile_key",
  "steps_entity_id",
  "vehicle_entity_ids"
]);
const allowedVehicleKeys = new Set([
  "doors_open_entity_id",
  "fuel_percent_entity_id",
  "location_entity_id",
  "locked_entity_id",
  "mileage_kilometers_entity_id",
  "range_kilometers_entity_id",
  "service_due_entity_id",
  "warning_count_entity_id",
  "windows_open_entity_id"
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
  const vehicleSource = parsed.vehicle_entity_ids;
  if (vehicleSource !== undefined && (!vehicleSource || typeof vehicleSource !== "object" || Array.isArray(vehicleSource) || Object.keys(vehicleSource).some((key) => !allowedVehicleKeys.has(key)))) {
    throw new Error("gateway.profile_status_config_invalid");
  }
  const vehicle = vehicleSource ? Object.fromEntries(Object.entries({
    doorsOpenEntityId: vehicleSource.doors_open_entity_id,
    fuelPercentEntityId: vehicleSource.fuel_percent_entity_id,
    locationEntityId: vehicleSource.location_entity_id,
    lockedEntityId: vehicleSource.locked_entity_id,
    mileageKilometersEntityId: vehicleSource.mileage_kilometers_entity_id,
    rangeKilometersEntityId: vehicleSource.range_kilometers_entity_id,
    serviceDueEntityId: vehicleSource.service_due_entity_id,
    warningCountEntityId: vehicleSource.warning_count_entity_id,
    windowsOpenEntityId: vehicleSource.windows_open_entity_id
  }).filter(([, entityId]) => entityId !== undefined).map(([key, entityId]) => [key, requiredEntityId(entityId, vehicleEntityId)])) : null;
  if (vehicle && (Object.keys(vehicle).length === 0 || Object.values(vehicle).some((item) => item === null))) throw new Error("gateway.profile_status_config_invalid");
  const config = {
    batteryLevelEntityId: requiredEntityId(parsed.battery_level_entity_id, sensorEntityId),
    batteryStateEntityId: requiredEntityId(parsed.battery_state_entity_id, sensorEntityId),
    locationEntityId: requiredEntityId(parsed.location_entity_id, trackerEntityId),
    profileKey: parsed.profile_key === "profile-lars" ? parsed.profile_key : null,
    stepsEntityId: requiredEntityId(parsed.steps_entity_id, sensorEntityId),
    ...(vehicle ? { vehicle } : {})
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
    .map(stateTimestamp)
    .filter((value) => typeof value === "string")
    .sort();
  return timestamps[0];
}

function latestObservedAt(states) {
  const timestamps = states
    .map(stateTimestamp)
    .filter((value) => typeof value === "string")
    .sort();
  return timestamps.at(-1);
}

function stateTimestamp(state) {
  if (typeof state?.last_reported === "string" && !Number.isNaN(Date.parse(state.last_reported))) return state.last_reported;
  return typeof state?.last_updated === "string" && !Number.isNaN(Date.parse(state.last_updated)) ? state.last_updated : undefined;
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
  const timestamp = latestObservedAt([batteryLevel, batteryState, steps, location]);
  const observedAtByField = {
    ...(batteryPercent === undefined || !stateTimestamp(batteryLevel) ? {} : { battery_percent: stateTimestamp(batteryLevel) }),
    ...(!["charging", "full", "not charging"].includes(chargingState) || !stateTimestamp(batteryState) ? {} : { charging: stateTimestamp(batteryState) }),
    ...(lowPowerMode === undefined || !stateTimestamp(batteryState) ? {} : { low_power_mode: stateTimestamp(batteryState) }),
    ...(stepCount === undefined || !stateTimestamp(steps) ? {} : { steps: stateTimestamp(steps) }),
    ...(zone === undefined || !stateTimestamp(location) ? {} : { zone_name: stateTimestamp(location) })
  };
  return {
    ...(batteryPercent === undefined ? {} : { battery_percent: batteryPercent }),
    ...(!["charging", "full", "not charging"].includes(chargingState) ? {} : { charging: chargingState !== "not charging" }),
    ...(lowPowerMode === undefined ? {} : { low_power_mode: lowPowerMode }),
    ...(timestamp ? { observed_at: timestamp } : {}),
    ...(Object.keys(observedAtByField).length ? { observed_at_by_field: observedAtByField } : {}),
    ...(stepCount === undefined ? {} : { steps: stepCount }),
    ...(zone ? { zone_name: zone } : {})
  };
}

function binaryState(state, trueValues, falseValues) {
  const normalized = typeof state?.state === "string" ? state.state.trim().toLocaleLowerCase("en-US") : "";
  if (trueValues.includes(normalized)) return true;
  if (falseValues.includes(normalized)) return false;
  return undefined;
}

function serviceDueState(state) {
  const value = typeof state?.state === "string" ? state.state.trim() : "";
  return /^\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function numericVehicleState(state, minimum, maximum, allowedUnits = null) {
  if (allowedUnits && !allowedUnits.includes(state?.attributes?.unit_of_measurement)) return undefined;
  return numericState(state, minimum, maximum);
}

export function vehicleStatusFromStates(states, config) {
  if (!Array.isArray(states) || !config?.vehicle) return null;
  const byId = new Map(states.filter((state) => state && typeof state.entity_id === "string").map((state) => [state.entity_id, state]));
  const source = Object.fromEntries(Object.entries(config.vehicle).map(([key, entityId]) => [key, byId.get(entityId)]));
  const fuelPercent = numericVehicleState(source.fuelPercentEntityId, 0, 100, ["%"]);
  const rangeKilometers = numericVehicleState(source.rangeKilometersEntityId, 0, 5_000, ["km"]);
  const mileageKilometers = numericVehicleState(source.mileageKilometersEntityId, 0, 2_000_000, ["km"]);
  const warningCount = numericState(source.warningCountEntityId, 0, 100);
  const locked = binaryState(source.lockedEntityId, ["locked", "on"], ["unlocked", "off"]);
  const doorsOpen = binaryState(source.doorsOpenEntityId, ["open", "on", "problem"], ["closed", "off", "ok"]);
  const windowsOpen = binaryState(source.windowsOpenEntityId, ["open", "on", "problem"], ["closed", "off", "ok"]);
  const zone = zoneName(source.locationEntityId?.state);
  const serviceDue = serviceDueState(source.serviceDueEntityId);
  const values = {
    ...(doorsOpen === undefined ? {} : { doors_open: doorsOpen }),
    ...(fuelPercent === undefined ? {} : { fuel_percent: fuelPercent }),
    ...(locked === undefined ? {} : { locked }),
    ...(zone ? { zone_name: zone } : {}),
    ...(mileageKilometers === undefined ? {} : { mileage_kilometers: mileageKilometers }),
    ...(rangeKilometers === undefined ? {} : { range_kilometers: rangeKilometers }),
    ...(serviceDue === undefined ? {} : { service_due_at: serviceDue }),
    ...(warningCount === undefined ? {} : { warning_count: warningCount }),
    ...(windowsOpen === undefined ? {} : { windows_open: windowsOpen })
  };
  const fieldSources = {
    doors_open: source.doorsOpenEntityId,
    fuel_percent: source.fuelPercentEntityId,
    locked: source.lockedEntityId,
    zone_name: source.locationEntityId,
    mileage_kilometers: source.mileageKilometersEntityId,
    range_kilometers: source.rangeKilometersEntityId,
    service_due_at: source.serviceDueEntityId,
    warning_count: source.warningCountEntityId,
    windows_open: source.windowsOpenEntityId
  };
  const observedAtByField = Object.fromEntries(Object.keys(values).flatMap((key) => {
    const timestamp = fieldSources[key]?.last_updated;
    return typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp)) ? [[key, timestamp]] : [];
  }));
  return Object.keys(values).length === 0 ? null : {
    ...values,
    ...(Object.keys(observedAtByField).length ? { observed_at_by_field: observedAtByField } : {}),
    ...(observedAt(Object.values(fieldSources)) ? { observed_at: observedAt(Object.values(fieldSources)) } : {})
  };
}
