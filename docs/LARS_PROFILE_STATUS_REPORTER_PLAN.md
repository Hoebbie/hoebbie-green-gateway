# Lars-Profilstatus über Home Assistant

Stand: 29. August 2026

## Ziel

Das Green-Add-on liest ausschließlich vier ausdrücklich konfigurierte
Home-Assistant-Companion-Entitäten von Lars' iPhone und meldet daraus einen
datenminimierten Status an den bestehenden Hoebbie-Gateway-Endpunkt.

## Sicherheitsgrenzen

- Die Zuordnung muss exakt profile-lars und vier konkrete Entity-IDs nennen.
- Erlaubt sind Akkustand, Ladezustand samt Stromsparmodus, Schritte und der
  Zustand des ausgewählten device_tracker.
- Koordinaten, Adressen, Gerätekennungen und unbekannte Attribute verlassen
  Home Assistant nicht.
- Die Standortausgabe ist auf Zuhause, Arbeit, Padeln und Unterwegs begrenzt.
- Eine leere Konfiguration deaktiviert den Reporter. Eine ungültige
  Konfiguration deaktiviert nur diesen Baustein und nicht das übrige Gateway.
- Der read-only Bericht läuft höchstens alle fünf Minuten.

## Konfiguration

Die Add-on-Option personal_profile_status_entities_json erwartet ein
JSON-Objekt mit profile_key, battery_level_entity_id,
battery_state_entity_id, steps_entity_id und location_entity_id.

Die tatsächlichen Entity-IDs werden erst aus Lars' Home-Assistant-
Companion-Gerät übernommen. Es werden keine Namen geraten.
