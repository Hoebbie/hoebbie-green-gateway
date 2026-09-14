const allowedCollections = [
  { kind: "bio", label: "Biotonne", names: ["bioabfall2wochentlich", "bioabfall2woechentlich", "wastecollectionschedulebioabfall2wochentlich", "wastecollectionschedulebioabfall2woechentlich"] },
  { kind: "residual", label: "Restmüll", names: ["restabfall40l240l2wochentlich", "restabfall40l240l2woechentlich", "wastecollectionschedulerestabfall40l240l2wochentlich", "wastecollectionschedulerestabfall40l240l2woechentlich"] },
  { kind: "recycling", label: "Gelber Sack", names: ["wertstofflvp2wochentlich", "wertstofflvp2woechentlich", "wastecollectionschedulewertstofflvp2wochentlich", "wastecollectionschedulewertstofflvp2woechentlich"] }
];

/** A privacy-preserving operational signal: it never contains entity IDs, names or dates. */
export function wasteCollectionSyncLog(count) {
  return `gateway.waste_sync:accepted_${Number.isInteger(count) && count >= 0 ? count : 0}`;
}

export function normalizeWasteSourceName(value) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("de-DE").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
    : "";
}

function allowedCollection(name) {
  const normalized = normalizeWasteSourceName(name).replace(/^(?:sensor)?awsh/, "");
  return allowedCollections.find((collection) => collection.names.includes(normalized)) ?? null;
}

function pickupDate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(trimmed);
  if (iso && !Number.isNaN(Date.parse(`${iso[1]}T00:00:00.000Z`))) return iso[1];
  // The installed Waste Collection Schedule integration exposes the next
  // collection as e.g. "on Tue, 08.09.2026". This accepts only that fixed
  // presentation and converts it before it leaves Home Assistant.
  const localized = /^on\s+[a-z]{3},\s+(\d{2})\.(\d{2})\.(\d{4})$/i.exec(trimmed);
  if (!localized) return null;
  const [, day, month, year] = localized;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day) ? null : `${year}-${month}-${day}`;
}

/** Returns only the three explicit AWSH sources; no fuzzy type or rhythm inference. */
export function wasteCollectionFromHomeAssistantState(state) {
  if (!state || typeof state !== "object" || typeof state.entity_id !== "string" || !/^sensor\.[a-z0-9_]+$/.test(state.entity_id)) return null;
  const attributes = state.attributes && typeof state.attributes === "object" ? state.attributes : {};
  const name = typeof attributes.friendly_name === "string" ? attributes.friendly_name : state.entity_id;
  // Some AWSH installations expose a generic visible name while retaining the
  // exact approved source in the entity id. This remains an exact allowlist,
  // never a semantic search through other waste sensors.
  const collection = allowedCollection(name) ?? allowedCollection(state.entity_id);
  const date = pickupDate(state.state);
  return collection && date ? { kind: collection.kind, label: collection.label, originalName: name.trim(), pickupDate: date, sourceEntityId: state.entity_id } : null;
}
