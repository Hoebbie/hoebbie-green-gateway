// Home Assistant's public vacuum features; SEND_COMMAND is deliberately absent.
const features = {
  start: 8192,
  pause: 4,
  stop: 8,
  return_to_base: 16,
  locate: 512,
  set_fan_speed: 32,
};
const vacuumId = /^vacuum\.[a-z0-9_]+$/;
const available = (state) =>
  state && !["unknown", "unavailable"].includes(state.state);
const percent = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const relatedRoles = {
  volume: ["number", /_volume$/],
  pause: ["button", /_pause$/],
  fan: ["select", /_mode$/],
  reset_brush: ["button", /_reset_brush_life$/],
  reset_filter: ["button", /_reset_filter_life$/],
};
export function describeVacuum(state, related = [], name) {
  if (!vacuumId.test(state?.entity_id) || typeof state.state !== "string")
    return null;
  const a = state.attributes ?? {},
    bits = Number.isInteger(a.supported_features) ? a.supported_features : 0;
  const controls = {};
  // related comes ONLY from HA device registry, never from a request or fuzzy name.
  for (const [role, [domain, pattern]] of Object.entries(relatedRoles)) {
    const candidates = related.filter(
      (e) =>
        (domain === "button" ? e.state !== "unavailable" : available(e)) &&
        e.entity_id.startsWith(`${domain}.`) &&
        pattern.test(e.entity_id),
    );
    if (candidates.length === 1) controls[role] = candidates[0];
  }
  const capabilities = Object.entries(features)
    .filter(([, bit]) => (bits & bit) !== 0)
    .map(([action]) => action);
  if (controls.pause && !capabilities.includes("pause"))
    capabilities.push("pause");
  if (controls.volume) capabilities.push("set_volume");
  for (const action of ["reset_brush", "reset_filter"])
    if (controls[action]) capabilities.push(action);
  const fanSpeeds = (
    controls.fan?.attributes?.options ??
    a.fan_speed_list ??
    []
  )
    .filter((v) => typeof v === "string" && v.length > 0 && v.length < 80)
    .slice(0, 20);
  if (!fanSpeeds.length) {
    const i = capabilities.indexOf("set_fan_speed");
    if (i >= 0) capabilities.splice(i, 1);
  }
  const maintenance = [];
  for (const [key, label, unit] of [
    ["filter.filter_life_level", "Filter", "%"],
    ["brush_cleaner.brush_life_level", "Hauptbürste", "%"],
    ["brush_life_level-28-2", "Seitenbürste", "%"],
    ["filter.filter_left_time", "Filter", "h"],
    ["brush_cleaner.brush_left_time", "Hauptbürste", "h"],
    ["brush_left_time-28-1", "Seitenbürste", "h"],
  ]) {
    const value = a[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      (unit !== "%" || value <= 100)
    )
      maintenance.push({ label, value, unit });
  }
  return {
    snapshot: {
      entityId: state.entity_id,
      name:
        typeof name === "string" && name.trim()
          ? name.trim().slice(0, 120)
          : String(a.friendly_name ?? "Staubsauger").slice(0, 120),
      available: available(state),
      state: state.state,
      battery: percent(a.battery_level),
      fanSpeed: controls.fan?.state ?? a.fan_speed ?? null,
      fanSpeeds,
      volume: controls.volume
        ? percent(Number(controls.volume.state))
        : percent(a["audio.volume"]),
      capabilities,
      maintenance,
    },
    controls,
  };
}
export function vacuumService(command, descriptor) {
  const { snapshot, controls } = descriptor;
  if (
    command.entityId !== snapshot.entityId ||
    !snapshot.available ||
    !snapshot.capabilities.includes(command.action)
  )
    throw new Error("vacuum.unsupported");
  let domain = "vacuum",
    service = command.action,
    entityId = command.entityId,
    data = {};
  if (command.action === "set_fan_speed") {
    if (
      typeof command.value !== "string" ||
      !snapshot.fanSpeeds.includes(command.value)
    )
      throw new Error("vacuum.invalid_speed");
    if (controls.fan) {
      domain = "select";
      service = "select_option";
      entityId = controls.fan.entity_id;
      data = { option: command.value };
    } else data = { fan_speed: command.value };
  } else if (command.action === "set_volume") {
    const a = controls.volume?.attributes;
    if (
      !Number.isInteger(command.value) ||
      command.value < 0 ||
      command.value > 100 ||
      !a ||
      !Number.isFinite(Number(a.min)) ||
      !Number.isFinite(Number(a.max)) ||
      command.value < Number(a.min) ||
      command.value > Number(a.max) ||
      !Number.isFinite(Number(a.step)) ||
      Number(a.step) <= 0 ||
      Math.abs(
        (command.value - Number(a.min)) / Number(a.step) -
          Math.round((command.value - Number(a.min)) / Number(a.step)),
      ) > 0.0001
    )
      throw new Error("vacuum.invalid_volume");
    domain = "number";
    service = "set_value";
    entityId = controls.volume.entity_id;
    data = { value: command.value };
  } else {
    if (command.value !== null && command.value !== undefined)
      throw new Error("vacuum.invalid_value");
    if (command.action === "pause" && controls.pause) {
      domain = "button";
      service = "press";
      entityId = controls.pause.entity_id;
    }
    if (command.action === "reset_brush" || command.action === "reset_filter") {
      domain = "button";
      service = "press";
      entityId = controls[command.action].entity_id;
    }
  }
  return { domain, service, data: { entity_id: entityId, ...data } };
}
export function vacuumResultMatches(command, descriptor) {
  const s = descriptor.snapshot;
  if (!s.available) return false;
  if (command.action === "start") return s.state === "cleaning";
  if (command.action === "pause") return s.state === "paused";
  if (command.action === "stop")
    return s.state === "idle" || s.state === "paused" || s.state === "docked";
  if (command.action === "return_to_base")
    return s.state === "returning" || s.state === "docked";
  if (command.action === "set_fan_speed") return s.fanSpeed === command.value;
  if (command.action === "set_volume") return s.volume === command.value;
  return false;
}
export const vacuumRegistryTemplate = `{% set ns=namespace(items=[]) %}{% for v in states.vacuum %}{% set d=device_id(v.entity_id) %}{% set ns.items=ns.items+[{'entityId':v.entity_id,'name':device_attr(d,'name_by_user') or device_attr(d,'name'),'related':device_entities(d) if d else []}] %}{% endfor %}{{ ns.items | to_json }}`;
export function createVacuumWorker({
  gatewayUrl,
  gatewayHeaders,
  homeAssistantUrl,
  homeHeaders,
  request,
  log = console.info,
}) {
  const endpoint = new URL("./vacuum-control", gatewayUrl).href;
  let busy = false,
    again = false;
  const cloud = (body) =>
    request(endpoint, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify(body),
    });
  async function discover() {
    const response = await request(`${homeAssistantUrl}/api/states`, {
      headers: homeHeaders,
    });
    if (!response.ok) throw new Error("vacuum.discovery_failed");
    const states = await response.json();
    if (!Array.isArray(states)) throw new Error("vacuum.invalid_inventory");
    const registryResponse = await request(`${homeAssistantUrl}/api/template`, {
      method: "POST",
      headers: homeHeaders,
      body: JSON.stringify({ template: vacuumRegistryTemplate }),
    });
    if (!registryResponse.ok) throw new Error("vacuum.registry_unavailable");
    const registry = await registryResponse.json();
    if (!Array.isArray(registry)) throw new Error("vacuum.registry_invalid");
    return states
      .filter((s) => vacuumId.test(s.entity_id))
      .slice(0, 20)
      .map((s) => {
        const meta = registry.find((r) => r.entityId === s.entity_id);
        return describeVacuum(
          s,
          states.filter(
            (r) =>
              Array.isArray(meta?.related) &&
              meta.related.includes(r.entity_id),
          ),
          meta?.name,
        );
      })
      .filter(Boolean);
  }
  async function reportInventory(descriptors) {
    const r = await cloud({
      mode: "inventory",
      items: descriptors.map((d) => d.snapshot),
    });
    if (!r.ok) throw new Error("vacuum.report_failed");
  }
  async function run(command) {
    let sent = false;
    try {
      const descriptors = await discover(),
        descriptor = descriptors.find(
          (d) => d.snapshot.entityId === command.entityId,
        );
      if (!descriptor) throw new Error("vacuum.not_found");
      const service = vacuumService(command, descriptor);
      // Idempotent state targets do not restart an already running cleaning cycle.
      if (vacuumResultMatches(command, descriptor)) return "confirmed";
      sent = true;
      const response = await request(
        `${homeAssistantUrl}/api/services/${service.domain}/${service.service}`,
        {
          method: "POST",
          headers: homeHeaders,
          body: JSON.stringify(service.data),
        },
      );
      if (!response.ok) return "failed";
      // Locate and counter resets have no reliable action-result state. Be honest.
      if (["locate", "reset_brush", "reset_filter"].includes(command.action))
        return "accepted";
      // Miot is polled by HA. Ask HA to refresh this entity, never fabricate state.
      await request(
        `${homeAssistantUrl}/api/services/homeassistant/update_entity`,
        {
          method: "POST",
          headers: homeHeaders,
          body: JSON.stringify({
            entity_id: [command.entityId, service.data.entity_id],
          }),
        },
      );
      const fresh = await discover();
      await reportInventory(fresh);
      const observed = fresh.find(
        (d) => d.snapshot.entityId === command.entityId,
      );
      return observed && vacuumResultMatches(command, observed)
        ? "confirmed"
        : "accepted";
    } catch {
      return sent ? "unknown" : "failed";
    }
  }
  async function wake() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    again = false;
    try {
      for (let count = 0; count < 20; count++) {
        const claimed = await cloud({ mode: "claim" });
        if (claimed.status === 204) return;
        if (!claimed.ok) throw new Error("vacuum.claim_failed");
        const command = await claimed.json();
        if (
          !command ||
          typeof command.commandId !== "string" ||
          !vacuumId.test(command.entityId)
        )
          throw new Error("vacuum.invalid_command");
        const status = await run(command);
        const report = await cloud({
          mode: "report",
          commandId: command.commandId,
          status,
        });
        if (!report.ok) throw new Error("vacuum.completion_unknown");
      }
    } catch {
      log("vacuum.worker_unavailable");
    } finally {
      busy = false;
      if (again) queueMicrotask(() => void wake());
    }
  }
  return { wake, report: async () => reportInventory(await discover()) };
}
