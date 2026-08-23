import assert from "node:assert/strict";
import test from "node:test";

import { reportGatewayCompletion, safeGatewayError, safeGatewayResponseFailure } from "./gateway-response.mjs";

test("retries a lost completion without repeating the device command", async () => {
  let posts = 0;
  await reportGatewayCompletion({
    failureCode: "gateway.entity_completion_failed",
    post: async () => {
      posts += 1;
      if (posts === 1) throw new Error("network_lost");
      return new Response(null, { status: 200 });
    }
  });
  assert.equal(posts, 2);
});

test("bounds an unavailable completion endpoint", async () => {
  let posts = 0;
  await assert.rejects(
    reportGatewayCompletion({
      deadlineMilliseconds: 5,
      failureCode: "gateway.entity_completion_failed",
      post: async () => {
        posts += 1;
        return new Promise(() => undefined);
      }
    }),
    { message: "gateway.entity_completion_failed" }
  );
  assert.equal(posts, 2);
});

test("accepts the next completion after a previous endpoint failure", async () => {
  await assert.rejects(
    reportGatewayCompletion({
      failureCode: "gateway.entity_completion_failed",
      post: async () => new Response(null, { status: 503 })
    }),
    { message: "gateway.entity_completion_failed:http_503" }
  );

  await reportGatewayCompletion({
    failureCode: "gateway.entity_completion_failed",
    post: async () => new Response(null, { status: 200 })
  });
});

test("retains only status and allow-listed gateway error categories", async () => {
  assert.equal(await safeGatewayResponseFailure(new Response(JSON.stringify({ error: "completion_rejected" }), { status: 409 }), "gateway.completion_failed"), "gateway.completion_failed:http_409:completion_rejected");
  assert.equal(await safeGatewayResponseFailure(new Response(JSON.stringify({ error: "token=secret value" }), { status: 503 }), "gateway.completion_failed"), "gateway.completion_failed:http_503");
});

test("does not log arbitrary thrown response content", () => {
  assert.equal(safeGatewayError(Object.assign(new Error("safe.failure"), { code: "music_assistant.timeout" }), "gateway.failed"), "music_assistant.timeout");
  assert.equal(safeGatewayError(new Error("Authorization: Bearer private"), "gateway.failed"), "gateway.failed");
});
