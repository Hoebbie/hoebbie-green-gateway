import assert from "node:assert/strict";
import test from "node:test";

import { currentBrightness, currentColorTemperature, lightTargetMatches } from "./routine-target.mjs";

test("converts Home Assistant brightness and mired temperature safely", () => {
  assert.equal(currentBrightness({ brightness: 179 }), 70);
  assert.equal(currentColorTemperature({ color_temp: 370 }), 2703);
});

test("only confirms a warm-white routine target after brightness and color read-back", () => {
  const command = { targetBrightness: 70, targetColorTemperature: 2700 };
  assert.equal(lightTargetMatches({ attributes: { brightness: 179, color_temp_kelvin: 2700 }, state: "on" }, command), true);
  assert.equal(lightTargetMatches({ attributes: { brightness: 179, color_temp_kelvin: 4000 }, state: "on" }, command), false);
});

test("only confirms the orange night light after its RGB target read-back", () => {
  const command = { targetBrightness: 10, targetRgbColor: [255, 100, 0] };
  assert.equal(lightTargetMatches({ attributes: { brightness: 26, rgb_color: [255, 100, 0] }, state: "on" }, command), true);
  assert.equal(lightTargetMatches({ attributes: { brightness: 26, rgb_color: [255, 160, 0] }, state: "on" }, command), false);
});
