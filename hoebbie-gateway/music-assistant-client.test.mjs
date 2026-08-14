import assert from "node:assert/strict";
import test from "node:test";

import { MusicAssistantClient, MusicAssistantGatewayError, validMusicAssistantConfig, validMusicCommand } from "./music-assistant-client.mjs";

const config = { accessToken: "a".repeat(32), baseUrl: "http://music-assistant.local:8095/" };

test("rejects an unsafe Music Assistant configuration before a request", () => {
  assert.throws(() => validMusicAssistantConfig({ ...config, accessToken: "short" }), MusicAssistantGatewayError);
  assert.throws(() => validMusicAssistantConfig({ ...config, baseUrl: "file:///tmp/music-assistant" }), MusicAssistantGatewayError);
});

test("uses only the fixed player discovery command", async () => {
  const calls = [];
  const client = new MusicAssistantClient(config, async (url, options) => {
    calls.push({ options, url });
    return new Response(JSON.stringify({ result: [{ available: true, display_name: "Küche", player_id: "sonos:kitchen", powered: true, state: "playing", volume_level: 38 }] }), { status: 200 });
  });
  assert.deepEqual(await client.listPlayers(), [{ available: true, displayName: "Küche", id: "sonos:kitchen", isPlaying: true, powered: true, volume: 38 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://music-assistant.local:8095/api");
  assert.deepEqual(JSON.parse(calls[0].options.body), { args: {}, command: "players/all", message_id: "1" });
});

test("accepts the current Music Assistant PlayerState response", async () => {
  const client = new MusicAssistantClient(config, async () => new Response(JSON.stringify([{ available: true, name: "Wohnzimmer", player_id: "sonos:RINCON_123", playback_state: "playing", powered: true, volume_level: 42 }]), { status: 200 }));
  assert.deepEqual(await client.listPlayers(), [{ available: true, displayName: "Wohnzimmer", id: "sonos:RINCON_123", isPlaying: true, powered: true, volume: 42 }]);
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
