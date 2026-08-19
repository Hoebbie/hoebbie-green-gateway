import assert from "node:assert/strict";
import test from "node:test";

import { MusicAssistantClient, MusicAssistantGatewayError, musicAssistantRealtimeEvent, musicAssistantRealtimeObservation, validMusicAssistantConfig, validMusicCommand, validMusicGroupCommand, validMusicQueueTransferCommand, validMusicSeekCommand, validMusicSkipCommand, validMusicStartCommand, validMusicVolumeCommand, verifiedQueueSourceTime } from "./music-assistant-client.mjs";

const config = { accessToken: "a".repeat(32), baseUrl: "http://music-assistant.local:8095/" };

test("rejects an unsafe Music Assistant configuration before a request", () => {
  assert.throws(() => validMusicAssistantConfig({ ...config, accessToken: "short" }), MusicAssistantGatewayError);
  assert.throws(() => validMusicAssistantConfig({ ...config, baseUrl: "file:///tmp/music-assistant" }), MusicAssistantGatewayError);
});

test("accepts only the documented, payload-bearing realtime event categories", () => {
  for (const event of ["player_updated", "queue_updated", "queue_items_updated"]) {
    assert.equal(musicAssistantRealtimeEvent({ data: {}, event }), event);
  }
  assert.equal(musicAssistantRealtimeEvent({ data: 61.5, event: "queue_time_updated" }), "queue_time_updated");
  assert.equal(musicAssistantRealtimeEvent({ data: {}, event: "queue_time_updated" }), null);
  assert.equal(musicAssistantRealtimeEvent({ data: {}, event: "provider_event" }), null);
  assert.equal(musicAssistantRealtimeEvent({ event: "queue_updated" }), null);
});

test("retains only a safe timing-anchor category for the contract probe", () => {
  assert.deepEqual(musicAssistantRealtimeObservation({ data: 61.5, event: "queue_time_updated" }), { eventType: "queue_time_updated", timingAnchor: "elapsed" });
  assert.deepEqual(musicAssistantRealtimeObservation({ data: { elapsed_time: 61, elapsed_time_last_updated: 1_786_999_000 }, event: "queue_updated" }), { eventType: "queue_updated", timingAnchor: "queue" });
  assert.deepEqual(musicAssistantRealtimeObservation({ data: {}, event: "queue_updated" }), { eventType: "queue_updated", timingAnchor: "none" });
});

test("uses only the fixed player discovery command", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (url, options) => {
    calls.push({ options, url });
    return new Response(JSON.stringify({ result: [{ available: true, display_name: "Küche", player_id: "sonos:kitchen", powered: true, state: "playing", volume_level: 38 }] }), { status: 200 });
  });
  assert.deepEqual(await client.listPlayers(), [{ available: true, displayName: "Küche", groupMembers: [], id: "sonos:kitchen", isPlaying: true, powered: true, syncedTo: null, volume: 38 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://music-assistant.local:8095/api");
  assert.deepEqual(JSON.parse(calls[0].options.body), { args: {}, command: "players/all", message_id: "1" });
});

test("uses fixed bounded commands for title search and playlist browsing", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    return new Response(JSON.stringify(request.command === "music/search"
      ? { tracks: [{ artists: [{ name: "Künstler" }], name: "Titel", provider_mappings: [{ provider_instance: "spotify--lars" }], uri: "spotify://track/123" }] }
      : [{ name: "Meine Playlist", uri: "spotify://playlist/456" }]), { status: 200 });
  });
  assert.deepEqual(await client.searchTracks("Titel", "spotify--lars"), [{ artist: "Künstler", kind: "track", name: "Titel", uri: "spotify://track/123" }]);
  assert.deepEqual(await client.listPlaylists(0, "spotify--lars"), [{ artist: null, kind: "playlist", name: "Meine Playlist", uri: "spotify://playlist/456" }]);
  assert.deepEqual(calls.map((call) => call.command), ["music/search", "music/playlists/library_items"]);
  assert.deepEqual(calls[0].args, { limit: 20, media_types: ["track"], search_query: "Titel" });
  assert.equal(calls[1].args.provider, "spotify--lars");
});

