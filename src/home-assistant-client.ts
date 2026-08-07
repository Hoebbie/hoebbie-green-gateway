export type PilotLightAction = "on" | "off";
export type ActiveEntityAction = "turn_on" | "turn_off" | "open" | "close" | "stop" | "set_position" | "set_light";
export type ActiveEntityKind = "light" | "cover" | "switch";

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistantGatewayConfig {
  accessToken: string;
  baseUrl: string;
  pilotEntityId: string;
}

export interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

export type Sleep = (milliseconds: number) => Promise<void>;

export class HomeAssistantGatewayError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const pilotEntityPattern = /^light\.[a-z0-9_]+$/;
const activeEntityPattern = /^(light|cover|switch)\.[a-z0-9_]+$/;

function normalizedUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HomeAssistantGatewayError("gateway.invalid_url", "Die lokale Home-Assistant-Adresse ist ungültig.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HomeAssistantGatewayError("gateway.invalid_url", "Die lokale Home-Assistant-Adresse benötigt HTTP oder HTTPS.");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed;
}

export function validateGatewayConfig(config: HomeAssistantGatewayConfig): HomeAssistantGatewayConfig {
  normalizedUrl(config.baseUrl);
  if (config.accessToken.trim().length < 24) {
    throw new HomeAssistantGatewayError("gateway.invalid_token", "Der lokale Home-Assistant-Zugang ist ungültig.");
  }
  if (!pilotEntityPattern.test(config.pilotEntityId)) {
    throw new HomeAssistantGatewayError("gateway.invalid_pilot", "Der Pilot muss genau eine Hue-Lichtentität sein.");
  }
  return { ...config, baseUrl: normalizedUrl(config.baseUrl).toString().replace(/\/$/, "") };
}

export class HomeAssistantPilotClient {
  private readonly config: HomeAssistantGatewayConfig;

  constructor(config: HomeAssistantGatewayConfig, private readonly fetcher: FetchLike = fetch) {
    this.config = validateGatewayConfig(config);
  }

  async readPilotState(): Promise<HomeAssistantState> {
    const response = await this.fetcher(
      `${this.config.baseUrl}/api/states/${encodeURIComponent(this.config.pilotEntityId)}`,
      { headers: { Authorization: `Bearer ${this.config.accessToken}` }, signal: AbortSignal.timeout(5_000) }
    ).catch(() => null);
    const state = response ? await response.json().catch(() => null) as HomeAssistantState | null : null;
    if (!response?.ok || !state || state.entity_id !== this.config.pilotEntityId) {
      throw new HomeAssistantGatewayError("gateway.state_unavailable", "Der Status des Pilotlichts konnte nicht gelesen werden.");
    }
    return state;
  }

