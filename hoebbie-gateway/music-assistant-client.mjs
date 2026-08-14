export class MusicAssistantGatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function normalizedUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new MusicAssistantGatewayError("music_assistant.invalid_url", "Die lokale Music-Assistant-Adresse ist ungültig.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MusicAssistantGatewayError("music_assistant.invalid_url", "Die lokale Music-Assistant-Adresse benötigt HTTP oder HTTPS.");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed;
}

function playerId(value) {
  // Native providers use different identifier schemes. The value remains a
  // JSON argument to fixed commands only; it is never interpreted as a URL or
  // executable command.
  return typeof value === "string" && /^[A-Za-z0-9:._/-]{1,200}$/.test(value) ? value : null;
}

function displayName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= 1 && normalized.length <= 120 ? normalized : null;
}

function playerFromResponse(value) {
  if (!value || typeof value !== "object") return null;
  const id = playerId(value.player_id);
  // Music Assistant 2.8 exposes the public PlayerState model with `name`
  // and `playback_state`. Older server releases used `display_name` and
  // `state`; accepting both keeps the read-only adapter version-tolerant.
  const name = displayName(value.name ?? value.display_name);
  if (!id || !name || typeof value.available !== "boolean" || typeof value.powered !== "boolean") return null;
  const rawState = value.playback_state ?? value.state;
  const state = typeof rawState === "string" ? rawState.toUpperCase() : "";
  const volume = typeof value.volume_level === "number" && Number.isFinite(value.volume_level) && value.volume_level >= 0 && value.volume_level <= 100
    ? Math.round(value.volume_level)
    : null;
  return { available: value.available, displayName: name, id, isPlaying: state === "PLAYING", powered: value.powered, volume };
}

export function validMusicAssistantConfig(config) {
  const accessToken = typeof config?.accessToken === "string" ? config.accessToken.trim() : "";
  if (accessToken.length < 24 || accessToken.length > 2048 || /\s/.test(accessToken)) {
    throw new MusicAssistantGatewayError("music_assistant.invalid_token", "Der lokale Music-Assistant-Zugang ist ungültig.");
  }
  const url = normalizedUrl(config?.baseUrl);
  return { accessToken, baseUrl: url.toString().replace(/\/$/, "") };
}

/**
 * This deliberately exposes discovery only. No app-originated free command,
 * playback, queue or grouping request can reach Music Assistant through it.
 */
export class MusicAssistantClient {
  #sequence = 0;

  constructor(config, fetcher = fetch) {
    this.config = validMusicAssistantConfig(config);
    this.fetcher = fetcher;
  }

  async listPlayers() {
    let response;
    try {
      response = await this.fetcher(`${this.config.baseUrl}/api`, {
        body: JSON.stringify({ args: {}, command: "players/all", message_id: String(++this.#sequence) }),
        headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new MusicAssistantGatewayError("music_assistant.connection_failed", "Music Assistant ist über die konfigurierte lokale Adresse nicht erreichbar.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new MusicAssistantGatewayError("music_assistant.authentication_failed", "Der Music-Assistant-Zugang wurde abgelehnt.");
    }
    if (!response.ok) {
      throw new MusicAssistantGatewayError(`music_assistant.api_http_${response.status}`, "Music Assistant hat die Zielabfrage nicht angenommen.");
    }
    const payload = await response.json().catch(() => null);
    // The HTTP JSON-RPC endpoint returns the command result itself. Keep the
    // `result` envelope as a compatibility fallback for older test doubles
    // and WebSocket-style clients, but never accept an arbitrary object.
    const result = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray(payload.result)
        ? payload.result
        : null;
    if (!result) {
      throw new MusicAssistantGatewayError("music_assistant.invalid_response", "Music Assistant hat eine ungültige Zielantwort geliefert.");
    }
    const players = [];
    for (const item of result) {
      const player = playerFromResponse(item);
      if (!player) throw new MusicAssistantGatewayError("music_assistant.invalid_response", "Music Assistant hat eine ungültige Zielantwort geliefert.");
      players.push(player);
    }
    return players;
  }
}
