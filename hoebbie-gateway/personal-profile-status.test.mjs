import assert from "node:assert/strict";
import test from "node:test";
import { personalProfileStatusConfig, personalProfileStatusFromStates, vehicleStatusFromStates } from "./personal-profile-status.mjs";

const configJson = JSON.stringify({
  battery_level_entity_id: "sensor.lars_iphone_battery_level",
  battery_state_entity_id: "sensor.lars_iphone_battery_state",
  location_entity_id: "device_tracker.lars_iphone",
  profile_key: "profile-lars",
  steps_entity_id: "sensor.lars_iphone_steps"
});

test("requires an explicit, exact Lars Companion entity mapping", () => {
  assert.equal(personalProfileStatusConfig("{}"), null);
  assert.throws(() => personalProfileStatusConfig('{"profile_key":"profile-nathalie"}'), /profile_status_config_invalid/);
  assert.throws(() => personalProfileStatusConfig(configJson.replace(/}$/, ',"latitude_entity_id":"sensor.location"}')), /profile_status_config_invalid/);
  assert.deepEqual(personalProfileStatusConfig(configJson), {
    batteryLevelEntityId: "sensor.lars_iphone_battery_level",
    batteryStateEntityId: "sensor.lars_iphone_battery_state",
    locationEntityId: "device_tracker.lars_iphone",
    profileKey: "profile-lars",
    stepsEntityId: "sensor.lars_iphone_steps"
  });
});

test("projects only approved Companion values with independent source timestamps", () => {
  const config = personalProfileStatusConfig(configJson);
  const result = personalProfileStatusFromStates([
    { entity_id: "sensor.lars_iphone_battery_level", last_updated: "2026-08-29T11:58:00Z", state: "74" },
    { attributes: { "Low Power Mode": true }, entity_id: "sensor.lars_iphone_battery_state", last_updated: "2026-08-29T11:57:00Z", state: "Charging" },
    { entity_id: "sensor.lars_iphone_steps", last_updated: "2026-08-29T11:59:00Z", state: "7842" },
    { attributes: { latitude: 53.1, longitude: 10.2 }, entity_id: "device_tracker.lars_iphone", last_updated: "2026-08-29T11:56:00Z", state: "home" },
    { entity_id: "sensor.private_address", state: "Friedrich-Hebbel-Straße" }
  ], config);
  assert.deepEqual(result, {
    battery_percent: 74,
    charging: true,
    low_power_mode: true,
    observed_at: "2026-08-29T11:59:00Z",
    observed_at_by_field: {
      battery_percent: "2026-08-29T11:58:00Z",
      charging: "2026-08-29T11:57:00Z",
      low_power_mode: "2026-08-29T11:57:00Z",
      steps: "2026-08-29T11:59:00Z",
      zone_name: "2026-08-29T11:56:00Z"
    },
    steps: 7842,
    zone_name: "Zuhause"
  });
  assert.equal(JSON.stringify(result).includes("latitude"), false);
  assert.equal(JSON.stringify(result).includes("Friedrich"), false);
});

test("prefers Home Assistant last_reported and falls back to last_updated", () => {
  const config = personalProfileStatusConfig(configJson);
  const result = personalProfileStatusFromStates([
    { entity_id: "sensor.lars_iphone_battery_level", last_reported: "2026-08-29T12:03:00Z", last_updated: "2026-08-29T11:58:00Z", state: "74" },
    { entity_id: "device_tracker.lars_iphone", last_updated: "2026-08-29T12:01:00Z", state: "home" }
  ], config);
  assert.deepEqual(result, {
    battery_percent: 74,
    observed_at: "2026-08-29T12:03:00Z",
    observed_at_by_field: {
      battery_percent: "2026-08-29T12:03:00Z",
      zone_name: "2026-08-29T12:01:00Z"
    },
    zone_name: "Zuhause"
  });
});