test("starts only a validated server-authorized media URI and verifies the target", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.command === "players/get") return new Response(JSON.stringify({ available: true, name: "Wohnzimmer", player_id: "sonos:living", powered: true, state: "playing" }), { status: 200 });
    if (request.command === "player_queues/all") return new Response(JSON.stringify([{ current_item: { artists: [{ name: "Künstler" }], duration: 200, name: "Titel" }, elapsed_time: 0, queue_id: "sonos:living", state: "playing" }]), { status: 200 });
    return new Response(JSON.stringify(null), { status: 200 });
  });
  const command = { commandId: "start-1", mediaKind: "playlist", mediaUri: "spotify://playlist/456", targetPlayerId: "sonos:living" };
  assert.equal(validMusicStartCommand(command), true);
  assert.equal((await client.startPlayback(command)).sourcePlayerId, "sonos:living");
  assert.deepEqual(calls.find((call) => call.command === "player_queues/play_media")?.args, { media: "spotify://playlist/456", option: "replace", queue_id: "sonos:living", radio_mode: false });
});

test("rejects malformed start media before Music Assistant is called", async () => {
  let requests = 0;
  const client = new MusicAssistantClient(config, async () => { requests += 1; return new Response(null, { status: 200 }); });
  await assert.rejects(client.startPlayback({ commandId: "start-1", mediaKind: "playlist", mediaUri: "javascript:bad", targetPlayerId: "sonos:living" }), { code: "music_assistant.invalid_start" });
  assert.equal(requests, 0);
});

test("filters global search results to the authorized profile provider", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify({ tracks: [
    { name: "Fremder Titel", provider_mappings: [{ provider_instance: "spotify--other" }], uri: "spotify://track/other" },
    { name: "Mein Titel", provider_mappings: [{ provider_instance: "spotify--lars" }], uri: "spotify://track/mine" }
  ] }), { status: 200 }));
  assert.deepEqual(await client.searchTracks("Titel", "spotify--lars"), [{ artist: null, kind: "track", name: "Mein Titel", uri: "spotify://track/mine" }]);
});

test("rejects catalog reads without an explicit profile provider", async () => {
  let requests = 0;
  const client = new MusicAssistantClient(config, async () => { requests += 1; return new Response("[]", { status: 200 }); });
  await assert.rejects(client.searchTracks("Titel"), { code: "music_assistant.search_invalid" });
  await assert.rejects(client.listPlaylists(0), { code: "music_assistant.playlists_invalid" });
  assert.equal(requests, 0);
});

test("accepts the current Music Assistant PlayerState response", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ available: true, name: "Wohnzimmer", player_id: "sonos:RINCON_123", playback_state: "playing", powered: true, volume_level: 42 }]), { status: 200 }));
  assert.deepEqual(await client.listPlayers(), [{ available: true, displayName: "Wohnzimmer", groupMembers: [], id: "sonos:RINCON_123", isPlaying: true, powered: true, syncedTo: null, volume: 42 }]);
});

test("rejects malformed players instead of guessing a target", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify({ result: [{ available: true, display_name: "Küche", player_id: "sonos kitchen", powered: true }] }), { status: 200 }));
  await assert.rejects(client.listPlayers(), { code: "music_assistant.invalid_response" });
});

test("accepts native provider ids without interpreting them", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify({ result: [{ available: true, display_name: "Leo", player_id: "ha/media_player.leo_echo", powered: true, state: "idle" }] }), { status: 200 }));
  const players = await client.listPlayers();
  assert.equal(players[0].id, "ha/media_player.leo_echo");
});

test("reports a safe reason when Music Assistant rejects the token", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(null, { status: 401 }));
  await assert.rejects(client.listPlayers(), { code: "music_assistant.authentication_failed" });
});

test("reports a safe reason when Music Assistant cannot be reached", async () => {
  const client = new MusicAssistantClient(config, async () => { throw new Error("network unavailable"); });
  await assert.rejects(client.listPlayers(), { code: "music_assistant.connection_failed" });
});

test("reports a safe HTTP status category without response content", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(null, { status: 404 }));
  await assert.rejects(client.listPlayers(), { code: "music_assistant.api_http_404" });
});

test("reads only local API documentation for E4.2 group feasibility", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (url, options) => {
    calls.push({ options, url });
    return new Response("players/cmd/group players/cmd/ungroup player_queues/get player_queues/next player_queues/previous player_queues/transfer", { status: 200 });
  });
  assert.deepEqual(await client.groupCapabilities(), { group: true, next: true, playMedia: false, previous: true, queueGet: true, queueTransfer: true, setMembers: false, ungroup: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://music-assistant.local:8095/api-docs");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${config.accessToken}`);
});

