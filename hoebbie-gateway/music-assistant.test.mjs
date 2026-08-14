import assert from "node:assert/strict";
import test from "node:test";

import { MusicAssistantClient, MusicAssistantError, validMusicCommand } from "./music-assistant.mjs";

const config = { accessToken: "a".repeat(32), baseUrl: "http://music-assistant.local:8095/" };

test("accepts only the E3 pause and play command shape", () => {
  assert.equal(validMusicCommand({ commandId: "id", playerId: "sonos:kitchen", action: "pause" }), true);
  assert.equal(validMusicCommand({ commandId: "id", playerId: "sonos:kitchen", action: "volume" }), false);
  assert.equal(validMusicCommand({ commandId: "id", playerId: "sonos kitchen", action: "play" }), false);
});

test("sends only pause followed by state verification", async () => {
  const commands = [];
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body);
    commands.push(request.command);
    return new Response(JSON.stringify({ result: request.command === "players/cmd/pause" ? null : {
    player_id: "sonos:kitchen", state: "paused"
    } }), { status: 200 });
  };
  const client = new MusicAssistantClient(config, { fetcher, wait: async () => {} });
  assert.equal(await client.execute({ commandId: "id", playerId: "sonos:kitchen", action: "pause" }), false);
  assert.deepEqual(commands, ["players/cmd/pause", "players/get"]);
});

test("fails closed when Music Assistant does not confirm the requested state", async () => {
  const fetcher = async () => new Response(JSON.stringify({ result: { player_id: "sonos:kitchen", state: "playing" } }), { status: 200 });
  const client = new MusicAssistantClient(config, { fetcher, wait: async () => {} });
  await assert.rejects(client.execute({ commandId: "id", playerId: "sonos:kitchen", action: "pause" }), (error) => error instanceof MusicAssistantError && error.code === "music_assistant.verification_failed");
});
