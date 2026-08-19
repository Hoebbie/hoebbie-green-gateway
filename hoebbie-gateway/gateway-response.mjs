const safeMarker = (value) => typeof value === "string" && /^[a-z0-9_.-]{1,100}$/i.test(value) ? value : null;

export async function safeGatewayResponseFailure(response, fallback) {
  const payload = await response.json().catch(() => null);
  const marker = safeMarker(payload?.error) ?? safeMarker(payload?.reason);
  return `${fallback}:http_${Number.isInteger(response.status) ? response.status : 0}${marker ? `:${marker}` : ""}`;
}

export function safeGatewayError(error, fallback) {
  const code = error && typeof error === "object" ? safeMarker(error.code) : null;
  const message = error instanceof Error && /^[a-z0-9_.:-]{1,180}$/i.test(error.message) ? error.message : null;
  return code ?? message ?? fallback;
}