test("does not interpret an unavailable API document as a group capability", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(null, { status: 404 }));
  await assert.rejects(client.groupCapabilities(), { code: "music_assistant.api_docs_http_404" });
});

test("reads the fixed queue registry without exposing queue contents", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify([{ queue_id: "sonos:kitchen" }]), { status: 200 });
  });
  assert.equal(await client.queueRegistryAvailable(), true);
  assert.deepEqual(calls, [{ args: {}, command: "player_queues/all", message_id: "1" }]);
});

test("rejects malformed queue registry responses", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify({ queue_id: "not-an-array" }), { status: 200 }));
  await assert.rejects(client.queueRegistryAvailable(), { code: "music_assistant.queue_registry_invalid" });
});

test("normalizes only the active queue snapshot and keeps a public Spotify cover", async () => {
  const sourceSeconds = Date.now() / 1_000;
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ current_item: { album: { images: [{ url: "https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228" }], name: "Album" }, artists: [{ name: "Künstler" }], duration: 240, name: "Titel" }, elapsed_time: 61.9, elapsed_time_last_updated: sourceSeconds, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 }));
  const snapshot = await client.activeQueueSnapshot();
  assert.deepEqual({ ...snapshot, observedAt: undefined, sourceTime: undefined }, { album: "Album", artist: "Künstler", artworkRef: "https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228", durationSeconds: 240, isPlaying: true, observedAt: undefined, progressSeconds: 61, sourcePlayerId: "sonos:kitchen", sourceTime: undefined, title: "Titel" });
  assert.match(snapshot.observedAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(snapshot.sourceTime, new Date(sourceSeconds * 1_000).toISOString());
});

test("omits stale or future queue clocks instead of fabricating realtime", () => {
  const observedAt = "2026-08-19T17:00:00.000Z";
  assert.equal(verifiedQueueSourceTime("2026-08-19T16:54:59.999Z", observedAt, true), null);
  assert.equal(verifiedQueueSourceTime("2026-08-19T17:01:00.001Z", observedAt, true), null);
  assert.equal(verifiedQueueSourceTime("2026-08-19T16:59:00.000Z", observedAt, false), null);
  assert.equal(verifiedQueueSourceTime("2026-08-19T16:59:00.000Z", observedAt, true), "2026-08-19T16:59:00.000Z");
});

test("does not expose local or credentialed artwork paths", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ current_item: { image: { path: "http://music-assistant.local:8095/image/private" }, duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 }));
  assert.equal((await client.activeQueueSnapshot()).artworkRef, null);
});

test("reads a paused target queue without treating it as playing", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ current_item: { duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:kitchen", state: "paused" }]), { status: 200 }));
  const snapshot = await client.queueSnapshot("sonos:kitchen");
  assert.deepEqual({ ...snapshot, observedAt: undefined, sourceTime: undefined }, { album: null, artist: null, artworkRef: null, durationSeconds: 240, isPlaying: false, observedAt: undefined, progressSeconds: 61, sourcePlayerId: "sonos:kitchen", sourceTime: undefined, title: "Titel" });
  assert.match(snapshot.observedAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(snapshot.sourceTime, null);
});

test("retains the confirmed profile queue to publish a pause without guessing another paused queue", async () => {
  let queueState = "playing";
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([
    { current_item: { duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:kitchen", state: queueState },
    { current_item: { duration: 240, name: "Anderer Titel" }, elapsed_time: 12, queue_id: "sonos:dining", state: "paused" }
  ]), { status: 200 }));

  assert.equal((await client.activeQueueSnapshot()).isPlaying, true);
  queueState = "paused";
  const paused = await client.activeQueueSnapshot();
  assert.equal(paused.sourcePlayerId, "sonos:kitchen");
  assert.equal(paused.isPlaying, false);
  assert.equal(paused.progressSeconds, 61);
});

test("restores only a valid profile queue after Green restarts and publishes its paused state", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([
    { current_item: { duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:kitchen", state: "paused" },
    { current_item: { duration: 240, name: "Anderer Titel" }, elapsed_time: 12, queue_id: "sonos:dining", state: "paused" }
  ]), { status: 200 }));

  assert.equal(client.restoreProfileQueue("invalid queue id"), false);
  assert.equal(client.restoreProfileQueue("sonos:kitchen"), true);
  const paused = await client.activeQueueSnapshot();
  assert.equal(paused.sourcePlayerId, "sonos:kitchen");
  assert.equal(paused.isPlaying, false);
});

