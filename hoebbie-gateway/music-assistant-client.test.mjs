import assert from "node:assert/strict";
import test from "node:test";

import { MusicAssistantClient, MusicAssistantGatewayError, musicAssistantRealtimeEvent, validMusicAssistantConfig, validMusicCommand, validMusicGroupCommand, validMusicQueueTransferCommand, validMusicVolumeCommand } from "./music-assistant-client.mjs";

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
    return new Response("players/cmd/group players/cmd/ungroup player_queues/get player_queues/transfer", { status: 200 });
  });
  assert.deepEqual(await client.groupCapabilities(), { group: true, queueGet: true, queueTransfer: true, setMembers: false, ungroup: true });
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
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ current_item: { album: { images: [{ url: "https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228" }], name: "Album" }, artists: [{ name: "Künstler" }], duration: 240, name: "Titel" }, elapsed_time: 61.9, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 }));
  assert.deepEqual(await client.activeQueueSnapshot(), { album: "Album", artist: "Künstler", artworkRef: "https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228", durationSeconds: 240, isPlaying: true, progressSeconds: 61, sourcePlayerId: "sonos:kitchen", title: "Titel" });
});

test("does not expose local or credentialed artwork paths", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ current_item: { image: { path: "http://music-assistant.local:8095/image/private" }, duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:kitchen", state: "playing" }]), { status: 200 }));
  assert.equal((await client.activeQueueSnapshot()).artworkRef, null);
});

test("reads a paused target queue without treating it as playing", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ current_item: { duration: 240, name: "Titel" }, elapsed_time: 61, queue_id: "sonos:kitchen", state: "paused" }]), { status: 200 }));
  assert.deepEqual(await client.queueSnapshot("sonos:kitchen"), { album: null, artist: null, artworkRef: null, durationSeconds: 240, isPlaying: false, progressSeconds: 61, sourcePlayerId: "sonos:kitchen", title: "Titel" });
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
