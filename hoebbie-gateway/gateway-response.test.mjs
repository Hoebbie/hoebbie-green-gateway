import assert from "node:assert/strict";
import test from "node:test";

import { safeGatewayError, safeGatewayResponseFailure } from "./gateway-response.mjs";

test("retains only status and allow-listed gateway error categories", async () => {
  assert.equal(await safeGatewayResponseFailure(new Response(JSON.stringify({ error: "completion_rejected" }), { status: 409 }), "gateway.completion_failed"), "gateway.completion_failed:http_409:completion_rejected");
  assert.equal(await safeGatewayResponseFailure(new Response(JSON.stringify({ error: "token=secret value" }), { status: 503 }), "gateway.completion_failed"), "gateway.completion_failed:http_503");
});

test("does not log arbitrary thrown response content", () => {
  assert.equal(safeGatewayError(Object.assign(new Error("safe.failure"), { code: "music_assistant.timeout" }), "gateway.failed"), "music_assistant.timeout");
  assert.equal(safeGatewayError(new Error("Authorization: Bearer private"), "gateway.failed"), "gateway.failed");
});
