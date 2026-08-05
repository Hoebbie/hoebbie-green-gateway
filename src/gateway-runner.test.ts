import { describe, expect, it, vi } from "vitest";

import { HomeAssistantGatewayRunner } from "./gateway-runner.js";

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
