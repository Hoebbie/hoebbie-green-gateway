import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("copies every local gateway runtime import into the add-on image", async () => {
  const gateway = await readFile(new URL("./gateway.mjs", import.meta.url), "utf8");
  const dockerfile = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  const localImports = [...gateway.matchAll(/from\s+["'][.]\/(.+?)["']/g)].map((match) => match[1]);
  assert.ok(localImports.length > 0);
  for (const importedFile of localImports) {
    assert.match(dockerfile, new RegExp(`^COPY ${importedFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} /app/${importedFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
});

test("refreshes the personal profile independently every 15 seconds", async () => {
  const gateway = await readFile(new URL("./gateway.mjs", import.meta.url), "utf8");
  assert.match(gateway, /const PROFILE_STATUS_REFRESH_INTERVAL_MS = 15_000;/);
  assert.match(gateway, /void refreshPersonalProfileStatus\(\);/);
  assert.match(
    gateway,
    /setInterval\(\(\) => \{ void refreshPersonalProfileStatus\(\); \}, PROFILE_STATUS_REFRESH_INTERVAL_MS\)/
  );
});
