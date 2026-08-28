export class MusicAssistantGatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const RADIO_PLAY_MEDIA_TIMEOUT_MILLISECONDS = 20_000;
export const SOLOIST_PLAY_MEDIA_TIMEOUT_MILLISECONDS = 12_000;

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
    && Array.isArray(command.playerIds)
    && Array.isArray(command.targetVolumes)
    && command.playerIds.length >= 1
    && command.playerIds.length === command.targetVolumes.length
    && command.playerIds.every((id) => typeof id === "string" && playerId(id))
    && command.targetVolumes.every((volume) => Number.isInteger(volume) && volume >= 0 && volume <= 100));
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
    && command.memberPlayerIds.includes(command.leaderPlayerId)
    && (command.operation === undefined || command.operation === "group" || command.operation === "ungroup"));
}

export function validMusicQueueTransferCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.sourcePlayerId === "string"
    && typeof command.targetPlayerId === "string"
    && playerId(command.sourcePlayerId)
    && playerId(command.targetPlayerId)
    && command.sourcePlayerId !== command.targetPlayerId);
}

export function validMusicAllRoomsCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.sourcePlayerId === "string"
    && playerId(command.sourcePlayerId)
    && Array.isArray(command.memberPlayerIds)
    && command.memberPlayerIds.length >= 2
    && command.memberPlayerIds.length <= 8
    && command.memberPlayerIds.every((id) => typeof id === "string" && playerId(id))
    && new Set(command.memberPlayerIds).size === command.memberPlayerIds.length
    && command.memberPlayerIds.includes(command.sourcePlayerId));
}

export function validMusicSeekCommand(command) {
  return Boolean(command && typeof command.commandId === "string" && typeof command.sourcePlayerId === "string" && playerId(command.sourcePlayerId) && Number.isInteger(command.targetSeconds) && command.targetSeconds >= 0);
}

export function validMusicSkipCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.sourcePlayerId === "string"
    && playerId(command.sourcePlayerId)
    && (command.direction === "previous" || command.direction === "next"));
}

export function validMusicShuffleCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.sourcePlayerId === "string"
    && playerId(command.sourcePlayerId)
    && typeof command.shuffleEnabled === "boolean");
}

export function validMusicStartCommand(command) {
  return Boolean(command
    && typeof command.commandId === "string"
    && typeof command.targetPlayerId === "string"
    && playerId(command.targetPlayerId)
    && typeof command.mediaUri === "string"
    && command.mediaUri.length >= 4
    && command.mediaUri.length <= 500
    && /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/i.test(command.mediaUri)
    && (command.mediaKind === "album" || command.mediaKind === "track" || command.mediaKind === "playlist" || command.mediaKind === "radio"));
}

/** The contract probe accepts only documented Music Assistant state events.
 * Their payload never leaves the local gateway and is deliberately not logged. */
export function musicAssistantRealtimeEvent(message) {
  return musicAssistantRealtimeObservation(message)?.eventType ?? null;
}

/** Returns only the event category and the presence of a documented timing
 * anchor. Queue payloads, positions and identifiers stay local. */
export function musicAssistantRealtimeObservation(message) {
  if (!message || typeof message !== "object") return null;
  if (message.event === "queue_time_updated") {
    return typeof message.data === "number" && Number.isFinite(message.data) && message.data >= 0
      ? { eventType: message.event, timingAnchor: "elapsed" }
      : null;
  }
  if (!["player_updated", "queue_updated", "queue_items_updated"].includes(message.event) || !message.data || typeof message.data !== "object") return null;
  const data = message.data;
  const hasQueueTimeAnchor = message.event === "queue_updated"
    && typeof data.elapsed_time === "number" && Number.isFinite(data.elapsed_time) && data.elapsed_time >= 0
    && typeof data.elapsed_time_last_updated === "number" && Number.isFinite(data.elapsed_time_last_updated) && data.elapsed_time_last_updated > 0;
  return { eventType: message.event, timingAnchor: hasQueueTimeAnchor ? "queue" : "none" };
}

function displayName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= 1 && normalized.length <= 120 ? normalized : null;
}

function mediaLabel(value, limit = 180) {
  return typeof value === "string" && value.trim().length > 0
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : null;
}

