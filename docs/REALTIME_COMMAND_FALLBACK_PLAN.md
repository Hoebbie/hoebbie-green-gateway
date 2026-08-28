# Green – Plan für verpasste Realtime-Auftragswecksignale

Datum: 28. August 2026

## Ziel

Ein dauerhafter, serverseitig autorisierter Auftrag darf nicht verfallen, nur
weil das zugehörige Supabase-Realtime-Broadcast-Wecksignal vorübergehend nicht
beim Green-Gateway ankommt.

## Kleinster Ausbau

- Realtime bleibt der unveränderte Primärpfad.
- Die bestehenden Datenbank-Claims bleiben die einzige Auftragsquelle.
- Nur die betroffene Gruppenqueue erhält einen kurzen Ersatzabruf, der sicher
  vor ihrer aktuellen Auftragsfrist läuft.
- Ein Regressionstest hält diese Timing-Beziehung fest.

App, Alfred, Music-Assistant-Kommandos, Gruppierungslogik, Datenbank und Edge
Functions bleiben unverändert.