test("maps approved zones and omits unavailable sensor values", () => {
  const config = personalProfileStatusConfig(configJson);
  assert.deepEqual(personalProfileStatusFromStates([
    { entity_id: "sensor.lars_iphone_battery_level", state: "unavailable" },
    { attributes: {}, entity_id: "sensor.lars_iphone_battery_state", state: "unavailable" },
    { entity_id: "sensor.lars_iphone_steps", state: "unknown" },
    { entity_id: "device_tracker.lars_iphone", state: "Südsee-Camp" }
  ], config), { zone_name: "Arbeit" });
  assert.deepEqual(personalProfileStatusFromStates([
    { entity_id: "device_tracker.lars_iphone", state: "Padeln" }
  ], config), { zone_name: "Padeln" });
  assert.deepEqual(personalProfileStatusFromStates([
    { entity_id: "device_tracker.lars_iphone", state: "not_home" }
  ], config), { zone_name: "Unterwegs" });
});

test("projects an explicitly configured vehicle without credentials or coordinates", () => {
  const config = personalProfileStatusConfig(JSON.stringify({
    ...JSON.parse(configJson),
    vehicle_entity_ids: {
      doors_open_entity_id: "binary_sensor.tiguan_doors_open",
      fuel_percent_entity_id: "sensor.tiguan_fuel_level",
      location_entity_id: "device_tracker.tiguan",
      locked_entity_id: "lock.tiguan",
      mileage_kilometers_entity_id: "sensor.tiguan_odometer",
      range_kilometers_entity_id: "sensor.tiguan_range",
      service_due_entity_id: "sensor.tiguan_service_due",
      warning_count_entity_id: "sensor.tiguan_warnings",
      windows_open_entity_id: "binary_sensor.tiguan_windows_open"
    }
  }));
  const result = vehicleStatusFromStates([
    { attributes: { data_captured_at: "2026-08-29T13:51:00Z", unit_of_measurement: "%" }, entity_id: "sensor.tiguan_fuel_level", last_updated: "2026-08-29T14:00:00Z", state: "63" },
    { attributes: { data_captured_at: "invalid", unit_of_measurement: "km" }, entity_id: "sensor.tiguan_range", last_updated: "2026-08-29T13:59:00Z", state: "510" },
    { attributes: { unit_of_measurement: "km" }, entity_id: "sensor.tiguan_odometer", last_updated: "2026-08-29T13:58:00Z", state: "42123" },
    { attributes: { latitude: 53.1, longitude: 10.2 }, entity_id: "device_tracker.tiguan", last_updated: "2026-08-29T13:57:00Z", state: "home" },
    { entity_id: "lock.tiguan", last_updated: "2026-08-29T13:56:00Z", state: "locked" },
    { entity_id: "binary_sensor.tiguan_doors_open", last_updated: "2026-08-29T13:55:00Z", state: "off" },
    { entity_id: "binary_sensor.tiguan_windows_open", last_updated: "2026-08-29T13:54:00Z", state: "on" },
    { entity_id: "sensor.tiguan_warnings", last_updated: "2026-08-29T13:53:00Z", state: "1" },
    { entity_id: "sensor.tiguan_service_due", last_updated: "2026-08-29T13:52:00Z", state: "2027-02-18" }
  ], config);
  assert.deepEqual(result, {
    doors_open: false,
    fuel_percent: 63,
    locked: true,
    mileage_kilometers: 42123,
    observed_at: "2026-08-29T13:51:00Z",
    observed_at_by_field: {
      doors_open: "2026-08-29T13:55:00Z",
      fuel_percent: "2026-08-29T13:51:00Z",
      locked: "2026-08-29T13:56:00Z",
      mileage_kilometers: "2026-08-29T13:58:00Z",
      range_kilometers: "2026-08-29T13:59:00Z",
      service_due_at: "2026-08-29T13:52:00Z",
      warning_count: "2026-08-29T13:53:00Z",
      windows_open: "2026-08-29T13:54:00Z",
      zone_name: "2026-08-29T13:57:00Z"
    },
    range_kilometers: 510,
    service_due_at: "2027-02-18",
    warning_count: 1,
    windows_open: true,
    zone_name: "Zuhause"
  });
  assert.equal(JSON.stringify(result).includes("latitude"), false);
});

