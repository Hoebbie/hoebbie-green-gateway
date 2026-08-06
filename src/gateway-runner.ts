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

export interface ActiveEntityCommand { action: "turn_on" | "turn_off" | "open" | "close" | "stop" | "set_position"; commandId: string; entityId: string; kind: "light" | "cover" | "switch"; targetPosition?: number; }
export interface ActiveEntityCommandApi { claimEntity(): Promise<ActiveEntityCommand | null>; completeEntity(input: { commandId: string; errorCode?: string; observedPosition?: number; observedState?: string; success: boolean }): Promise<void>; }

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
      await this.commandApi.completeEntity({ commandId: command.commandId, observedPosition: position, observedState: state.state, success: true });
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
    if (!response.ok || !data || typeof data.commandId !== "string" || typeof data.entityId !== "string" || !["light", "cover", "switch"].includes(data.kind) || !["turn_on", "turn_off", "open", "close", "stop", "set_position"].includes(data.action)) throw new Error("Der Green-Gateway konnte keinen gültigen Geräteauftrag abrufen.");
    return data;
  }

  async completeEntity(input: { commandId: string; errorCode?: string; observedPosition?: number; observedState?: string; success: boolean }): Promise<void> {
    const response = await this.request({ mode: "entity_complete", ...input });
    if (!response.ok) throw new Error("Der Green-Gateway konnte das Geräteergebnis nicht sicher zurückmelden.");
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
