import assert from "node:assert/strict";
import test from "node:test";

import { decodeRealtimeMessage, heartbeatMessage, isCommandReady, isInventoryRefresh, joinMessage, realtimeSocketUrl, realtimeTopic, validRealtimeSession } from "./realtime-protocol.mjs";

const session = {
  accessToken: "x".repeat(80),
  expiresAt: 1_800_000_000,
  gatewayId: "3eecf9f4-1f76-4e21-bb39-dc682ea22fc3",
  publishableKey: "sb_publishable_test",
  supabaseUrl: "https://example.supabase.co"
};

test("uses a private, gateway-scoped Realtime join without a device command", () => {
  const topic = realtimeTopic(session.gatewayId);
  assert.equal(topic, "realtime:home-gateway:3eecf9f4-1f76-4e21-bb39-dc682ea22fc3:commands");
  assert.deepEqual(joinMessage(topic, session.accessToken, 4), ["4", "4", topic, "phx_join", {
    access_token: session.accessToken,
    config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, postgres_changes: [], private: true }
  }]);
  assert.deepEqual(heartbeatMessage(5), [null, "5", "phoenix", "heartbeat", {}]);
});

function binaryBroadcast(topic, event, payload, metadata = {}) {
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  const eventBytes = encoder.encode(event);
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const frame = new Uint8Array(5 + topicBytes.length + eventBytes.length + metadataBytes.length + payloadBytes.length);
  frame.set([4, topicBytes.length, eventBytes.length, metadataBytes.length, 1]);
  let offset = 5;
  for (const bytes of [topicBytes, eventBytes, metadataBytes, payloadBytes]) {
    frame.set(bytes, offset);
    offset += bytes.length;
  }
  return frame.buffer;
}

test("decodes protocol-2 binary broadcasts without exposing payloads to logs", async () => {
  const topic = realtimeTopic(session.gatewayId);
  const decoded = await decodeRealtimeMessage(binaryBroadcast(topic, "command_ready", { kind: "command_ready" }, { id: "message-id" }));
  assert.deepEqual(decoded, [null, null, topic, "broadcast", {
    event: "command_ready",
    payload: { kind: "command_ready" },
    meta: { id: "message-id" }
  }]);
  assert.equal(isCommandReady(decoded, topic), true);
});

test("decodes text frames and rejects malformed or unsupported binary frames", async () => {
  const textFrame = ["1", "1", "realtime:test", "phx_reply", { status: "ok" }];
  assert.deepEqual(await decodeRealtimeMessage(JSON.stringify(textFrame)), textFrame);
  assert.equal(await decodeRealtimeMessage("not json"), null);
  assert.equal(await decodeRealtimeMessage(new Uint8Array([4, 1]).buffer), null);
  assert.equal(await decodeRealtimeMessage(new Uint8Array([3, 0, 0, 0, 1]).buffer), null);
});

test("only accepts a data-free command-ready broadcast on the matching topic", () => {
  const topic = realtimeTopic(session.gatewayId);
  assert.equal(isCommandReady([null, null, topic, "broadcast", { event: "command_ready", payload: {} }], topic), true);
  assert.equal(isCommandReady([null, null, topic, "broadcast", { event: "turn_on" }], topic), false);
  assert.equal(isCommandReady([null, null, "realtime:other", "broadcast", { event: "command_ready" }], topic), false);
});

test("accepts only a data-free inventory refresh on the matching private topic", () => {
  const topic = realtimeTopic(session.gatewayId);
  assert.equal(isInventoryRefresh([null, null, topic, "broadcast", { event: "inventory_refresh", payload: {} }], topic), true);
  assert.equal(isInventoryRefresh([null, null, topic, "broadcast", { event: "inventory_refresh", payload: { entityId: "light.secret" } }], topic), true);
  assert.equal(isInventoryRefresh([null, null, "realtime:other", "broadcast", { event: "inventory_refresh" }], topic), false);
  assert.equal(isInventoryRefresh([null, null, topic, "broadcast", { event: "command_ready" }], topic), false);
});

test("validates short-lived gateway sessions and WebSocket endpoint", () => {
  assert.equal(validRealtimeSession(session), true);
  assert.equal(validRealtimeSession({ ...session, gatewayId: "not-a-uuid" }), false);
  assert.equal(realtimeSocketUrl(session), "wss://example.supabase.co/realtime/v1/websocket?apikey=sb_publishable_test&vsn=2.0.0");
});
