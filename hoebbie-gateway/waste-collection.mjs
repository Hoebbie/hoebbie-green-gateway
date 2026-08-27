const allowedCollections = [
  { kind: "bio", label: "Biotonne", names: ["bioabfall2wochentlich", "bioabfall2woechentlich"] },
  { kind: "residual", label: "Restmüll", names: ["restabfall40l240l2wochentlich", "restabfall40l240l2woechentlich"] },
  { kind: "recycling", label: "Gelber Sack", names: ["wertstofflvp2wochentlich", "wertstofflvp2woechentlich"] }
];

export function normalizeWasteSourceName(value) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("de-DE").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
    : "";
}

function allowedCollection(name) {
  const normalized = normalizeWasteSourceName(name).replace(/^(sensor|awsh)/, "");
  return allowedCollections.find((collection) => collection.names.includes(normalized)) ?? null;
}

function pickupDate(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(value.trim());
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00.000Z`))) return null;
  return match[1];
}

/** Returns only the three explicit AWSH sources; no fuzzy type or rhythm inference. */
export function wasteCollectionFromHomeAssistantState(state) {
  if (!state || typeof state !== "object" || typeof state.entity_id !== "string" || !/^sensor\.[a-z0-9_]+$/.test(state.entity_id)) return null;
  const attributes = state.attributes && typeof state.attributes === "object" ? state.attributes : {};
  const name = typeof attributes.friendly_name === "string" ? attributes.friendly_name : state.entity_id;
  const collection = allowedCollection(name);
  const date = pickupDate(state.state);
  return collection && date ? { kind: collection.kind, label: collection.label, originalName: name.trim(), pickupDate: date, sourceEntityId: state.entity_id } : null;
}
