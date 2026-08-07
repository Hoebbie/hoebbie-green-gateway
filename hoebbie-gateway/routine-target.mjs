export function percentage(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

export function colorTemperature(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 10000;
}

export function rgbColor(value) {
  return Array.isArray(value) && value.length === 3 && value.every((component) => Number.isInteger(component) && component >= 0 && component <= 255);
}

export function currentBrightness(attributes) {
  const value = typeof attributes?.brightness === "number" ? attributes.brightness : Number(attributes?.brightness);
  return Number.isFinite(value) && value >= 0 && value <= 255 ? Math.round((value / 255) * 100) : undefined;
}

export function currentColorTemperature(attributes) {
  const kelvin = typeof attributes?.color_temp_kelvin === "number" ? attributes.color_temp_kelvin : Number(attributes?.color_temp_kelvin);
  if (Number.isFinite(kelvin) && kelvin >= 1000 && kelvin <= 10000) return Math.round(kelvin);
  const mired = typeof attributes?.color_temp === "number" ? attributes.color_temp : Number(attributes?.color_temp);
  return Number.isFinite(mired) && mired > 0 ? Math.round(1_000_000 / mired) : undefined;
}

export function currentRgbColor(attributes) {
  const value = attributes?.rgb_color;
  return Array.isArray(value) && value.length === 3 && value.every((component) => Number.isInteger(component) && component >= 0 && component <= 255)
    ? [value[0], value[1], value[2]]
    : undefined;
}

export function lightTargetMatches(state, command) {
  if (state?.state !== "on" || !percentage(command.targetBrightness)) return false;
  const brightness = currentBrightness(state.attributes);
  if (brightness === undefined || Math.abs(brightness - command.targetBrightness) > 2) return false;
  if (colorTemperature(command.targetColorTemperature)) {
    const temperature = currentColorTemperature(state.attributes);
    return temperature !== undefined && Math.abs(temperature - command.targetColorTemperature) <= 250;
  }
  const rgb = currentRgbColor(state.attributes);
  return Boolean(rgb && rgbColor(command.targetRgbColor) && rgb.every((component, index) => Math.abs(component - command.targetRgbColor[index]) <= 12));
}
