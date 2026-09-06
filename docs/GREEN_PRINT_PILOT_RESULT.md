# Green-Druck-Pilot – Implementierungsstand 6. September 2026

## Umfang und Ergebnis

Ein eigener, standardmäßig ausgeschalteter Druckadapter ist vorbereitet.
Er nimmt ausschließlich die gebündelte, bereits von Lars auf Papier geprüfte
A4-Testseite an: eine Kopie, einseitig, Schwarzweiß, 300 dpi, PWG Raster.
Keine Druckeradresse und keine beliebige Datei kann über die Cloud gewählt
werden. Die Adresse wird lokal in der Green-App konfiguriert.

Die neue serverseitige Queue prüft Haushalt, aktive Sitzung, vertrauenswürdiges
Gerät und Gateway-Schlüssel. Das bestehende persönliche/gekoppelte Wandgerät-
Berechtigungstor wird unverändert wiederverwendet. Ein aktiver oder unklarer
Auftrag je Gateway; höchstens drei Pilotaufträge pro Haushalt in 24 Stunden.
Anforderung und Abbruch werden protokolliert. Die Laufzeit ist auf zehn
Minuten begrenzt; bereits angenommene Drucke lassen sich damit nicht garantiert
physisch verhindern, weshalb Abbruch und Ergebnis separat geprüft werden.

Der Green speichert vor dem Senden ein dauerhaftes Journal. Wiederholte
Cloud-Zustellung, verlorene Antwort, Prozessabbruch und Journalverlust lösen
keinen automatischen Neudruck aus. Ein abgeschlossener Auftrag benötigt die
Rückmeldung einer fertigen Seite. Geänderte Druckeradresse oder unklarer Status
stoppen die Verarbeitung. Die Druckarbeit läuft unabhängig von Musik/Haus.

## Offizieller Pfad und projektspezifischer Anteil

Home Assistants [IPP-Integration](https://www.home-assistant.io/integrations/ipp/)
liefert Sensorwerte. Die Dokumentübermittlung erfolgt direkt durch libcups
nach dem [PWG IPP Guide](https://pwg.org/ipp/ippguide.html).
Die Testdatei wurde mit der offiziellen
[CUPS Raster API](https://openprinting.github.io/cups/doc/api-raster.html)
erzeugt und einschließlich Seitenzahl wieder eingelesen.

Geprüft wurden Alpine 3.21 APKBUILD und der veröffentlichte CUPS-2.4.18-Code
(`cups/request.c`, `tools/ipptool.c`, CHANGES). `ipptool` und
`cupsDoFileRequest` können nach bestimmten Verbindungsfehlern erneut senden.
Deshalb nutzt ein kleiner nativer Helfer die vorhandene Streaming-API
`cupsSendRequest` → `cupsWriteRequestData` → `cupsGetResponse`, ohne
Dokumentwiederholung. Das ist keine eigene IPP-Protokollimplementierung.
Alpine benötigt mindestens CUPS 2.4.18; die ARM64-Imageprüfung erfolgt in CI.
Die lokale native Simulation nutzt die mit macOS gelieferte libcups.

Hoebbie-spezifisch bleiben Autorisierung, feste Datei, Queue, dauerhaftes
Journal, Gerätezielbindung und die konservative Behandlung unklarer Zustände.

## Prüfung

Lokal bestanden: 136 Gateway-Tests einschließlich drei Tests gegen einen
lokalen IPP-HTTP-Simulator mit dem tatsächlich kompilierten CUPS-Helfer;
vier Endpunkt-Schematests; Deno-Typecheck; Projekt-Lint, Typecheck, Tests,
Web-Builds und Secret-Prüfung. Keine App-/UI-Änderung: neue Geräte-Screenshots,
Accessibility-UI-Abnahme oder TestFlight-Auslieferung sind hier nicht relevant.

Die neue pgTAP-Suite prüft Rechte, Haushaltsgrenzen, Idempotenz, Claims,
Bestätigung, Status, Abbruch, Limit, deaktivierte Konfiguration und Widerruf.
Vollständiger Supabase-Test und ARM64-Containerbau werden in GitHub geprüft,
da lokal keine Docker-Laufzeit vorhanden ist. CI-Ergebnis und finale Commits
werden im Task zurückgemeldet. Noch keine produktive Migration/Installation.

## Geplanter kontrollierter Rollout nach Freigabe

1. Beide geprüften Branches nach Main übernehmen, additive Migration und
   `print-pilot` veröffentlichen. Konfiguration serverseitig zunächst aus.
2. Green-Version 0.3.76 installieren; bestehende Gateway-Kopplung beibehalten.
3. Lokal die bestätigte Druckeradresse als IPP-URI setzen. Erst unmittelbar
   vor dem Pilot lokal `print_pilot_enabled` und die passende serverseitige
   Gateway-Konfiguration aktivieren. Kein neuer eingehender Port erforderlich.
4. Codex fordert über die bestehende aktive, vertrauenswürdige Lars-Sitzung
   genau einen bestätigten Auftrag mit eigener Mutations-ID an. Keine direkten
   Queue-Inserts als Ersatz für den autorisierten Anforderungspfad.
5. Auftragsstatus über `print-pilot` rücklesen; Lars prüft eine einzelne
   physische A4-Seite. Anschließend Pilot bei Bedarf serverseitig deaktivieren.

Lars erhält kurze Klickanweisungen erst für den konkret ausgelieferten Stand;
kein Programmieren oder manuelles SQL durch Lars erforderlich.

## Grenzen und nächste Phase

Noch nicht bewiesen: tatsächliche Ausführung auf Green, Standby/Papiermangel
und Abbruch am realen HP. Eine lokal deaktivierte Green-App bearbeitet auch
bestehende Jobs nicht weiter; zum geordneten Abbruch zuerst serverseitig
deaktivieren und den Rücklesestatus abwarten. Ausschalten stoppt keinen bereits
im Drucker gespeicherten Auftrag. Bei `unknown` muss Codex den realen
Druckerzustand prüfen und eine administrative Auflösung dokumentieren;
kein automatisches Zurücksetzen und keine automatische Ersatzseite.

Leo-Oberfläche, Quellenkatalog, KI-Bilder und Alfred-Tools folgen als eigene
freizugebende Etappen. Der jetzige Pilot macht diese Fähigkeiten noch nicht
verfügbar. Nächste kleine Phase ist ausschließlich die eine Green-Testseite.

Branches: `codex/green-print-pilot` (Hoebbie OS),
`codex/green-print-adapter` (Green). Main/Deployment bleiben bis zur
konkreten Freigabe gemäß AGENTS §9 unverändert.
