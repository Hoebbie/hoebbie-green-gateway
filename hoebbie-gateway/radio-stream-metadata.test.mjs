import assert from "node:assert/strict";
import test from "node:test";
import { radioIcyMetadata } from "./radio-stream-metadata.mjs";

function icyBlock(streamTitle) {
  const payload = new TextEncoder().encode(`StreamTitle='${streamTitle}';`);
  const blocks = Math.ceil(payload.length / 16);
  const bytes = new Uint8Array(8 + 1 + blocks * 16);
  bytes[8] = blocks;
  bytes.set(payload, 9);
  return bytes;
}

test("reads artist and title from one ICY metadata block", () => {
  assert.deepEqual(radioIcyMetadata(icyBlock("Artist - Song"), 8), { artist: "Artist", title: "Song" });
});

test("keeps a station identifier when an ICY block has no artist separator", () => {
  assert.deepEqual(radioIcyMetadata(icyBlock("90s90s DAB"), 8), { artist: null, title: "90s90s DAB" });
});

test("rejects incomplete or malformed ICY metadata", () => {
  assert.equal(radioIcyMetadata(new Uint8Array(9), 8), null);
  assert.equal(radioIcyMetadata(icyBlock("Artist - Song"), 0), null);
});
