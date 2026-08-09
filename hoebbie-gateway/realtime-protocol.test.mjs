import assert from "node:assert/strict";
import test from "node:test";

import { heartbeatMessage, isCommandReady, isInventoryRefresh, joinMessage, realtimeSocketUrl, realtimeTopic, validRealtimeSession } from "./realtime-protocol.mjs";

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
    config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: true }
  }]);
  assert.deepEqual(heartbeatMessage(5), [null, "5", "phoenix", "heartbeat", {}]);
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