test("rejects unknown or credential-shaped vehicle configuration", () => {
  assert.throws(() => personalProfileStatusConfig(JSON.stringify({ ...JSON.parse(configJson), vehicle_entity_ids: { username: "lars@example.test" } })), /profile_status_config_invalid/);
  assert.throws(() => personalProfileStatusConfig(JSON.stringify({ ...JSON.parse(configJson), vehicle_entity_ids: { fuel_percent_entity_id: "text.tiguan_password" } })), /profile_status_config_invalid/);
  assert.throws(() => personalProfileStatusConfig(JSON.stringify({ ...JSON.parse(configJson), vehicle_entity_ids: { doors_open_entity_ids: [] } })), /profile_status_config_invalid/);
  assert.throws(() => personalProfileStatusConfig(JSON.stringify({ ...JSON.parse(configJson), vehicle_entity_ids: { doors_open_entity_id: "binary_sensor.tiguan_door", doors_open_entity_ids: ["binary_sensor.tiguan_door"] } })), /profile_status_config_invalid/);
  assert.throws(() => personalProfileStatusConfig(JSON.stringify({ ...JSON.parse(configJson), vehicle_entity_ids: { observed_at_entity_id: "binary_sensor.tiguan_snapshot" } })), /profile_status_config_invalid/);
});

test("uses the integration snapshot time for overall VW freshness without rewriting field capture times", () => {
  const config = personalProfileStatusConfig(JSON.stringify({
    ...JSON.parse(configJson),
    vehicle_entity_ids: {
      fuel_percent_entity_id: "sensor.tiguan_fuel_level",
      observed_at_entity_id: "sensor.tiguan_dataset_created"
    }
  }));
  assert.deepEqual(vehicleStatusFromStates([
    { attributes: { data_captured_at: "2026-08-30T15:32:21+00:00", unit_of_measurement: "%" }, entity_id: "sensor.tiguan_fuel_level", state: "99" },
    { entity_id: "sensor.tiguan_dataset_created", state: "2026-08-30T17:43:48+00:00" }
  ], config), {
    fuel_percent: 99,
    observed_at: "2026-08-30T17:43:48+00:00",
    observed_at_by_field: { fuel_percent: "2026-08-30T15:32:21+00:00" }
  });
});

test("discovers one unambiguous Data Act snapshot sensor when the optional mapping is absent", () => {
  const config = personalProfileStatusConfig(JSON.stringify({
    ...JSON.parse(configJson),
    vehicle_entity_ids: {
      fuel_percent_entity_id: "sensor.tiguan_fuel_level"
    }
  }));
  assert.deepEqual(vehicleStatusFromStates([
    { attributes: { data_captured_at: "2026-08-30T15:32:21+00:00", unit_of_measurement: "%" }, entity_id: "sensor.tiguan_fuel_level", state: "99" },
    { entity_id: "sensor.tiguan_elegance_datensatz_erzeugt", state: "2026-08-30T17:43:48+00:00" }
  ], config), {
    fuel_percent: 99,
    observed_at: "2026-08-30T17:43:48+00:00",
    observed_at_by_field: { fuel_percent: "2026-08-30T15:32:21+00:00" }
  });
});

test("keeps the conservative field timestamp when snapshot discovery is ambiguous", () => {
  const config = personalProfileStatusConfig(JSON.stringify({
    ...JSON.parse(configJson),
    vehicle_entity_ids: {
      fuel_percent_entity_id: "sensor.tiguan_fuel_level"
    }
  }));
  assert.equal(vehicleStatusFromStates([
    { attributes: { data_captured_at: "2026-08-30T15:32:21+00:00", unit_of_measurement: "%" }, entity_id: "sensor.tiguan_fuel_level", state: "99" },
    { entity_id: "sensor.tiguan_elegance_datensatz_erzeugt", state: "2026-08-30T17:43:48+00:00" },
    { entity_id: "sensor.golf_datensatz_erzeugt", state: "2026-08-30T17:44:00+00:00" }
  ], config).observed_at, "2026-08-30T15:32:21+00:00");
});

