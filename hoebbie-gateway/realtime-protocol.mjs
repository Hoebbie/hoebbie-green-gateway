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
      private: true
    }
  }];
}

export function heartbeatMessage(ref) {
  return [null, String(ref), "phoenix", "heartbeat", {}];
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