test("transfers only a bounded queue and confirms its target", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.command === "player_queues/transfer") return new Response("null", { status: 200 });
    if (request.command === "player_queues/all") return new Response(JSON.stringify([{ current_item: { duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:dining", state: "playing" }]), { status: 200 });
    return new Response(JSON.stringify({ available: true, name: "Esszimmer", player_id: request.args.player_id, playback_state: "playing", powered: true }), { status: 200 });
  });
  assert.equal((await client.transferQueue({ commandId: "command", sourcePlayerId: "sonos:kitchen", targetPlayerId: "sonos:dining" })).sourcePlayerId, "sonos:dining");
  assert.deepEqual(calls.map((call) => call.command), ["players/get", "players/get", "player_queues/transfer", "player_queues/all", "players/get"]);
  assert.deepEqual(calls[2], { args: { auto_play: true, source_queue_id: "sonos:kitchen", target_queue_id: "sonos:dining" }, command: "player_queues/transfer", message_id: "3" });
});

test("keeps a paused source paused when transferring its queue", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.command === "player_queues/transfer") return new Response("null", { status: 200 });
    if (request.command === "player_queues/all") return new Response(JSON.stringify([{ current_item: { duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:dining", state: "paused" }]), { status: 200 });
    return new Response(JSON.stringify({ available: true, name: request.args.player_id, player_id: request.args.player_id, playback_state: "paused", powered: true }), { status: 200 });
  });
  await client.transferQueue({ commandId: "command", sourcePlayerId: "sonos:kitchen", targetPlayerId: "sonos:dining" });
  assert.equal(calls.find((call) => call.command === "player_queues/transfer").args.auto_play, false);
});

test("does not transfer to a target that is currently unavailable", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request.command);
    return new Response(JSON.stringify({ available: false, name: "Küche", player_id: "sonos:kitchen", playback_state: "idle", powered: false }), { status: 200 });
  });
  await assert.rejects(
    client.transferQueue({ commandId: "command", sourcePlayerId: "sonos:dining", targetPlayerId: "sonos:kitchen" }),
    { code: "music_assistant.queue_transfer_target_unavailable" }
  );
  assert.deepEqual(calls, ["players/get"]);
});

test("rejects a same-room or malformed queue transfer before a request", () => {
  assert.equal(validMusicQueueTransferCommand({ commandId: "command", sourcePlayerId: "sonos:kitchen", targetPlayerId: "sonos:kitchen" }), false);
});

test("seeks only through the fixed command and confirms the re-read queue", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.command === "players/cmd/seek") return new Response("null", { status: 200 });
    return new Response(JSON.stringify([{ current_item: { duration: 240, name: "Titel" }, elapsed_time: 120, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 });
  });
  const snapshot = await client.seekQueue({ commandId: "command", sourcePlayerId: "sonos:kitchen", targetSeconds: 120 });
  assert.equal(snapshot.progressSeconds, 120);
  assert.deepEqual(calls.map((call) => call.command), ["player_queues/all", "players/cmd/seek", "player_queues/all"]);
  assert.deepEqual(calls[1].args, { player_id: "sonos:kitchen", position: 120 });
});

test("rejects an invalid seek before any Music Assistant request", () => {
  assert.equal(validMusicSeekCommand({ commandId: "command", sourcePlayerId: "sonos:kitchen", targetSeconds: -1 }), false);
});

test("advances only through the fixed queue command and verifies the queue index", async () => {
  const calls = [];
  let reads = 0;
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.command === "player_queues/next") return new Response("null", { status: 200 });
    reads += 1;
    return new Response(JSON.stringify([{ current_index: reads === 1 ? 0 : 1, current_item: { artists: [{ name: "Künstler" }], duration: 240, name: reads === 1 ? "Titel A" : "Titel B" }, elapsed_time: reads === 1 ? 60 : 0, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 });
  });
  const snapshot = await client.skipQueue({ commandId: "command", direction: "next", sourcePlayerId: "sonos:kitchen" });
  assert.equal(snapshot.title, "Titel B");
  assert.equal("queueIndex" in snapshot, false);
  assert.deepEqual(calls.map((call) => call.command), ["player_queues/all", "player_queues/next", "player_queues/all"]);
  assert.deepEqual(calls[1].args, { queue_id: "sonos:kitchen" });
});

