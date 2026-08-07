import { describe, expect, it, vi } from "vitest";

import {
  HomeAssistantEntityClient,
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
      .mockImplementation(() => Promise.resolve(new Response(state, { status: 200 })));
    const client = new HomeAssistantPilotClient(config, fetcher);

    await expect(client.setAndVerify("on", async () => undefined)).rejects.toMatchObject({ code: "gateway.verification_failed" });
  });
});

describe("HomeAssistantEntityClient", () => {
  it("uses the cover position service and only accepts the read-back position", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: { current_position: 50 }, entity_id: "cover.terrasse", last_changed: "2026-08-06T12:00:00Z", last_updated: "2026-08-06T12:00:00Z", state: "open" }), { status: 200 }));
    const client = new HomeAssistantEntityClient(config, fetcher);
    await expect(client.setAndVerify({ action: "set_position", entityId: "cover.terrasse", kind: "cover", targetPosition: 50 }, async () => undefined)).resolves.toMatchObject({ state: "open" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://homeassistant.local:8123/api/services/cover/set_cover_position");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ entity_id: "cover.terrasse", position: 50 });
  });

  it("sets and verifies a warm-white target before reporting routine success", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: { brightness: 179, color_temp_kelvin: 2700 }, entity_id: "light.sessel", last_changed: "2026-08-07T11:00:00Z", last_updated: "2026-08-07T11:00:00Z", state: "on" }), { status: 200 }));
    const client = new HomeAssistantEntityClient(config, fetcher);
    await expect(client.setAndVerify({ action: "set_light", entityId: "light.sessel", kind: "light", targetBrightness: 70, targetColorTemperature: 2700 }, async () => undefined)).resolves.toMatchObject({ state: "on" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://homeassistant.local:8123/api/services/light/turn_on");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ brightness_pct: 70, color_temp_kelvin: 2700, entity_id: "light.sessel" });
  });

  it("sets and verifies a brightness-only target without inventing a color requirement", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: { brightness: 179 }, entity_id: "light.sessel", last_changed: "2026-08-07T11:00:00Z", last_updated: "2026-08-07T11:00:00Z", state: "on" }), { status: 200 }));
    const client = new HomeAssistantEntityClient(config, fetcher);
    await expect(client.setAndVerify({ action: "set_light", entityId: "light.sessel", kind: "light", targetBrightness: 70 }, async () => undefined)).resolves.toMatchObject({ state: "on" });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ brightness_pct: 70, entity_id: "light.sessel" });
  });

  it("rejects a light target when the returned brightness differs", async () => {
    const state = JSON.stringify({ attributes: { brightness: 80, color_temp_kelvin: 2700 }, entity_id: "light.sessel", last_changed: "2026-08-07T11:00:00Z", last_updated: "2026-08-07T11:00:00Z", state: "on" });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("[]", { status: 200 })).mockImplementation(() => Promise.resolve(new Response(state, { status: 200 })));
    const client = new HomeAssistantEntityClient(config, fetcher);
    await expect(client.setAndVerify({ action: "set_light", entityId: "light.sessel", kind: "light", targetBrightness: 70, targetColorTemperature: 2700 }, async () => undefined)).rejects.toMatchObject({ code: "gateway.verification_failed" });
  });
});
