const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validRealtimeSession(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.accessToken !== "string" || value.accessToken.length < 80) return false;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return false;
  if (typeof value.gatewayId !== "string" || !uuid.test(value.gatewayId)) return false;
  if (typeof value.publishableKey !== "string" || value.publishableKey.length < 10) return false;
  if (typeof value.supabaseUrl !== "string") return false;
  try { return new URL(value.supabaseUrl).protocol === "https:"; } catch { return false; }
}

export function realtimeSocketUrl(session) {
  const url = new URL(session.supabaseUrl);
  url.protocol = "wss:";
  url.pathname = "/realtime/v1/websocket";
  url.search = "";
  url.searchParams.set("apikey", session.publishableKey);
  url.searchParams.set("vsn", "2.0.0");
  return url.toString();
}

export function realtimeTopic(gatewayId) {
  return `realtime:home-gateway:${gatewayId}:commands`;
}

export function joinMessage(topic, accessToken, ref) {
  return [String(ref), String(ref), topic, "phx_join", {
    access_token: accessToken,
    config: {
      broadcast: { ack: false, self: false },
      presence: { enabled: false },
      postgres_changes: [],
      private: true
    }
  }];
}

export function heartbeatMessage(ref) {
  return [null, String(ref), "phoenix", "heartbeat", {}];
}

function decodeBinaryBroadcast(buffer) {
  const view = new DataView(buffer);
  // Supabase Realtime protocol 2.0 uses frame type 4 for broadcasts sent by
  // the server. All other protocol messages continue to arrive as JSON text.
  if (view.byteLength < 5 || view.getUint8(0) !== 4) return null;

  const topicSize = view.getUint8(1);
  const eventSize = view.getUint8(2);
  const metadataSize = view.getUint8(3);
  const payloadEncoding = view.getUint8(4);
  const headerSize = 5;
  const payloadOffset = headerSize + topicSize + eventSize + metadataSize;
  if (payloadOffset > view.byteLength || payloadEncoding !== 1) return null;

  const decoder = new TextDecoder();
  let offset = headerSize;
  const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
  offset += topicSize;
  const event = decoder.decode(buffer.slice(offset, offset + eventSize));
  offset += eventSize;
  const metadataText = decoder.decode(buffer.slice(offset, offset + metadataSize));
  const payloadText = decoder.decode(buffer.slice(payloadOffset));

  let metadata = {};
  let payload = {};
  try {
    if (metadataText) metadata = JSON.parse(metadataText);
    if (payloadText) payload = JSON.parse(payloadText);
  } catch {
    return null;
  }

  return [null, null, topic, "broadcast", { event, payload, meta: metadata }];
}

/** Decode both JSON text frames and protocol-2 binary broadcast frames. */
export async function decodeRealtimeMessage(raw) {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }

  let buffer = null;
  if (raw instanceof ArrayBuffer) {
    buffer = raw;
  } else if (ArrayBuffer.isView(raw)) {
    buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  } else if (typeof Blob !== "undefined" && raw instanceof Blob) {
    buffer = await raw.arrayBuffer();
  }

  return buffer ? decodeBinaryBroadcast(buffer) : null;
}

export function isCommandReady(message, topic) {
  return Array.isArray(message)
    && message.length === 5
    && message[2] === topic
    && message[3] === "broadcast"
    && message[4] !== null
    && typeof message[4] === "object"
    && message[4].event === "command_ready";
}

/** A refresh signal only asks Green to read its local Home Assistant state. */
export function isInventoryRefresh(message, topic) {
  return Array.isArray(message)
    && message.length === 5
    && message[2] === topic
    && message[3] === "broadcast"
    && message[4] !== null
    && typeof message[4] === "object"
    && message[4].event === "inventory_refresh";
}