function selectedMediaItem(value, kind) {
  if (!value || typeof value !== "object") return null;
  const name = mediaLabel(value.name);
  const uri = mediaLabel(value.uri, 500);
  if (!name || !uri || !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return null;
  const artist = kind === "album" || kind === "track" ? mediaLabel(value.artists?.[0]?.name ?? value.artist?.name ?? value.artist) : null;
  const releaseYear = kind === "album" && Number.isInteger(value.year) && value.year >= 1800 && value.year <= 2200 ? value.year : undefined;
  return { artist, kind, name, ...(releaseYear === undefined ? {} : { releaseYear }), uri };
}

function belongsToProvider(value, providerInstanceId) {
  if (!value || typeof value !== "object") return false;
  if (value.provider === providerInstanceId) return true;
  return Array.isArray(value.provider_mappings)
    && value.provider_mappings.some((mapping) => mapping?.provider_instance === providerInstanceId);
}

/** A queue can contain artwork from many Music Assistant providers. The
 * profile snapshot carries only Spotify's public CDN image, never an MA path,
 * an authenticated URL, or a provider token. */
function spotifyArtworkRef(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "i.scdn.co" && !url.username && !url.password
      && !url.port && !url.search && !url.hash && /^\/image\/[A-Za-z0-9]{20,100}$/.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Reduces a Music Assistant queue item to the three display values which may
 * leave Green. Queue/provider identifiers and arbitrary artwork URLs remain
 * local. */
function queuePresentationItem(value) {
  if (!value || typeof value !== "object") return null;
  const media = value.media_item && typeof value.media_item === "object" ? value.media_item : value;
  const title = mediaLabel(media.name ?? media.title);
  if (!title) return null;
  const artist = mediaLabel(media.artists?.[0]?.name ?? media.artist?.name ?? media.artist);
  const artworkCandidates = [
    media.image?.path,
    media.image?.url,
    media.album?.images?.[0]?.url,
    media.album?.image?.path,
    media.album?.image?.url
  ];
  return { artist, artworkRef: artworkCandidates.map(spotifyArtworkRef).find((item) => item !== null) ?? null, title };
}

/** Accepts Music Assistant's queue clock only when it can be tied to the
 * freshly observed playing snapshot. A stale or future value is omitted; the
 * mobile UI then stays static instead of pretending to know realtime. */
export function verifiedQueueSourceTime(value, observedAt, isPlaying) {
  if (!isPlaying) return null;
  const observedMilliseconds = Date.parse(observedAt);
  const sourceMilliseconds = typeof value === "number" && Number.isFinite(value) && value > 0
    ? value * 1_000
    : typeof value === "string" && Number.isFinite(Date.parse(value))
      ? Date.parse(value)
      : NaN;
  if (!Number.isFinite(observedMilliseconds) || !Number.isFinite(sourceMilliseconds)) return null;
  if (sourceMilliseconds > observedMilliseconds + 60_000 || sourceMilliseconds < observedMilliseconds - 300_000) return null;
  return new Date(sourceMilliseconds).toISOString();
}

/** Music Assistant 2.9 publishes current live-radio metadata on
 * PlayerQueue.stream_title. Most ICY stations use `artist - title`; a station
 * that supplies only one label still remains useful as a non-blocking title. */
export function radioStreamMetadata(value) {
  const streamTitle = mediaLabel(value);
  if (!streamTitle) return null;
  const separator = streamTitle.indexOf(" - ");
  if (separator <= 0 || separator >= streamTitle.length - 3) return { artist: null, title: streamTitle };
  const artist = mediaLabel(streamTitle.slice(0, separator));
  const title = mediaLabel(streamTitle.slice(separator + 3));
  return title ? { artist, title } : { artist: null, title: streamTitle };
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
  #radioContractCapabilities = null;
  // A profile session is allowed to retain only its already confirmed queue.
  // This lets a PAUSED event update that same session without guessing between
  // unrelated paused queues elsewhere in the household.
  #profileQueueId = null;

  constructor(config, fetcher = fetch) {
    this.config = validMusicAssistantConfig(config);
    this.fetcher = fetcher;
  }

  /** Restores only the prior, server-confirmed profile queue after a Green
   * restart. Invalid or absent local state is ignored rather than guessed. */
  restoreProfileQueue(value) {
    const restored = playerId(value);
    if (!restored) return false;
    this.#profileQueueId = restored;
    return true;
  }

  clearProfileQueue(value) {
    if (this.#profileQueueId !== playerId(value)) return false;
    this.#profileQueueId = null;
    return true;
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

  /** Reads only a bounded list of tracks. Provider URIs remain local to Green
   * and are later replaced by an opaque server-side selection reference. */
  async searchTracks(query, providerInstanceId) {
    const searchQuery = mediaLabel(query, 100);
    const provider = playerId(providerInstanceId);
    if (!searchQuery || !provider) throw new MusicAssistantGatewayError("music_assistant.search_invalid", "Die Titelsuche ist ungültig.");
    // Music Assistant 2.9.13 officially exposes global search without a
    // provider argument. Keep the command contract exact and enforce the
    // profile's provider on the returned provider mappings before any item
    // can leave Green.
    const response = await this.command("music/search", { limit: 20, media_types: ["track"], search_query: searchQuery });
    const rows = response.payload?.tracks ?? response.payload?.result?.tracks;
    if (!response.ok || !Array.isArray(rows)) throw new MusicAssistantGatewayError("music_assistant.search_unavailable", "Music Assistant konnte keine Titel suchen.");
    return rows.filter((item) => belongsToProvider(item, provider)).slice(0, 20).map((item) => selectedMediaItem(item, "track")).filter(Boolean);
  }

  /** Reads a bounded album catalog only. The exact fixed Music Assistant
   * command cannot alter playback; incomplete results fail closed. */
  async searchAlbums(query) {
    const searchQuery = mediaLabel(query, 100);
    if (!searchQuery || searchQuery.length < 3) throw new MusicAssistantGatewayError("music_assistant.search_invalid", "Die Albumsuche ist ungültig.");
    const response = await this.command("music/search", { limit: 20, media_types: ["album"], search_query: searchQuery });
    const rows = Array.isArray(response.payload) ? response.payload : response.payload?.albums ?? response.payload?.result?.albums;
    if (!response.ok || !Array.isArray(rows) || rows.length > 20) throw new MusicAssistantGatewayError("music_assistant.catalog_unavailable", "Music Assistant konnte keine gültigen Albumtreffer bestätigen.");
    const albums = rows.map((item) => selectedMediaItem(item, "album"));
    if (albums.some((item) => item === null)) throw new MusicAssistantGatewayError("music_assistant.invalid_response", "Music Assistant hat unvollständige Albumtreffer geliefert.");
    return albums;
  }

  /** Reads the configured Music-Assistant playlist library without changing a queue. */
  async listPlaylists(offset = 0, providerInstanceId) {
    const provider = playerId(providerInstanceId);
    if (!Number.isInteger(offset) || offset < 0 || offset > 500 || !provider) throw new MusicAssistantGatewayError("music_assistant.playlists_invalid", "Die Playlist-Seite ist ungültig.");
    const response = await this.command("music/playlists/library_items", { limit: 20, offset, provider });
    const rows = Array.isArray(response.payload) ? response.payload : response.payload?.result;
    if (!response.ok || !Array.isArray(rows)) throw new MusicAssistantGatewayError("music_assistant.playlists_unavailable", "Music Assistant konnte keine Playlists lesen.");
    return rows.slice(0, 20).map((item) => selectedMediaItem(item, "playlist")).filter(Boolean);
  }

  /**
   * Reads the current Music Assistant queue registry through its fixed API
   * command. Queue entries themselves deliberately never leave the Green
   * gateway: this is only a capability/health probe for E4.6.
   */
  async queueRegistryAvailable() {
    const result = await this.command("player_queues/all", {});
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.queue_registry_unavailable", "Music Assistant konnte die Queue-Übersicht nicht lesen.");
    const payload = Array.isArray(result.payload)
      ? result.payload
      : result.payload && typeof result.payload === "object" && Array.isArray(result.payload.result)
        ? result.payload.result
        : null;
    if (!payload) throw new MusicAssistantGatewayError("music_assistant.queue_registry_invalid", "Music Assistant hat eine ungültige Queue-Übersicht geliefert.");
    return true;
  }

  /**
   * Returns only aggregate, redacted live-metadata availability. This is a
   * diagnostic for the documented PlayerQueue.stream_title contract: neither
   * queue identifiers nor any station, artist or title values leave the
   * client.
   */
  async radioMetadataAvailability() {
    const result = await this.command("player_queues/all", {});
    const queues = Array.isArray(result.payload)
      ? result.payload
      : result.payload && typeof result.payload === "object" && Array.isArray(result.payload.result)
        ? result.payload.result
        : null;
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.queue_registry_unavailable", "Music Assistant konnte die Queue-Übersicht nicht lesen.");
    if (!queues) throw new MusicAssistantGatewayError("music_assistant.queue_registry_invalid", "Music Assistant hat eine ungültige Queue-Übersicht geliefert.");
    const streamTitles = queues.map((queue) => queue && typeof queue === "object" ? mediaLabel(queue.stream_title) : null).filter((value) => value !== null);
    return {
      artistTitlePairCount: streamTitles.filter((value) => radioStreamMetadata(value)?.artist !== null).length,
      streamTitleCount: streamTitles.length
    };
  }

  /** Returns only a normalized queue snapshot for a fixed player. It never
   * logs or exposes the full queue. */
  async queueSnapshot(playerIdToRead, includeQueueIndex = false) {
    if (!playerId(playerIdToRead)) throw new MusicAssistantGatewayError("music_assistant.queue_registry_invalid", "Music Assistant hat eine ungültige Queue geliefert.");
    const result = await this.command("player_queues/all", {});
    const queues = Array.isArray(result.payload) ? result.payload : result.payload && typeof result.payload === "object" && Array.isArray(result.payload.result) ? result.payload.result : null;
    if (!result.ok || !queues) throw new MusicAssistantGatewayError("music_assistant.queue_registry_unavailable", "Music Assistant konnte die Queue-Übersicht nicht lesen.");
    const queue = queues.find((item) => item && typeof item === "object" && playerId(item.queue_id) === playerIdToRead) ?? null;
    if (!queue) return null;
    const current = queue.current_item && typeof queue.current_item === "object" ? queue.current_item : {};
    const text = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
    const seconds = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
    const sourcePlayerId = playerId(queue.queue_id);
    if (!sourcePlayerId) throw new MusicAssistantGatewayError("music_assistant.queue_registry_invalid", "Music Assistant hat eine ungültige aktive Queue geliefert.");
    const artworkCandidates = [
      current.image?.path,
      current.image?.url,
      current.album?.images?.[0]?.url,
      current.album?.image?.path,
      current.album?.image?.url
    ];
    const artworkRef = artworkCandidates.map(spotifyArtworkRef).find((value) => value !== null) ?? null;
    const isPlaying = String(queue.state).toUpperCase() === "PLAYING";
    const observedAt = new Date().toISOString();
    const currentIndex = Number.isInteger(queue.current_index) && queue.current_index >= 0 ? queue.current_index : null;
    const nextTracks = currentIndex === null ? [] : await this.nextQueueItems(sourcePlayerId, currentIndex);
    const liveMetadata = radioStreamMetadata(queue.stream_title);
    const snapshot = { album: liveMetadata ? null : text(current.album?.name ?? current.album), artist: liveMetadata?.artist ?? text(current.artists?.[0]?.name ?? current.artist?.name ?? current.artist), artworkRef, durationSeconds: seconds(current.duration), isPlaying, nextTracks, observedAt, progressSeconds: seconds(queue.elapsed_time), shuffleEnabled: typeof queue.shuffle_enabled === "boolean" ? queue.shuffle_enabled : null, sourcePlayerId, sourceTime: verifiedQueueSourceTime(queue.elapsed_time_last_updated, observedAt, isPlaying), title: liveMetadata?.title ?? text(current.name ?? current.title) };
    return includeQueueIndex ? { ...snapshot, queueIndex: currentIndex } : snapshot;
  }

  /** Reads at most five following items from Music Assistant's documented
   * queue endpoint. A version mismatch or malformed response is an empty,
   * explicitly unconfirmed list – never a playback failure. */
  async nextQueueItems(queueId, currentIndex) {
    const result = await this.command("player_queues/items", { limit: 5, offset: currentIndex + 1, queue_id: queueId });
    const items = Array.isArray(result.payload)
      ? result.payload
      : result.payload && typeof result.payload === "object" && Array.isArray(result.payload.result)
        ? result.payload.result
        : null;
    if (!result.ok || !items) return [];
    return items.slice(0, 5).map(queuePresentationItem).filter((item) => item !== null);
  }

  async activeQueueSnapshot(excludedPlayerIds = []) {
    const result = await this.command("player_queues/all", {});
    const queues = Array.isArray(result.payload) ? result.payload : result.payload && typeof result.payload === "object" && Array.isArray(result.payload.result) ? result.payload.result : null;
    if (!result.ok || !queues) throw new MusicAssistantGatewayError("music_assistant.queue_registry_unavailable", "Music Assistant konnte die Queue-Übersicht nicht lesen.");
    const excluded = new Set(Array.isArray(excludedPlayerIds) ? excludedPlayerIds.map(playerId).filter(Boolean) : []);
    // A household may legitimately have several independent Sonos queues.
    // Once Hoebbie has confirmed its profile queue, keep reading that exact
    // queue even when another room is also playing. Picking the first playing
    // queue would publish no update for the retained profile source and leave
    // stale metadata visible while controls act on newer Sonos state.
    const retainedProfileQueue = this.#profileQueueId && !excluded.has(this.#profileQueueId) && queues.some((item) => item && typeof item === "object" && playerId(item.queue_id) === this.#profileQueueId)
      ? this.#profileQueueId
      : null;
    const playing = queues.find((item) => item && typeof item === "object" && !excluded.has(playerId(item.queue_id)) && String(item.state).toUpperCase() === "PLAYING");
    const playingId = playing && typeof playing === "object" ? playerId(playing.queue_id) : null;
    const inactive = queues.find((item) => item && typeof item === "object" && !excluded.has(playerId(item.queue_id)) && ["PAUSED", "IDLE"].includes(String(item.state).toUpperCase()));
    const inactiveId = inactive && typeof inactive === "object" ? playerId(inactive.queue_id) : null;
    const activeId = retainedProfileQueue ?? playingId ?? inactiveId;
    if (!activeId) return null;
    const snapshot = await this.queueSnapshot(activeId);
    if (snapshot) this.#profileQueueId = snapshot.sourcePlayerId;
    return snapshot;
  }

  /** Executes only the fixed, server-authorized queue transfer and confirms
   * that the active queue now belongs to the intended target player. */
  async transferQueue(command) {
    if (!validMusicQueueTransferCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_queue_transfer", "Der freigegebene Raumwechsel ist ungültig.");
    // Database discovery is intentionally not the authority for a dynamic
    // availability decision: a Sonos player may reappear between inventory
    // scans. Verify the fixed target directly before issuing the transfer.
    const targetBeforeTransfer = await this.getPlayer(command.targetPlayerId);
    if (!targetBeforeTransfer.available) {
      throw new MusicAssistantGatewayError("music_assistant.queue_transfer_target_unavailable", "Der gewählte Raum ist momentan nicht erreichbar.");
    }
    const sourceBeforeTransfer = await this.getPlayer(command.sourcePlayerId);
    if (!sourceBeforeTransfer.available) throw new MusicAssistantGatewayError("music_assistant.queue_transfer_source_unavailable", "Der bisherige Raum ist momentan nicht erreichbar.");
    const result = await this.command("player_queues/transfer", { auto_play: sourceBeforeTransfer.isPlaying, source_queue_id: command.sourcePlayerId, target_queue_id: command.targetPlayerId });
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.queue_transfer_failed", "Music Assistant hat den Raumwechsel nicht ausgeführt.");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await this.queueSnapshot(command.targetPlayerId);
      const target = await this.getPlayer(command.targetPlayerId);
      if (snapshot?.sourcePlayerId === command.targetPlayerId && target.available && target.isPlaying === sourceBeforeTransfer.isPlaying && snapshot.isPlaying === sourceBeforeTransfer.isPlaying) return snapshot;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.queue_transfer_verification_failed", "Music Assistant hat den Raumwechsel nicht bestätigt.");
  }

  async seekQueue(command) {
    if (!validMusicSeekCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_seek", "Der freigegebene Zeitpunkt ist ungültig.");
    const before = await this.queueSnapshot(command.sourcePlayerId);
    if (!before || before.durationSeconds === null || command.targetSeconds > before.durationSeconds) throw new MusicAssistantGatewayError("music_assistant.seek_unavailable", "Der Zeitpunkt ist nicht bestätigt.");
    const result = await this.command("players/cmd/seek", { player_id: command.sourcePlayerId, position: command.targetSeconds });
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.seek_failed", "Music Assistant hat den Zeitpunkt nicht gesetzt.");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await this.queueSnapshot(command.sourcePlayerId);
      if (snapshot?.sourcePlayerId === command.sourcePlayerId && snapshot.durationSeconds !== null && Math.abs(snapshot.progressSeconds - command.targetSeconds) <= 2) return snapshot;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.seek_verification_failed", "Music Assistant hat den Zeitpunkt nicht bestätigt.");
  }

  /** Executes one fixed queue navigation action and returns only after Music
   * Assistant exposes a plausibly changed queue. The internal queue index is
   * used locally for verification and is removed from the returned snapshot. */
  async skipQueue(command) {
    if (!validMusicSkipCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_skip", "Der freigegebene Titelwechsel ist ungültig.");
    const before = await this.queueSnapshot(command.sourcePlayerId, true);
    if (!before?.title) throw new MusicAssistantGatewayError("music_assistant.skip_unavailable", "Für den Titelwechsel ist keine bestätigte Queue vorhanden.");
    const result = await this.command(`player_queues/${command.direction}`, { queue_id: command.sourcePlayerId });
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.skip_failed", "Music Assistant hat den Titelwechsel nicht ausgeführt.");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const after = await this.queueSnapshot(command.sourcePlayerId, true);
      const indexChanged = before.queueIndex !== null && after?.queueIndex !== null && before.queueIndex !== after.queueIndex;
      const mediaChanged = Boolean(after?.title && (after.title !== before.title || after.artist !== before.artist || after.durationSeconds !== before.durationSeconds));
      const restarted = command.direction === "previous" && before.progressSeconds !== null && after?.progressSeconds !== null && before.progressSeconds >= 3 && after.progressSeconds <= Math.max(2, before.progressSeconds - 2);
      if (after?.sourcePlayerId === command.sourcePlayerId && after.title && (indexChanged || mediaChanged || restarted)) {
        const { queueIndex: _queueIndex, ...snapshot } = after;
        return snapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.skip_verification_failed", "Music Assistant hat den Titelwechsel nicht bestätigt.");
  }

  /** Sets the one server-derived playlist shuffle state and confirms it by
   * reading the same Music Assistant queue back. */
  async setShuffle(command) {
    if (!validMusicShuffleCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_shuffle", "Der freigegebene Shuffle-Auftrag ist ungültig.");
    const result = await this.command("player_queues/shuffle", { queue_id: command.sourcePlayerId, shuffle_enabled: command.shuffleEnabled });
    if (!result.ok) throw new MusicAssistantGatewayError("music_assistant.shuffle_failed", "Music Assistant hat Shuffle nicht gesetzt.");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const snapshot = await this.queueSnapshot(command.sourcePlayerId);
      if (snapshot?.sourcePlayerId === command.sourcePlayerId && snapshot.title && snapshot.shuffleEnabled === command.shuffleEnabled) return snapshot;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.shuffle_verification_failed", "Music Assistant hat Shuffle nicht bestätigt.");
  }

  async #groupMemberIds(player) {
    if (!player?.id) return [];
    let leader = player;
    if (player.syncedTo) leader = await this.getPlayer(player.syncedTo);
    const memberIds = [...new Set([player.id, leader.id, ...leader.groupMembers].map(playerId).filter(Boolean))];
    if (memberIds.length > 8) {
      throw new MusicAssistantGatewayError("music_assistant.group_too_large", "Die aktuelle Raumgruppe ist größer als der freigegebene Rahmen.");
    }
    return memberIds;
  }

  async #ungroupMemberIds(memberIds) {
    const normalizedIds = [...new Set(memberIds.map(playerId).filter(Boolean))];
    if (normalizedIds.length < 2 || normalizedIds.length > 8) return normalizedIds;
    // Music Assistant 2.9 exposes this exact bounded command for releasing
    // every current member. Calling ungroup only on an assumed leader is not
    // sufficient because Sonos may have reassigned the coordinator.
    const actionResult = await this.command("players/cmd/ungroup_many", { player_ids: normalizedIds });
    if (!actionResult.ok) {
      throw new MusicAssistantGatewayError(`music_assistant.ungroup_http_${actionResult.status}`, "Music Assistant hat den Auflösungsauftrag nicht ausgeführt.");
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const states = await Promise.all(normalizedIds.map((id) => this.getPlayer(id)));
      const allStandalone = states.every((state) => state.syncedTo === null && state.groupMembers.filter((id) => id !== state.id).length === 0);
      if (allStandalone) return normalizedIds;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.ungroup_verification_failed", "Music Assistant hat das vollständige Auflösen der Gruppe nicht bestätigt.");
  }

  async #releaseCurrentSession(target) {
    const groups = [];
    const targetGroup = await this.#groupMemberIds(target);
    if (targetGroup.length >= 2) groups.push(targetGroup);

    const priorQueueId = this.#profileQueueId;
    if (priorQueueId) {
      let priorPlayer = target.id === priorQueueId ? target : null;
      if (!priorPlayer) {
        try { priorPlayer = await this.getPlayer(priorQueueId); }
        catch (error) {
          if (!(error instanceof MusicAssistantGatewayError) || error.code !== "music_assistant.state_unavailable") throw error;
        }
      }
      if (priorPlayer?.available) {
        const priorGroup = await this.#groupMemberIds(priorPlayer);
        if (priorGroup.length >= 2 && !groups.some((group) => group.length === priorGroup.length && group.every((id) => priorGroup.includes(id)))) groups.push(priorGroup);
        const stopped = await this.command("player_queues/stop", { queue_id: priorQueueId });
        if (!stopped.ok) {
          throw new MusicAssistantGatewayError(`music_assistant.session_stop_http_${stopped.status}`, "Music Assistant hat die vorherige Wiedergabe nicht beendet.");
        }
      }
    }

    for (const group of groups) await this.#ungroupMemberIds(group);
  }

  /** Replaces one fixed target queue with the server-authorized media URI and
   * returns only after the target is observed playing. The URI never appears
   * in logs, snapshots or mobile responses. */
  async startPlayback(command) {
    if (!validMusicStartCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_start", "Der freigegebene Musikstart ist ungültig.");
    if (command.mediaKind === "radio") {
      const contract = this.#radioContractCapabilities ?? await this.radioContract();
      if (!contract.directUriPlayback) throw new MusicAssistantGatewayError("music_assistant.radio_contract_unsupported", "Die installierte Music-Assistant-Version bestätigt den Radio-Pfad nicht.");
    }
    const target = await this.getPlayer(command.targetPlayerId);
    if (!target.available) throw new MusicAssistantGatewayError("music_assistant.start_target_unavailable", "Der gewählte Raum ist momentan nicht erreichbar.");
    const before = await this.queueSnapshot(command.targetPlayerId);
    // A fresh Hoebbie start owns the one retained profile session. Release its
    // old queue and any group around the old or new target before replacing
    // media, so selecting one room cannot inherit an earlier all-room group.
    await this.#releaseCurrentSession(target);
    const releasedTarget = await this.getPlayer(command.targetPlayerId);
    if (!releasedTarget.available || releasedTarget.syncedTo !== null || releasedTarget.groupMembers.filter((id) => id !== releasedTarget.id).length > 0) {
      throw new MusicAssistantGatewayError("music_assistant.start_target_grouped", "Der gewählte Raum konnte nicht als Einzelziel bestätigt werden.");
    }
    // Music Assistant resolves a plain URL through its builtin provider before
    // queueing it. Radio probing and Soloist's first queue start can both take
    // longer than the normal five-second JSON-RPC budget.
    let result = null;
    let requestTimedOut = false;
    try {
      result = await this.command("player_queues/play_media", { media: command.mediaUri, option: "replace", queue_id: command.targetPlayerId, radio_mode: false }, command.mediaKind === "radio" ? RADIO_PLAY_MEDIA_TIMEOUT_MILLISECONDS : SOLOIST_PLAY_MEDIA_TIMEOUT_MILLISECONDS);
    } catch (error) {
      if (!(error instanceof MusicAssistantGatewayError) || error.code !== "music_assistant.request_timeout") throw error;
      // The HTTP client can time out after Music Assistant accepted the
      // command. The bounded state readback below is the authority.
      requestTimedOut = true;
    }
    if (!requestTimedOut && !result?.ok) throw new MusicAssistantGatewayError(`music_assistant.start_http_${result?.status ?? 0}`, "Music Assistant hat den Musikstart nicht ausgeführt.");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const snapshot = await this.queueSnapshot(command.targetPlayerId);
      const observedTarget = await this.getPlayer(command.targetPlayerId);
      const playbackChanged = !before
        || snapshot?.title !== before.title
        || snapshot?.artist !== before.artist
        || (snapshot?.progressSeconds !== null && snapshot?.progressSeconds !== undefined && snapshot.progressSeconds <= 5)
        || (snapshot?.progressSeconds !== null && snapshot?.progressSeconds !== undefined && before.progressSeconds !== null && snapshot.progressSeconds < before.progressSeconds);
      const hasUsableMetadata = Boolean(snapshot?.title) || command.mediaKind === "radio";
      if (snapshot?.sourcePlayerId === command.targetPlayerId && snapshot.isPlaying && observedTarget.available && observedTarget.isPlaying && hasUsableMetadata && playbackChanged) {
        this.#profileQueueId = command.targetPlayerId;
        return snapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.start_verification_failed", "Music Assistant hat den Musikstart nicht bestätigt.");
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
    if (!command || typeof command.playerId !== "string" || !playerId(command.playerId) || !Number.isInteger(command.targetVolume) || command.targetVolume < 0 || command.targetVolume > 100) throw new MusicAssistantGatewayError("music_assistant.invalid_command", "Der freigegebene Lautstärkeauftrag ist ungültig.");
    const actionResult = await this.command("players/cmd/volume_set", { player_id: command.playerId, volume_level: command.targetVolume });
    if (!actionResult.ok) throw new MusicAssistantGatewayError("music_assistant.command_failed", "Music Assistant hat den Lautstärkeauftrag nicht ausgeführt.");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const player = await this.getPlayer(command.playerId);
      if (player.volume === command.targetVolume) return player.volume;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new MusicAssistantGatewayError("music_assistant.verification_failed", "Music Assistant hat die neue Lautstärke nicht bestätigt.");
  }

  async setVolumes(command) {
    if (!validMusicVolumeCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_command", "Der freigegebene Gruppenlautstärkeauftrag ist ungültig.");
    const observed = [];
    for (let index = 0; index < command.playerIds.length; index += 1) observed.push(await this.setVolume({ playerId: command.playerIds[index], targetVolume: command.targetVolumes[index] }));
    return observed;
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

  async groupAllRooms(command) {
    if (!validMusicAllRoomsCommand(command)) throw new MusicAssistantGatewayError("music_assistant.invalid_all_rooms", "Der freigegebene Alle-Räume-Auftrag ist ungültig.");
    const before = await this.queueSnapshot(command.sourcePlayerId);
    if (!before?.title) throw new MusicAssistantGatewayError("music_assistant.all_rooms_queue_unavailable", "Die aktuelle Wiedergabe konnte nicht bestätigt werden.");
    await this.groupPlayers({ commandId: command.commandId, leaderPlayerId: command.sourcePlayerId, memberPlayerIds: command.memberPlayerIds, operation: "group" });
    const after = await this.queueSnapshot(command.sourcePlayerId);
    if (!after?.title || after.sourcePlayerId !== command.sourcePlayerId || after.title !== before.title || after.artist !== before.artist) throw new MusicAssistantGatewayError("music_assistant.all_rooms_queue_changed", "Music Assistant hat nach der Gruppierung eine andere Wiedergabe gemeldet.");
    return after;
  }

  async ungroupPlayers(command) {
    if (!validMusicGroupCommand(command) || command.operation !== "ungroup") throw new MusicAssistantGatewayError("music_assistant.invalid_ungroup_command", "Der freigegebene Auflösungsauftrag ist ungültig.");
    return this.#ungroupMemberIds(command.memberPlayerIds);
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
      next: document.includes("player_queues/next"),
      playMedia: document.includes("player_queues/play_media"),
      previous: document.includes("player_queues/previous"),
      queueGet: document.includes("player_queues/get"),
      queueTransfer: document.includes("player_queues/transfer"),
      setMembers: document.includes("players/cmd/set_members"),
      shuffle: document.includes("player_queues/shuffle"),
      ungroup: document.includes("players/cmd/ungroup")
    };
  }

  /** Reads the generated command contract introduced by Music Assistant 2.9.
   * No media, player or library payload is requested or logged. */
  async radioContract() {
    let response;
    try {
      response = await this.fetcher(`${this.config.baseUrl}/api-docs/commands.json`, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        method: "GET",
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new MusicAssistantGatewayError("music_assistant.radio_contract_unavailable", "Der lokale Music-Assistant-Radiovertrag ist nicht erreichbar.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new MusicAssistantGatewayError("music_assistant.authentication_failed", "Der Music-Assistant-Zugang wurde abgelehnt.");
    }
    if (!response.ok) {
      throw new MusicAssistantGatewayError(`music_assistant.radio_contract_http_${response.status}`, "Der lokale Music-Assistant-Radiovertrag ist nicht erreichbar.");
    }
    const commands = await response.json().catch(() => null);
    if (!Array.isArray(commands) || commands.length > 2_000) {
      throw new MusicAssistantGatewayError("music_assistant.radio_contract_invalid", "Der lokale Music-Assistant-Radiovertrag ist ungültig.");
    }
    const playMedia = commands.find((entry) => entry && typeof entry === "object" && entry.command === "player_queues/play_media");
    const parameterNames = Array.isArray(playMedia?.parameters)
      ? new Set(playMedia.parameters.flatMap((parameter) => parameter && typeof parameter.name === "string" ? [parameter.name] : []))
      : new Set();
    const capabilities = {
      directUriPlayback: Boolean(playMedia && parameterNames.has("queue_id") && parameterNames.has("media") && parameterNames.has("option") && parameterNames.has("radio_mode")),
      radioLibraryReadable: commands.some((entry) => entry && typeof entry === "object" && entry.command === "music/radios/library_items")
    };
    this.#radioContractCapabilities = capabilities;
    return capabilities;
  }

  async command(command, args, timeoutMilliseconds = 5_000) {
    let response;
    try {
      response = await this.fetcher(`${this.config.baseUrl}/api`, {
        body: JSON.stringify({ args, command, message_id: String(++this.#sequence) }),
        headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(timeoutMilliseconds)
      });
    } catch (error) {
      if (error && typeof error === "object" && (error.name === "TimeoutError" || error.code === "ABORT_ERR")) {
        throw new MusicAssistantGatewayError("music_assistant.request_timeout", "Music Assistant hat nicht innerhalb des begrenzten Zeitfensters geantwortet.");
      }
      throw new MusicAssistantGatewayError("music_assistant.connection_failed", "Music Assistant ist über die konfigurierte lokale Adresse nicht erreichbar.");
    }
    if (response.status === 401 || response.status === 403) throw new MusicAssistantGatewayError("music_assistant.authentication_failed", "Der Music-Assistant-Zugang wurde abgelehnt.");
    if (!response.ok) return { ok: false, payload: null, status: response.status };
    return { ok: true, payload: await response.json().catch(() => null), status: response.status };
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
  constructor(config, onEvent) {
    this.config = validMusicAssistantConfig(config);
    this.onEvent = onEvent;
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
    this.reconnectTimer = null;
    this.socket?.close();
  }

  connect() {
    const url = new URL(this.config.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;
    const scheduleReconnect = () => {
      if (this.stopped || this.socket !== socket || this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.stopped && this.socket === socket && socket.readyState !== WebSocket.OPEN) this.connect();
      }, 1_000);
    };
    socket.addEventListener("open", () => socket.send(JSON.stringify({ args: { token: this.config.accessToken }, command: "auth", message_id: "hoebbie-green" })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const observation = musicAssistantRealtimeObservation(message);
      if (observation) this.onEvent(observation);
    });
    socket.addEventListener("close", scheduleReconnect);
    // Undici already fails and closes the connection. Calling close() again
    // from its error event can synchronously emit another error and recurse.
    socket.addEventListener("error", scheduleReconnect, { once: true });
  }
}
