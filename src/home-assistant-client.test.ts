import { describe, expect, it, vi } from "vitest";

import {
  HomeAssistantGatewayError,
  HomeAssistantPilotClient,
  validateGatewayConfig
} from "./home-assistant-client.js";

const config = {
  accessToken: "a".repeat(32),
  baseUrl: "http://homeassistant.local:8123",
  pilotEntityId: "light.wohnzimmer_kugel"
};

describe("HomeAssistantPilotClient", () => {
  it("rejects every non-light pilot and does not make a network call", () => {
    expect(() => validateGatewayConfig({ ...config, pilotEntityId: "cover.bett" })).toThrow(HomeAssistantGatewayError);
    expect(() => validateGatewayConfig({ ...config, pilotEntityId: "light.kugel;cover.bett" })).toThrow(HomeAssistantGatewayError);
  });

  it("calls only the configured light service and verifies the returned state", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        attributes: {}, entity_id: config.pilotEntityId, last_changed: "2026-08-05T15:00:00Z", last_updated: "2026-08-05T15:00:00Z", state: "on"
      }), { status: 200 }));
    const client = new HomeAssistantPilotClient(config, fetcher);

    await expect(client.setAndVerify("on", async () => undefined)).resolves.toMatchObject({ state: "on" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://homeassistant.local:8123/api/services/light/turn_on");
    expect(fetcher.mock.calls[1]?.[0]).toBe("http://homeassistant.local:8123/api/states/light.wohnzimmer_kugel");
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it("never reports success when Home Assistant returns a different state", async () => {
    const state = JSON.stringify({
      attributes: {}, entity_id: config.pilotEntityId, last_changed: "2026-08-05T15:00:00Z", last_updated: "2026-08-05T15:00:00Z", state: "off"
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValue(new Response(state, { status: 200 }));
    const client = new HomeAssistantPilotClient(config, fetcher);

    await expect(client.setAndVerify("on", async () => undefined)).rejects.toMatchObject({ code: "gateway.verification_failed" });
  });
});
