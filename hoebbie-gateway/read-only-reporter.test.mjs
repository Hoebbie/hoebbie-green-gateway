import assert from "node:assert/strict";
import test from "node:test";
import { runReadOnlyReporter } from "./read-only-reporter.mjs";

test("a failed read-only report is contained so the next reporter can still run", async () => {
  const errors = [];
  let profileReported = false;

  assert.equal(await runReadOnlyReporter(
    async () => { throw new Error("inventory unavailable"); },
    (error) => errors.push(error instanceof Error ? error.message : "unknown")
  ), false);
  assert.equal(await runReadOnlyReporter(
    async () => { profileReported = true; },
    (error) => errors.push(error instanceof Error ? error.message : "unknown")
  ), true);

  assert.deepEqual(errors, ["inventory unavailable"]);
  assert.equal(profileReported, true);
});
