import assert from "node:assert/strict";
import test from "node:test";
import { radioIcyMetadata, radioIcyResponseMetadata, radioStreamMetadata } from "./radio-stream-metadata.mjs";

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

test("continues after an empty first ICY block", async () => {
  const interval = 8;
  const metadata = new TextEncoder().encode("StreamTitle='Artist - Song';");
  const blockCount = Math.ceil(metadata.length / 16);
  const bytes = new Uint8Array(interval + 1 + interval + 1 + blockCount * 16);
  bytes[interval] = 0;
  bytes[interval + 1 + interval] = blockCount;
  bytes.set(metadata, interval + 1 + interval + 1);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const fetcher = async () => new Response(stream, { headers: { "icy-metaint": String(interval) } });
  assert.deepEqual(await radioStreamMetadata("https://example.test/radio", fetcher), { artist: "Artist", title: "Song" });
});

test("reads a legacy ICY response after a strict HTTP reader rejects it", () => {
  const interval = 8;
  const metadata = new TextEncoder().encode("StreamTitle='Artist - Song';");
  const blocks = Math.ceil(metadata.length / 16);
  const body = new Uint8Array(interval + 1 + blocks * 16);
  body[interval] = blocks;
  body.set(metadata, interval + 1);
  const header = new TextEncoder().encode(`ICY 200 OK\r\nicy-metaint: ${interval}\r\n\r\n`);
  const response = new Uint8Array(header.length + body.length);
  response.set(header);
  response.set(body, header.length);
  assert.deepEqual(radioIcyResponseMetadata(response), { artist: "Artist", title: "Song" });
});

test("follows an HTTP redirect to a legacy ICY response", () => {
  const interval = 8;
  const body = icyBlock("Artist - Song");
  const redirect = new TextEncoder().encode("HTTP/1.1 302 Found\r\nlocation: https://stream.example.test/live\r\n\r\n");
  const header = new TextEncoder().encode(`ICY 200 OK\r\nicy-metaint: ${interval}\r\n\r\n`);
  const response = new Uint8Array(redirect.length + header.length + body.length);
  response.set(redirect);
  response.set(header, redirect.length);
  response.set(body, redirect.length + header.length);
  assert.deepEqual(radioIcyResponseMetadata(response), { artist: "Artist", title: "Song" });
});

test("uses the compatibility reader when a valid HTTP response has no title", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); controller.close(); } });
  const fetcher = async () => new Response(stream, { headers: { "icy-metaint": "8" } });
  let compatibilityRead = false;
  const curlReader = async () => { compatibilityRead = true; return new Uint8Array(); };
  assert.equal(await radioStreamMetadata("https://example.test/radio", fetcher, curlReader), null);
  assert.equal(compatibilityRead, true);
});

test("rejects incomplete or malformed ICY metadata", () => {
  assert.equal(radioIcyMetadata(new Uint8Array(9), 8), null);
  assert.equal(radioIcyMetadata(icyBlock("Artist - Song"), 0), null);
});
