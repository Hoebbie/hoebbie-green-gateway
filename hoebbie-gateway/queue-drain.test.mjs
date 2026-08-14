import assert from "node:assert/strict";
import test from "node:test";

import { BoundedQueueDrain, withinDeadline } from "./queue-drain.mjs";

test("drains a bounded command queue until it is empty", async () => {
  const results = [true, true, false];
  const claimed = [];
  const drain = new BoundedQueueDrain({
    claimOnce: async () => results.shift(),
    onClaimed: (count) => claimed.push(count)
  });

  await drain.request();

  assert.equal(results.length, 0);
  assert.deepEqual(claimed, [2]);
});

test("remembers a wake-up received while a music claim is running", async () => {
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const drain = new BoundedQueueDrain({
    claimOnce: async () => {
      calls += 1;
      return calls === 1 ? first : false;
    }
  });

  const running = drain.request();
  void drain.request();
  releaseFirst(false);
  await running;

  assert.equal(calls, 2);
});

test("releases a stuck local operation after its deadline", async () => {
  await assert.rejects(
    withinDeadline(new Promise(() => undefined), 10, "music_assistant.command_timeout"),
    { message: "music_assistant.command_timeout" }
  );
});
