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

export function validMusicCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.playerId === "string"
    && playerId(command.playerId)
    && (command.action === "pause" || command.action === "play"));
}

export function validMusicVolumeCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.playerId === "string"
    && playerId(command.playerId)
    && Number.isInteger(command.targetVolume)
    && command.targetVolume >= 0
    && command.targetVolume <= 100);
}

export function validMusicGroupCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.leaderPlayerId === "string"
    && playerId(command.leaderPlayerId)
    && Array.isArray(command.memberPlayerIds)
    && command.memberPlayerIds.length >= 2
    && command.memberPlayerIds.length <= 8
    && command.memberPlayerIds.every((id) => typeof id === "string" && playerId(id))
    && new Set(command.memberPlayerIds).size === command.memberPlayerIds.length
    && command.memberPlayerIds.includes(command.leaderPlayerId));
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
  const syncedTo = playerId(value.synced_to);
  const groupMembers = Array.isArray(value.group_members) && value.group_members.every((member) => typeof member === "string" && playerId(member))
    ? value.group_members : [];
  return { available: value.available, displayName: name, groupMembers, id, isPlaying: state === "PLAYING", powered: value.powered, syncedTo, volume };
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

  async setPlayback(command) {
    if (!validMusicCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_command", "Der freigegebene Wiedergabeauftrag ist ungültig.");
    const actionResult = await this.command(command.action === "pause" ? "players/cmd/pause" : "players/cmd/play", { player_id: command.playerId });
    if (!actionResult.ok) throw new MusicAssistantGatewayError("music_assistant.command_failed", "Music Assistant hat den Wiedergabeauftrag nicht ausgeführt.");
    const expectedIsPlaying = command.action === "play";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const player = await this.getPlayer(command.playerId);
      if (player.isPlaying === expectedIsPlaying) return player.isPlaying;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.verification_failed", "Music Assistant hat den neuen Wiedergabestatus nicht bestätigt.");
  }

  async setVolume(command) {
    if (!validMusicVolumeCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_command", "Der freigegebene Lautstärkeauftrag ist ungültig.");
    const actionResult = await this.command("players/cmd/volume_set", { player_id: command.playerId, volume_level: command.targetVolume });
    if (!actionResult.ok) throw new MusicAssistantGatewayError("music_assistant.command_failed", "Music Assistant hat den Lautstärkeauftrag nicht ausgeführt.");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const player = await this.getPlayer(command.playerId);
      if (player.volume === command.targetVolume) return player.volume;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.verification_failed", "Music Assistant hat die neue Lautstärke nicht bestätigt.");
  }

  async groupPlayers(command) {
    if (!validMusicGroupCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_group_command", "Der freigegebene Gruppenauftrag ist ungültig.");
    const followers = command.memberPlayerIds.filter((id) => id !== command.leaderPlayerId);
    for (const playerId of followers) {
      const actionResult = await this.command("players/cmd/group", { player_id: playerId, target_player: command.leaderPlayerId });
      if (!actionResult.ok) throw new MusicAssistantGatewayError("music_assistant.group_command_failed", "Music Assistant hat den Gruppenauftrag nicht ausgeführt.");
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const states = await Promise.all(command.memberPlayerIds.map((id) => this.getPlayer(id)));
      const leader = states.find((player) => player.id === command.leaderPlayerId);
      if (leader && states.filter((player) => player.id !== command.leaderPlayerId).every((player) => player.syncedTo === command.leaderPlayerId) && (leader.groupMembers.length === 0 || followers.every((id) => leader.groupMembers.includes(id)))) return command.memberPlayerIds;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.group_verification_failed", "Music Assistant hat die neue Gruppenzugehörigkeit nicht bestätigt.");
  }

  /**
   * Reads only Music Assistant's local API documentation. The returned fixed
   * booleans decide whether E4.2 may be implemented; no player command is
   * issued and the document never leaves the Green gateway.
   */
  async groupCapabilities() {
    let response;
    try {
      response = await this.fetcher(`${this.config.baseUrl}/api-docs`, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        method: "GET",
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new MusicAssistantGatewayError("music_assistant.api_docs_unavailable", "Die lokale Music-Assistant-API-Dokumentation ist nicht erreichbar.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new MusicAssistantGatewayError("music_assistant.authentication_failed", "Der Music-Assistant-Zugang wurde abgelehnt.");
    }
    if (!response.ok) {
      throw new MusicAssistantGatewayError(`music_assistant.api_docs_http_${response.status}`, "Die lokale Music-Assistant-API-Dokumentation ist nicht erreichbar.");
    }
    const document = await response.text().catch(() => "");
    if (!document || document.length > 1_000_000) {
      throw new MusicAssistantGatewayError("music_assistant.api_docs_invalid", "Die lokale Music-Assistant-API-Dokumentation ist ungültig.");
    }
    return {
      group: document.includes("players/cmd/group"),
      setMembers: document.includes("players/cmd/set_members"),
      ungroup: document.includes("players/cmd/ungroup")
    };
  }

  async command(command, args) {
    let response;
    try {
      response = await this.fetcher(`${this.config.baseUrl}/api`, {
        body: JSON.stringify({ args, command, message_id: String(++this.#sequence) }),
        headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new MusicAssistantGatewayError("music_assistant.connection_failed", "Music Assistant ist über die konfigurierte lokale Adresse nicht erreichbar.");
    }
    if (!response.ok) return { ok: false, payload: null };
    return { ok: true, payload: await response.json().catch(() => null) };
  }

  async getPlayer(id) {
    const result = await this.command("players/get", { player_id: id });
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.state_unavailable", "Music Assistant konnte den Wiedergabestatus nicht bestätigen.");
    const { payload } = result;
    const rawPlayer = payload && typeof payload === "object" && !Array.isArray(payload) && "result" in payload ? payload.result : payload;
    const player = playerFromResponse(rawPlayer);
    if (!player || player.id !== id) throw new MusicAssistantGatewayError("music_assistant.state_unavailable", "Music Assistant konnte den Wiedergabestatus nicht bestätigen.");
    return player;
  }
}

/**
 * Keeps the local Music Assistant event stream separate from command handling.
 * It accepts only player status events and never exposes a free command path.
 */
export class MusicAssistantRealtime {
  constructor(config, onPlayerUpdated) {
    this.config = validMusicAssistantConfig(config);
    this.onPlayerUpdated = onPlayerUpdated;
    this.reconnectTimer = null;
    this.stopped = false;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  connect() {
    const url = new URL(this.config.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener("open", () => socket.send(JSON.stringify({ args: { token: this.config.accessToken }, command: "auth", message_id: "hoebbie-green" })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message?.event === "player_updated" && message?.data && typeof message.data === "object") this.onPlayerUpdated();
    });
    socket.addEventListener("close", () => {
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.connect(), 1_000);
    });
    socket.addEventListener("error", () => socket.close());
  }
}