test("confirms previous when Music Assistant restarts the current title", async () => {
  let reads = 0;
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.command === "player_queues/previous") return new Response("null", { status: 200 });
    reads += 1;
    return new Response(JSON.stringify([{ current_index: 2, current_item: { duration: 240, name: "Titel" }, elapsed_time: reads === 1 ? 70 : 0, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 });
  });
  assert.equal((await client.skipQueue({ commandId: "command", direction: "previous", sourcePlayerId: "sonos:kitchen" })).progressSeconds, 0);
});

test("rejects every skip direction outside the fixed pair before a request", async () => {
  assert.equal(validMusicSkipCommand({ commandId: "command", direction: "shuffle", sourcePlayerId: "sonos:kitchen" }), false);
  const client = new MusicAssistantClient(config, async () => assert.fail("must not send a request"));
  await assert.rejects(client.skipQueue({ commandId: "command", direction: "shuffle", sourcePlayerId: "sonos:kitchen" }), { code: "music_assistant.invalid_skip" });
});

test("accepts only a verified E3 pause command", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request.command);
    return new Response(JSON.stringify(request.command === "players/cmd/pause" ? null : {
      available: true, name: "Küche", player_id: "sonos:kitchen", playback_state: "paused", powered: true
    }), { status: 200 });
  });
  assert.equal(await client.setPlayback({ action: "pause", commandId: "command", playerId: "sonos:kitchen" }), false);
  assert.deepEqual(calls, ["players/cmd/pause", "players/get"]);
});

test("rejects every playback command outside E3 before a request", async () => {
  assert.equal(validMusicCommand({ action: "volume", commandId: "command", playerId: "sonos:kitchen" }), false);
  const client = new MusicAssistantClient(config, async () => assert.fail("must not send a request"));
  await assert.rejects(client.setPlayback({ action: "volume", commandId: "command", playerId: "sonos:kitchen" }), { code: "music_assistant.invalid_command" });
});

test("accepts only a bounded group with an explicit leader", () => {
  assert.equal(validMusicGroupCommand({ commandId: "command", leaderPlayerId: "sonos:kitchen", memberPlayerIds: ["sonos:kitchen", "sonos:living"] }), true);
  assert.equal(validMusicGroupCommand({ commandId: "command", leaderPlayerId: "sonos:kitchen", memberPlayerIds: ["sonos:living", "sonos:kitchen"] }), true);
  assert.equal(validMusicGroupCommand({ commandId: "command", leaderPlayerId: "sonos:kitchen", memberPlayerIds: ["sonos:living", "sonos:kitchen"], operation: "ungroup" }), true);
});

test("ungroups only the verified leader and reads every former member", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    if (request.command === "players/cmd/ungroup") return new Response("null", { status: 200 });
    const playerId = request.args.player_id;
    return new Response(JSON.stringify({ available: true, name: playerId, player_id: playerId, playback_state: "playing", powered: true, synced_to: null, group_members: [] }), { status: 200 });
  });
  await client.ungroupPlayers({ commandId: "command", leaderPlayerId: "sonos:kitchen", memberPlayerIds: ["sonos:kitchen", "sonos:living"], operation: "ungroup" });
  assert.equal(calls[0].command, "players/cmd/ungroup");
  assert.deepEqual(calls[0].args, { player_id: "sonos:kitchen" });
});

test("accepts only a verified E4.1 single-player volume command", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    return new Response(JSON.stringify(request.command === "players/cmd/volume_set" ? null : {
      available: true, name: "Küche", player_id: "sonos:kitchen", playback_state: "playing", powered: true, volume_level: 43
    }), { status: 200 });
  });
  assert.equal(await client.setVolume({ commandId: "command", playerId: "sonos:kitchen", targetVolume: 43 }), 43);
  assert.deepEqual(calls.map((call) => call.command), ["players/cmd/volume_set", "players/get"]);
  assert.deepEqual(calls[0].args, { player_id: "sonos:kitchen", volume_level: 43 });
});

test("rejects an unsafe volume command before a request", async () => {
  assert.equal(validMusicVolumeCommand({ commandId: "command", playerId: "sonos:kitchen", targetVolume: 101 }), false);
  const client = new MusicAssistantClient(config, async () => assert.fail("must not send a request"));
  await assert.rejects(client.setVolume({ commandId: "command", playerId: "sonos:kitchen", targetVolume: -1 }), { code: "music_assistant.invalid_command" });
});
