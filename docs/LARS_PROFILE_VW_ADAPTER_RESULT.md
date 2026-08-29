# Lars-Profil – generischer VW-Fahrzeugadapter

Stand: 29. August 2026  
Branch: `codex/lars-profile-vw`  
Add-on-Version: `0.3.71` (lokal vorbereitet)

Der bestehende Lars-Profil-Reporter akzeptiert optional eine feste Zuordnung
von Home-Assistant-Entitäten für Tank, Reichweite, Kilometerstand, grobe Zone,
Verriegelung, Türen, Fenster, Warnungsanzahl und Servicetermin. Es werden weder
Volkswagen-Zugangsdaten noch Koordinaten gelesen oder übertragen. Tank- und
Kilometerwerte benötigen die von Home Assistant bestätigten Einheiten `%`
beziehungsweise `km`; unbekannte Zustände werden ausgelassen statt geschätzt.
Für jedes übertragene Feld wird der eigene Meldezeitpunkt bewahrt. Dabei wird
Home Assistants `last_reported` bevorzugt und für ältere Installationen auf
`last_updated` zurückgefallen.

Der reale Green-Stand enthält aktuell keine Volkswagen-Integration und keine
Tiguan-Entitäten. Die verbreitete HACS-Integration Volkswagen Connect ist nach
ihrem eigenen aktuellen Release und Issue #989 seit dem 18. August 2026 erneut
durch Volkswagen blockiert. Deshalb bleibt die Fahrzeugzuordnung bewusst leer.
Version 0.3.70 ist für den unabhängigen iPhone-Reporter installiert; 0.3.71 ist
mit der Aktualitätskorrektur lokal vorbereitet.

Nach dem realen iPhone-Smoke bewahrt auch der Companion-Teil den eigenen
Meldezeitpunkt für Akku, Ladezustand, Schritte und grobe Zone. Der Gesamtstatus
verwendet nicht länger den ältesten Sensor als scheinbare Aktualität. Der
Profilreporter läuft unabhängig von den Befehlswarteschlangen sofort beim Start
und danach überlappungssicher alle 15 Sekunden. Exakte Koordinaten werden nicht
gelesen oder übertragen. Diese Änderung ist noch nicht veröffentlicht oder auf
Green installiert.

Prüfung: 107 Node-Tests, JavaScript-Syntaxprüfung und Diff-Prüfung sind grün.
