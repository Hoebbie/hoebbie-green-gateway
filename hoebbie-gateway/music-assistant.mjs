const PLAYER_ID = /^[A-Za-z0-9:._/-]{1,200}$/;

export class MusicAssistantError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function normalizedConfig(config) {
  const accessToken = typeof config?.accessToken === "string" ? config.accessToken.trim() : "";
  if (accessToken.length < 24 || accessToken.length > 2048 || /\s/.test(accessToken)) throw new MusicAssistantError("music_assistant.invalid_token");
  let url;
  try { url = new URL(config?.baseUrl); } catch { throw new MusicAssistantError("music_assistant.invalid_url"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new MusicAssistantError("music_assistant.invalid_url");
  url.pathname = url.pathname.replace(/\/$/, "");
  return { accessToken, baseUrl: url.toString().replace(/\/$/, "") };
}

export function validMusicCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.playerId === "string"
    && PLAYER_ID.test(command.playerId)
    && (command.action === "pause" || command.action === "play"));
}

function playerIsPlaying(value) {
  if (!value || typeof value !== "object") return null;
  const playerId = typeof value.player_id === "string" && PLAYER_ID.test(value.player_id) ? value.player_id : null;
  const state = typeof value.state === "string" ? value.state.toUpperCase() : "";
  return playerId ? { playerId, isPlaying: state === "PLAYING" } : null;
}

export class MusicAssistantClient {
  constructor(config, { fetcher = fetch, wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {}) {
    this.config = normalizedConfig(config);
    this.fetcher = fetcher;
    this.wait = wait;
    this.sequence = 0;
  }

  async request(command, args) {
    const response = await this.fetcher(`${this.config.baseUrl}/api`, {
      body: JSON.stringify({ args, command, message_id: String(++this.sequence) }),
      headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(5_000)
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response?.ok || !payload || typeof payload !== "object") throw new MusicAssistantError("music_assistant.request_failed");
    return payload;
  }

  async execute(command) {
    if (!validMusicCommand(command)) throw new MusicAssistantError("music_assistant.invalid_command");
    await this.request(command.action === "pause" ? "players/cmd/pause" : "players/cmd/play", { player_id: command.playerId });
    const expectedIsPlaying = command.action === "play";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await this.request("players/get", { player_id: command.playerId });
      const player = playerIsPlaying(response.result);
      if (!player || player.playerId !== command.playerId) throw new MusicAssistantError("music_assistant.invalid_state");
      if (player.isPlaying === expectedIsPlaying) return player.isPlaying;
      await this.wait(500);
    }
    throw new MusicAssistantError("music_assistant.verification_failed");
  }
}
