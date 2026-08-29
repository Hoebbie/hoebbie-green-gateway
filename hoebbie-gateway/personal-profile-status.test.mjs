import assert from "node:assert/strict";
import test from "node:test";
import { personalProfileStatusConfig, personalProfileStatusFromStates } from "./personal-profile-status.mjs";

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

test("projects only the approved Companion values and a conservative timestamp", () => {
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
    observed_at: "2026-08-29T11:56:00Z",
    steps: 7842,
    zone_name: "Zuhause"
  });
  assert.equal(JSON.stringify(result).includes("latitude"), false);
  assert.equal(JSON.stringify(result).includes("Friedrich"), false);
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
