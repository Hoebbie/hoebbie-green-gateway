import {
  HomeAssistantGatewayError,
  type FetchLike,
  type HomeAssistantEntityClient,
  type HomeAssistantPilotClient,
  type PilotLightAction
} from "./home-assistant-client.js";

export interface PilotCommand {
  action: PilotLightAction;
  commandId: string;
}

export interface GatewayCommandApi {
  claim(): Promise<PilotCommand | null>;
  complete(input: { commandId: string; errorCode?: string; observedState?: string; success: boolean }): Promise<void>;
}

export interface GatewayRealtimeSession {
  accessToken: string;
  expiresAt: number;
  gatewayId: string;
  publishableKey: string;
  supabaseUrl: string;
}

export interface GatewayRealtimeSessionApi {
  realtimeSession(): Promise<GatewayRealtimeSession>;
}

export interface ActiveEntityCommand { action: "turn_on" | "turn_off" | "open" | "close" | "stop" | "set_position" | "set_light"; commandId: string; entityId: string; kind: "light" | "cover" | "switch"; targetBrightness?: number; targetColorTemperature?: number; targetPosition?: number; targetRgbColor?: readonly [number, number, number]; }
export interface ActiveEntityCommandApi { claimEntity(): Promise<ActiveEntityCommand | null>; completeEntity(input: { commandId: string; errorCode?: string; observedBrightness?: number; observedColorTemperature?: number; observedPosition?: number; observedRgbColor?: readonly [number, number, number]; observedState?: string; success: boolean }): Promise<void>; }

export class HomeAssistantGatewayRunner {
  constructor(
    private readonly commandApi: GatewayCommandApi,
    private readonly homeAssistant: HomeAssistantPilotClient
  ) {}

  async runOnce(): Promise<"idle" | "completed" | "failed"> {
    const command = await this.commandApi.claim();
    if (!command) return "idle";
    try {
      const state = await this.homeAssistant.setAndVerify(command.action);
      await this.commandApi.complete({ commandId: command.commandId, observedState: state.state, success: true });
      return "completed";
    } catch (error) {
      const code = error instanceof HomeAssistantGatewayError
        ? error.code
        : typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? (error as { code: string }).code
          : "gateway.unexpected_error";
      await this.commandApi.complete({ commandId: command.commandId, errorCode: code, success: false });
      return "failed";
    }
  }
}

export class HomeAssistantEntityRunner {
  constructor(private readonly commandApi: ActiveEntityCommandApi, private readonly homeAssistant: HomeAssistantEntityClient) {}
  async runOnce(): Promise<"idle" | "completed" | "failed"> {
    const command = await this.commandApi.claimEntity();
    if (!command) return "idle";
    try {
      const state = await this.homeAssistant.setAndVerify(command);
      const position = typeof state.attributes.current_position === "number" ? Math.round(state.attributes.current_position) : undefined;
      const brightness = brightnessPercent(state.attributes.brightness);
      const colorTemperature = colorTemperatureKelvin(state.attributes);
      const rgbColor = rgb(state.attributes.rgb_color);
      await this.commandApi.completeEntity({ commandId: command.commandId, observedBrightness: brightness, observedColorTemperature: colorTemperature, observedPosition: position, observedRgbColor: rgbColor, observedState: state.state, success: true });
      return "completed";
    } catch (error) {
      await this.commandApi.completeEntity({ commandId: command.commandId, errorCode: error instanceof HomeAssistantGatewayError ? error.code : "gateway.unexpected_error", success: false });
      return "failed";
    }
  }
}

interface GatewayApiEnvironment {
  gatewayKey: string;
  gatewayUrl: string;
}

function safeGatewayUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("HOEBBIE_GATEWAY_URL muss HTTPS verwenden.");
  return url.toString().replace(/\/$/, "");
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class HttpGatewayCommandApi implements GatewayCommandApi {
  private readonly environment: GatewayApiEnvironment;

  constructor(environment: GatewayApiEnvironment, private readonly fetcher: FetchLike = fetch) {
    if (environment.gatewayKey.trim().length < 32) throw new Error("HOEBBIE_GATEWAY_KEY ist ungültig.");
    this.environment = { ...environment, gatewayUrl: safeGatewayUrl(environment.gatewayUrl) };
  }

  async claim(): Promise<PilotCommand | null> {
    const response = await this.request({ mode: "claim" });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null) as PilotCommand | null;
    if (!response.ok || !data || typeof data.commandId !== "string" || (data.action !== "on" && data.action !== "off")) {
      throw new Error("Der Green-Gateway konnte keinen gültigen Auftrag abrufen.");
    }
    return data;
  }

  async complete(input: { commandId: string; errorCode?: string; observedState?: string; success: boolean }): Promise<void> {
    const response = await this.request({ mode: "complete", ...input });
    if (!response.ok) throw new Error("Der Green-Gateway konnte das Ergebnis nicht sicher zurückmelden.");
  }

  async claimEntity(): Promise<ActiveEntityCommand | null> {
    const response = await this.request({ mode: "entity_claim" });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null) as ActiveEntityCommand | null;
    if (!response.ok || !data || typeof data.commandId !== "string" || typeof data.entityId !== "string" || !["light", "cover", "switch"].includes(data.kind) || !["turn_on", "turn_off", "open", "close", "stop", "set_position", "set_light"].includes(data.action) || (data.action === "set_position" && !percentage(data.targetPosition)) || (data.action === "set_light" && !percentage(data.targetBrightness))) throw new Error("Der Green-Gateway konnte keinen gültigen Geräteauftrag abrufen.");
    return data;
  }

  async completeEntity(input: { commandId: string; errorCode?: string; observedBrightness?: number; observedColorTemperature?: number; observedPosition?: number; observedRgbColor?: readonly [number, number, number]; observedState?: string; success: boolean }): Promise<void> {
    const response = await this.request({ mode: "entity_complete", ...input });
    if (!response.ok) throw new Error("Der Green-Gateway konnte das Geräteergebnis nicht sicher zurückmelden.");
  }

  async realtimeSession(): Promise<GatewayRealtimeSession> {
    const response = await this.request({ mode: "realtime_session" });
    const data = await response.json().catch(() => null) as Partial<GatewayRealtimeSession> | null;
    if (!response.ok || !data || typeof data.accessToken !== "string" || data.accessToken.length < 80 || typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt) || typeof data.gatewayId !== "string" || !uuid(data.gatewayId) || typeof data.publishableKey !== "string" || data.publishableKey.length < 10 || typeof data.supabaseUrl !== "string") {
      throw new Error("Der Green-Gateway konnte keine sichere Echtzeitverbindung einrichten.");
    }
    return {
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
      gatewayId: data.gatewayId,
      publishableKey: data.publishableKey,
      supabaseUrl: safeGatewayUrl(data.supabaseUrl)
    };
  }

  private async request(body: Record<string, unknown>): Promise<Response> {
    return this.fetcher(this.environment.gatewayUrl, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-Hoebbie-Gateway-Key": this.environment.gatewayKey },
      method: "POST",
      signal: AbortSignal.timeout(8_000)
    }).catch(() => { throw new Error("Die sichere Verbindung zum Hoebbie-Server ist nicht erreichbar."); });
  }
}

function brightnessPercent(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 255 ? Math.round((value / 255) * 100) : undefined;
}

function percentage(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function colorTemperatureKelvin(attributes: Record<string, unknown>): number | undefined {
  if (typeof attributes.color_temp_kelvin === "number" && Number.isFinite(attributes.color_temp_kelvin)) return Math.round(attributes.color_temp_kelvin);
  if (typeof attributes.color_temp === "number" && Number.isFinite(attributes.color_temp) && attributes.color_temp > 0) return Math.round(1_000_000 / attributes.color_temp);
  return undefined;
}

function rgb(value: unknown): [number, number, number] | undefined {
  return Array.isArray(value) && value.length === 3 && value.every((component) => typeof component === "number" && Number.isInteger(component) && component >= 0 && component <= 255)
    ? [value[0] as number, value[1] as number, value[2] as number]
    : undefined;
}
