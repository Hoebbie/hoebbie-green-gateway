export type PilotLightAction = "on" | "off";

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