  async setPilotState(action: PilotLightAction): Promise<void> {
    const response = await this.fetcher(
      `${this.config.baseUrl}/api/services/light/turn_${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ entity_id: this.config.pilotEntityId }),
        signal: AbortSignal.timeout(5_000)
      }
    ).catch(() => null);
    if (!response?.ok) {
      throw new HomeAssistantGatewayError("gateway.action_failed", "Home Assistant hat die Pilotaktion nicht ausgeführt.");
    }
  }

  async setAndVerify(action: PilotLightAction, sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))): Promise<HomeAssistantState> {
    await this.setPilotState(action);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = await this.readPilotState();
      if (state.state === action) return state;
      await sleep(500);
    }
    throw new HomeAssistantGatewayError("gateway.verification_failed", "Das Pilotlicht hat den erwarteten Zustand nicht bestätigt.");
  }
}

/** Executes only a command already validated and claimed by the Hoebbie server. */
export class HomeAssistantEntityClient {
  constructor(private readonly config: Pick<HomeAssistantGatewayConfig, "accessToken" | "baseUrl">, private readonly fetcher: FetchLike = fetch) {
    validateGatewayConfig({ ...config, pilotEntityId: "light.validation" });
  }

  async setAndVerify(command: { action: ActiveEntityAction; entityId: string; kind: ActiveEntityKind; targetBrightness?: number; targetColorTemperature?: number; targetPosition?: number; targetRgbColor?: readonly [number, number, number] }, sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))): Promise<HomeAssistantState> {
    if (!activeEntityPattern.test(command.entityId) || !["light", "cover", "switch"].includes(command.kind) || command.entityId.split(".")[0] !== command.kind) throw new HomeAssistantGatewayError("gateway.invalid_entity", "Der freigegebene Auftrag ist ungültig.");
    if ((command.action === "stop" || command.action === "set_position") && command.kind !== "cover") throw new HomeAssistantGatewayError("gateway.invalid_action", "Diese Aktion ist nur für Jalousien erlaubt.");
    if (command.action === "set_position" && (!Number.isInteger(command.targetPosition) || command.targetPosition! < 0 || command.targetPosition! > 100)) throw new HomeAssistantGatewayError("gateway.invalid_position", "Die Jalousieposition ist ungültig.");
    if (command.action === "set_light" && (command.kind !== "light" || !Number.isInteger(command.targetBrightness) || command.targetBrightness! < 0 || command.targetBrightness! > 100 || (!Number.isInteger(command.targetColorTemperature) && !isRgbColor(command.targetRgbColor)))) throw new HomeAssistantGatewayError("gateway.invalid_light_target", "Das Lichtziel ist ungültig.");
    const service = command.action === "turn_on" ? "turn_on" : command.action === "turn_off" ? "turn_off" : command.action === "open" ? "open_cover" : command.action === "close" ? "close_cover" : command.action === "stop" ? "stop_cover" : command.action === "set_position" ? "set_cover_position" : "turn_on";
    const domain = command.action === "turn_on" || command.action === "turn_off" || command.action === "set_light" ? command.kind : "cover";
    const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/api/services/${domain}/${service}`, { method: "POST", headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ entity_id: command.entityId, ...(command.action === "set_position" ? { position: command.targetPosition } : {}), ...(command.action === "set_light" ? { brightness_pct: command.targetBrightness, ...(Number.isInteger(command.targetColorTemperature) ? { color_temp_kelvin: command.targetColorTemperature } : { rgb_color: command.targetRgbColor }) } : {}) }), signal: AbortSignal.timeout(5_000) }).catch(() => null);
    if (!response?.ok) throw new HomeAssistantGatewayError("gateway.action_failed", "Home Assistant hat den Auftrag nicht ausgeführt.");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const state = await this.read(command.entityId);
      const position = typeof state.attributes.current_position === "number" ? Math.round(state.attributes.current_position) : null;
      const complete = command.action === "set_position" ? Math.abs((position ?? -1) - command.targetPosition!) <= 2 : command.action === "set_light" ? lightTargetMatches(state, command) : command.action === "stop" ? state.state !== "opening" && state.state !== "closing" : command.action === "open" ? state.state === "open" : command.action === "close" ? state.state === "closed" : state.state === (command.action === "turn_on" ? "on" : "off");
      if (complete) return state;
      await sleep(500);
    }
    throw new HomeAssistantGatewayError("gateway.verification_failed", "Der neue Gerätezustand wurde nicht bestätigt.");
  }

  private async read(entityId: string): Promise<HomeAssistantState> {
    const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/api/states/${encodeURIComponent(entityId)}`, { headers: { Authorization: `Bearer ${this.config.accessToken}` }, signal: AbortSignal.timeout(5_000) }).catch(() => null);
    const state = response ? await response.json().catch(() => null) as HomeAssistantState | null : null;
    if (!response?.ok || !state || state.entity_id !== entityId) throw new HomeAssistantGatewayError("gateway.state_unavailable", "Der Gerätestatus konnte nicht gelesen werden.");
    return state;
  }
}

function isRgbColor(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((component) => Number.isInteger(component) && component >= 0 && component <= 255);
}

function currentBrightnessPercent(state: HomeAssistantState): number | null {
  const value = state.attributes.brightness;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 255 ? Math.round((value / 255) * 100) : null;
}

function currentColorTemperatureKelvin(state: HomeAssistantState): number | null {
  const kelvin = state.attributes.color_temp_kelvin;
  if (typeof kelvin === "number" && Number.isFinite(kelvin)) return Math.round(kelvin);
  const mired = state.attributes.color_temp;
  return typeof mired === "number" && Number.isFinite(mired) && mired > 0 ? Math.round(1_000_000 / mired) : null;
}

function currentRgbColor(state: HomeAssistantState): readonly [number, number, number] | null {
  const value = state.attributes.rgb_color;
  return isRgbColor(value) ? value : null;
}

function lightTargetMatches(state: HomeAssistantState, command: { targetBrightness?: number; targetColorTemperature?: number; targetRgbColor?: readonly [number, number, number] }): boolean {
  const targetBrightness = command.targetBrightness;
  if (state.state !== "on" || typeof targetBrightness !== "number" || !Number.isInteger(targetBrightness)) return false;
  const brightness = currentBrightnessPercent(state);
  if (brightness === null || Math.abs(brightness - targetBrightness) > 2) return false;
  if (Number.isInteger(command.targetColorTemperature)) {
    const temperature = currentColorTemperatureKelvin(state);
    return temperature !== null && Math.abs(temperature - command.targetColorTemperature!) <= 250;
  }
  const rgb = currentRgbColor(state);
  const targetRgbColor = command.targetRgbColor;
  return Boolean(rgb && targetRgbColor && rgb.every((component, index) => Math.abs(component - targetRgbColor[index]!) <= 12));
}