test("aggregates the real VW Data Act door, window and lock semantics safely", () => {
  const config = personalProfileStatusConfig(JSON.stringify({
    ...JSON.parse(configJson),
    vehicle_entity_ids: {
      doors_open_entity_ids: ["binary_sensor.tiguan_door_left", "binary_sensor.tiguan_tailgate"],
      fuel_percent_entity_id: "sensor.tiguan_fuel_level",
      locked_entity_ids: ["binary_sensor.tiguan_lock_left", "binary_sensor.tiguan_lock_right"],
      mileage_kilometers_entity_id: "sensor.tiguan_odometer",
      range_kilometers_entity_id: "sensor.tiguan_range",
      service_due_entity_id: "sensor.tiguan_service_due",
      windows_open_entity_ids: ["binary_sensor.tiguan_window_left", "binary_sensor.tiguan_window_right"]
    }
  }));
  const capturedAt = "2026-08-30T12:05:55+00:00";
  const result = vehicleStatusFromStates([
    { attributes: { data_captured_at: capturedAt, device_class: "door" }, entity_id: "binary_sensor.tiguan_door_left", state: "off" },
    { attributes: { data_captured_at: capturedAt, device_class: "door" }, entity_id: "binary_sensor.tiguan_tailgate", state: "off" },
    { attributes: { data_captured_at: capturedAt, device_class: "lock" }, entity_id: "binary_sensor.tiguan_lock_left", state: "on" },
    { attributes: { data_captured_at: capturedAt, device_class: "lock" }, entity_id: "binary_sensor.tiguan_lock_right", state: "on" },
    { attributes: { data_captured_at: capturedAt, device_class: "window" }, entity_id: "binary_sensor.tiguan_window_left", state: "off" },
    { attributes: { data_captured_at: capturedAt, device_class: "window" }, entity_id: "binary_sensor.tiguan_window_right", state: "off" },
    { attributes: { data_captured_at: capturedAt, unit_of_measurement: "%" }, entity_id: "sensor.tiguan_fuel_level", state: "100" },
    { attributes: { data_captured_at: capturedAt, unit_of_measurement: "km" }, entity_id: "sensor.tiguan_range", state: "860" },
    { attributes: { data_captured_at: capturedAt, unit_of_measurement: "km" }, entity_id: "sensor.tiguan_odometer", state: "26746" },
    { entity_id: "sensor.tiguan_service_due", last_updated: "2026-08-30T14:56:42+00:00", state: "2027-01-09T23:00:00+00:00" }
  ], config);
  assert.deepEqual(result, {
    doors_open: false,
    fuel_percent: 100,
    locked: false,
    mileage_kilometers: 26746,
    observed_at: capturedAt,
    observed_at_by_field: {
      doors_open: capturedAt,
      fuel_percent: capturedAt,
      locked: capturedAt,
      mileage_kilometers: capturedAt,
      range_kilometers: capturedAt,
      service_due_at: "2026-08-30T14:56:42+00:00",
      windows_open: capturedAt
    },
    range_kilometers: 860,
    service_due_at: "2027-01-09T23:00:00+00:00",
    windows_open: false
  });
});

test("does not claim every opening is closed or locked while an aggregate member is unknown", () => {
  const config = personalProfileStatusConfig(JSON.stringify({
    ...JSON.parse(configJson),
    vehicle_entity_ids: {
      doors_open_entity_ids: ["binary_sensor.tiguan_door_left", "binary_sensor.tiguan_door_right"],
      locked_entity_ids: ["binary_sensor.tiguan_lock_left", "binary_sensor.tiguan_lock_right"]
    }
  }));
  assert.equal(vehicleStatusFromStates([
    { attributes: { device_class: "door" }, entity_id: "binary_sensor.tiguan_door_left", state: "off" },
    { attributes: { device_class: "door" }, entity_id: "binary_sensor.tiguan_door_right", state: "unknown" },
    { attributes: { device_class: "lock" }, entity_id: "binary_sensor.tiguan_lock_left", state: "off" },
    { attributes: { device_class: "lock" }, entity_id: "binary_sensor.tiguan_lock_right", state: "unknown" }
  ], config), null);
  assert.deepEqual(vehicleStatusFromStates([
    { attributes: { device_class: "door" }, entity_id: "binary_sensor.tiguan_door_left", state: "on" },
    { attributes: { device_class: "door" }, entity_id: "binary_sensor.tiguan_door_right", state: "unknown" },
    { attributes: { device_class: "lock" }, entity_id: "binary_sensor.tiguan_lock_left", state: "on" },
    { attributes: { device_class: "lock" }, entity_id: "binary_sensor.tiguan_lock_right", state: "unknown" }
  ], config), { doors_open: true, locked: false });
});
