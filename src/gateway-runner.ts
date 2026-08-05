import {
  HomeAssistantGatewayError,
  HomeAssistantPilotClient,
  type FetchLike,
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
      const code = error instanceof HomeAssistantGatewayError ? error.code : "gateway.unexpected_error";
      await this.commandApi.complete({ commandId: command.commandId, errorCode: code, success: false });
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

  private async request(body: Record<string, unknown>): Promise<Response> {
    return this.fetcher(this.environment.gatewayUrl, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-Hoebbie-Gateway-Key": this.environment.gatewayKey },
      method: "POST",
      signal: AbortSignal.timeout(8_000)
    }).catch(() => { throw new Error("Die sichere Verbindung zum Hoebbie-Server ist nicht erreichbar."); });
  }
}
