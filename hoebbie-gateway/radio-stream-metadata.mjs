const MAXIMUM_METADATA_BYTES = 16_384;

export function radioIcyMetadata(bytes, metadataInterval) {
  if (!Number.isInteger(metadataInterval) || metadataInterval < 1 || metadataInterval > 65_536 || !(bytes instanceof Uint8Array) || bytes.length <= metadataInterval) return null;
  const length = bytes[metadataInterval] * 16;
  if (length < 1 || length > MAXIMUM_METADATA_BYTES || bytes.length < metadataInterval + 1 + length) return null;
  const raw = new TextDecoder("latin1").decode(bytes.slice(metadataInterval + 1, metadataInterval + 1 + length));
  const match = /StreamTitle='([^']*)'/i.exec(raw);
  const title = match?.[1]?.trim();
  if (!title) return null;
  const separator = title.indexOf(" - ");
  return separator > 0 && separator < title.length - 3 ? { artist: title.slice(0, separator).trim() || null, title: title.slice(separator + 3).trim() } : { artist: null, title };
}

/** Reads one bounded ICY metadata block from a server-authorized HTTPS stream. */
export async function radioStreamMetadata(streamUri, fetcher = fetch) {
  if (typeof streamUri !== "string" || !/^https:\/\//i.test(streamUri)) return null;
  try {
    const response = await fetcher(streamUri, { headers: { "Icy-MetaData": "1" }, redirect: "follow", signal: AbortSignal.timeout(7_000) });
    const interval = Number(response.headers.get("icy-metaint"));
    if (!response.ok || !response.body || !Number.isInteger(interval) || interval < 1 || interval > 65_536) return null;
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (size < Math.min(interval + 1 + MAXIMUM_METADATA_BYTES, 81_921)) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); size += next.value.length; if (size >= interval + 1) { const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; } const length = all[interval] * 16; if (size >= interval + 1 + length) { await reader.cancel(); return radioIcyMetadata(all, interval); } } }
    await reader.cancel(); return null;
  } catch { return null; }
}
