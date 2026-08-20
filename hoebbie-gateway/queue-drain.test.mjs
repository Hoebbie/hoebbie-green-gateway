import assert from "node:assert/strict";
import test from "node:test";

import { BoundedQueueDrain, CoalescedAsyncTask, withinDeadline } from "./queue-drain.mjs";

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

test("coalesces a realtime burst into one delayed report", async () => {
  let runs = 0;
  const task = new CoalescedAsyncTask({ delayMilliseconds: 5, run: async () => { runs += 1; } });

  const running = task.request();
  void task.request();
  void task.request();
  await running;

  assert.equal(runs, 1);
});

test("keeps one follow-up when a signal arrives during a report", async () => {
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  let runs = 0;
  const task = new CoalescedAsyncTask({
    run: async () => {
      runs += 1;
      if (runs === 1) await first;
    }
  });

  const running = task.request();
  await new Promise((resolve) => setImmediate(resolve));
  void task.request();
  void task.request();
  releaseFirst();
  await running;

  assert.equal(runs, 2);
});

test("reports a refresh failure and still runs a pending follow-up", async () => {
  const failures = [];
  let runs = 0;
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const task = new CoalescedAsyncTask({
    onError: (error) => failures.push(error.message),
    run: async () => {
      runs += 1;
      if (runs === 1) {
        await first;
        throw new Error("refresh_failed");
      }
    }
  });

  const running = task.request();
  await new Promise((resolve) => setImmediate(resolve));
  void task.request();
  releaseFirst();
  await running;

  assert.equal(runs, 2);
  assert.deepEqual(failures, ["refresh_failed"]);
});

test("releases a stuck local operation after its deadline", async () => {
  await assert.rejects(
    withinDeadline(new Promise(() => undefined), 10, "music_assistant.command_timeout"),
    { code: "music_assistant.command_timeout", message: "music_assistant.command_timeout" }
  );
});
