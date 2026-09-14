import { execFile } from "node:child_process";

const MAXIMUM_METADATA_BYTES = 16_384;
const METADATA_BLOCK_SCAN_LIMIT = 8;

function parseIcyTitle(bytes) {
  const raw = new TextDecoder("latin1").decode(bytes);
  const match = /StreamTitle='([^']*)'/i.exec(raw);
  const title = match?.[1]?.trim();
  if (!title) return null;
  const separator = title.indexOf(" - ");
  return separator > 0 && separator < title.length - 3 ? { artist: title.slice(0, separator).trim() || null, title: title.slice(separator + 3).trim() } : { artist: null, title };
}

export function radioIcyMetadata(bytes, metadataInterval) {
  if (!Number.isInteger(metadataInterval) || metadataInterval < 1 || metadataInterval > 65_536 || !(bytes instanceof Uint8Array) || bytes.length <= metadataInterval) return null;
  const length = bytes[metadataInterval] * 16;
  if (length < 1 || length > MAXIMUM_METADATA_BYTES || bytes.length < metadataInterval + 1 + length) return null;
  return parseIcyTitle(bytes.slice(metadataInterval + 1, metadataInterval + 1 + length));
}

function radioIcyMetadataFromStream(bytes, metadataInterval) {
  let metadataOffset = metadataInterval;
  for (let block = 0; block < METADATA_BLOCK_SCAN_LIMIT; block += 1) {
    if (bytes.length <= metadataOffset) return null;
    const length = bytes[metadataOffset] * 16;
    if (length > MAXIMUM_METADATA_BYTES || bytes.length < metadataOffset + 1 + length) return null;
    if (length > 0) {
      const metadata = parseIcyTitle(bytes.slice(metadataOffset + 1, metadataOffset + 1 + length));
      if (metadata) return metadata;
    }
    metadataOffset += 1 + length + metadataInterval;
  }
  return null;
}

function headerEnd(bytes, offset) {
  for (let index = offset; index + 3 < bytes.length; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) return index + 4;
  }
  return null;
}

function startsIcyResponse(bytes, offset) {
  const prefix = new TextDecoder("latin1").decode(bytes.slice(offset, Math.min(offset + 5, bytes.length)));
  return prefix.startsWith("HTTP/") || prefix.startsWith("ICY ");
}

/** Parses the final bounded ICY response returned by curl for legacy streams. */
export function radioIcyResponseMetadata(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  let offset = 0;
  let interval = null;
  while (offset < bytes.length) {
    const end = headerEnd(bytes, offset);
    if (end === null) return null;
    const headers = new TextDecoder("latin1").decode(bytes.slice(offset, end));
    if (!/^(?:HTTP\/\d(?:\.\d)?|ICY)\s/i.test(headers)) return null;
    const match = /^icy-metaint:\s*(\d+)\s*$/im.exec(headers);
    if (match) interval = Number(match[1]);
    offset = end;
    if (!startsIcyResponse(bytes, offset)) break;
  }
  return interval === null ? null : radioIcyMetadataFromStream(bytes.slice(offset), interval);
}

function curlIcyResponse(streamUri) {
  return new Promise((resolve) => {
    execFile("curl", ["--silent", "--location", "--include", "--max-time", "7", "--header", "Icy-MetaData: 1", streamUri], { encoding: "buffer", maxBuffer: 98_304, timeout: 8_000 }, (_error, stdout) => resolve(new Uint8Array(stdout)));
  });
}

async function fetchRadioStreamMetadata(streamUri, fetcher) {
  try {
    const response = await fetcher(streamUri, { headers: { "Icy-MetaData": "1" }, redirect: "follow", signal: AbortSignal.timeout(7_000) });
    const interval = Number(response.headers.get("icy-metaint"));
    if (!response.ok || !response.body || !Number.isInteger(interval) || interval < 1 || interval > 65_536) return null;
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    const maximumProbeBytes = Math.min((interval + 1 + MAXIMUM_METADATA_BYTES) * METADATA_BLOCK_SCAN_LIMIT, 81_921);
    while (size < maximumProbeBytes) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); size += next.value.length; if (size >= interval + 1) { const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; } const metadata = radioIcyMetadataFromStream(all, interval); if (metadata) { await reader.cancel(); return metadata; } } }
    await reader.cancel(); return null;
  } catch { return null; }
}

/** Reads one bounded ICY metadata block from a server-authorized HTTPS stream. */
export async function radioStreamMetadata(streamUri, fetcher = fetch, curlReader = curlIcyResponse) {
  if (typeof streamUri !== "string" || !/^https:\/\//i.test(streamUri)) return null;
  const metadata = await fetchRadioStreamMetadata(streamUri, fetcher);
  if (metadata) return metadata;
  // Some official radio CDNs intentionally use the legacy `ICY 200` status
  // line, or send an empty first block, that strict HTTP clients do not expose
  // as useful metadata. curl is available solely for this bounded fallback.
  return radioIcyResponseMetadata(await curlReader(streamUri));
}
