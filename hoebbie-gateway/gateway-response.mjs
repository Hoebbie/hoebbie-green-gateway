import { withinDeadline } from "./queue-drain.mjs";

const safeMarker = (value) => typeof value === "string" && /^[a-z0-9_.-]{1,100}$/i.test(value) ? value : null;

export async function reportGatewayCompletion({ deadlineMilliseconds = 4_000, failureCode, post }) {
  let lastFailure = failureCode;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await withinDeadline(post(), deadlineMilliseconds, failureCode);
      if (response.ok) return;
      lastFailure = await safeGatewayResponseFailure(response, failureCode);
    } catch (error) {
      // Sending the same completion again is safe: command execution is not
      // repeated, and the server owns the final command state.
      lastFailure = safeGatewayError(error, failureCode);
    }
  }
  throw new Error(lastFailure);
}

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
