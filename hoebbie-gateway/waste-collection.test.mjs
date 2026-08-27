import assert from "node:assert/strict";
import test from "node:test";

import { wasteCollectionFromHomeAssistantState, wasteCollectionSyncLog } from "./waste-collection.mjs";

function state(name, date = "2026-09-03") {
  return { attributes: { friendly_name: name }, entity_id: "sensor.awsh_waste", state: date };
}

test("maps only the three explicit AWSH collections despite harmless formatting changes", () => {
  assert.deepEqual(wasteCollectionFromHomeAssistantState(state(" Bioabfall (2-wöchentlich) "))?.label, "Biotonne");
  assert.deepEqual(wasteCollectionFromHomeAssistantState(state("Restabfall 40 L - 240 L (2-wöchentlich)"))?.label, "Restmüll");
  assert.deepEqual(wasteCollectionFromHomeAssistantState(state("WERTSTOFF / LVP (2-WOECHENTLICH)"))?.label, "Gelber Sack");
});

test("rejects paper, container sizes and other collection rhythms", () => {
  for (const name of ["Papiertonne (2-wöchentlich)", "Restabfall 1.100L (2-wöchentlich)", "Bioabfall (4-wöchentlich)", "Wertstoff/LVP (8-wöchentlich)"]) {
    assert.equal(wasteCollectionFromHomeAssistantState(state(name)), null);
  }
});

test("uses only an exact allowed AWSH entity id when its visible name is generic", () => {
  assert.equal(wasteCollectionFromHomeAssistantState({ attributes: { friendly_name: "Nächste Leerung" }, entity_id: "sensor.awsh_bioabfall_2_wochentlich", state: "2026-09-03" })?.label, "Biotonne");
  assert.equal(wasteCollectionFromHomeAssistantState({ attributes: { friendly_name: "Nächste Leerung" }, entity_id: "sensor.awsh_papiertonne_2_wochentlich", state: "2026-09-03" }), null);
});

test("reports only an aggregate count for the waste sync diagnostic", () => {
  assert.equal(wasteCollectionSyncLog(3), "gateway.waste_sync:accepted_3");
  assert.equal(wasteCollectionSyncLog(-1), "gateway.waste_sync:accepted_0");
});

test("rejects invalid entity ids and dates", () => {
  assert.equal(wasteCollectionFromHomeAssistantState({ ...state("Bioabfall(2-wöchentlich)"), entity_id: "calendar.awsh" }), null);
  assert.equal(wasteCollectionFromHomeAssistantState(state("Bioabfall(2-wöchentlich)", "morgen")), null);
});
