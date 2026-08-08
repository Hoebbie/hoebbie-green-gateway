import { describe, expect, it, vi } from "vitest";

import { HomeAssistantGatewayRunner, HttpGatewayCommandApi } from "./gateway-runner.js";

describe("HomeAssistantGatewayRunner", () => {
  it("reports a command only after the local client verified the state", async () => {
    const commandApi = {
      claim: vi.fn().mockResolvedValue({ action: "on", commandId: "command-1" }),
      complete: vi.fn().mockResolvedValue(undefined)
    };
    const homeAssistant = { setAndVerify: vi.fn().mockResolvedValue({ state: "on" }) };
    const runner = new HomeAssistantGatewayRunner(commandApi, homeAssistant as never);

    await expect(runner.runOnce()).resolves.toBe("completed");
    expect(commandApi.complete).toHaveBeenCalledWith({ commandId: "command-1", observedState: "on", success: true });
  });

  it("does not hide a rejected state behind a success message", async () => {
    const commandApi = {
      claim: vi.fn().mockResolvedValue({ action: "off", commandId: "command-2" }),
      complete: vi.fn().mockResolvedValue(undefined)
    };
    const homeAssistant = { setAndVerify: vi.fn().mockRejectedValue({ code: "gateway.verification_failed" }) };
    const runner = new HomeAssistantGatewayRunner(commandApi, homeAssistant as never);

    await expect(runner.runOnce()).resolves.toBe("failed");
    expect(commandApi.complete).toHaveBeenCalledWith({ commandId: "command-2", errorCode: "gateway.verification_failed", success: false });
  });
});

describe("HttpGatewayCommandApi realtime session", () => {
  it("accepts only a complete, HTTPS Realtime session from the server", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: "a".repeat(80),
      expiresAt: 1_800_000_000,
      gatewayId: "b2c5f8af-84ea-4ae5-a9d4-483cb44edb74",
      publishableKey: "sb_publishable_test_key",
      supabaseUrl: "https://project.supabase.co"
    }), { status: 200 }));
    const api = new HttpGatewayCommandApi({
      gatewayKey: "k".repeat(32),
      gatewayUrl: "https://project.supabase.co/functions/v1/home-assistant-pilot"
    }, fetcher);

    await expect(api.realtimeSession()).resolves.toMatchObject({ gatewayId: "b2c5f8af-84ea-4ae5-a9d4-483cb44edb74", supabaseUrl: "https://project.supabase.co" });
    expect(fetcher).toHaveBeenCalledWith("https://project.supabase.co/functions/v1/home-assistant-pilot", expect.objectContaining({ body: JSON.stringify({ mode: "realtime_session" }) }));
  });
});
