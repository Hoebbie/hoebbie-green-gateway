# Drucktransport-Diagnose, 6. September 2026

Auftrag: Den ungeklärten Drucker-Hänger künftig genauer lokalisieren.
Basis: Green main 4d3eae1. Keine Firmware-/Format-/Timeoutänderung und kein
physischer Druck oder Deployment in diesem Arbeitsschritt.

1. Native Fehler und letzte Prozessphase strukturiert ausgeben: feste Phasen,
   numerischer HTTP-/IPP-Status, Dateigröße, an CUPS übergebene Byteanzahl.
   Die Byteanzahl ist ausdrücklich kein Empfangs- oder Drucknachweis.
2. JavaScript übernimmt ausschließlich validierte Diagnosefelder in das
   vorhandene lokale Gateway-Protokoll. Keine URLs, Namen, Pfade, IDs oder
   ungefilterten Fehlermeldungen; kein neuer Cloud-/Journalvertrag.
3. Verbindungsabbruch, verlorene Antwort, IPP-Ablehnung, Prozessabbruch und
   falsche Jobidentität lokal testen. Wiederholschutz muss erhalten bleiben.
4. Gesamte Green-Tests und Compiler-Warnungen prüfen, privat sichern.

Referenz: OpenPrinting CUPS Programming Manual und veröffentlichter
v2.4.18 cups/request.c (Docker fordert cups-libs >=2.4.18). cupsWriteRequestData
liefert einen HTTP-Status, keine Empfangsbestätigung. cupsGetResponse liest
anschließend IPP; diese Phasen werden beobachtet, nicht neu implementiert.
Lokale native Prüfung nutzt macOS libcups, keine behauptete Green-Geräteabnahme.

## Ergebnis

Implementiert: native Phasen validation/connect/file/request/document/response/
identity, HTTP-/IPP-Zahlencodes, Dateigröße, bytesAttempted und vergangene Zeit.
Wenige sofort geflushte Checkpoints erlauben nach Prozessabbruch eine letzte
bekannte Phase. bytesAttempted zählt auch den möglicherweise fehlgeschlagenen
Schreibaufruf und beweist keine Zustellung. Bei Abbruch während eines Aufrufs
enthält der letzte Checkpoint nur den vorher bekannten Stand.

Der JS-Client prüft alle Felder, Wertebereiche und Phasen vor einem lokalen
`print.transport`-Fehlerlog; unbekannte Felder werden verworfen. Keine freien
Fehlermeldungen, Namen, Adressen oder Cloud-/Journaländerung. Auch ein defekter
Logger darf den unklaren Lieferstatus und Wiederholschutz nicht verändern.

Prüfungen: C-Compiler mit -Wall -Wextra -Werror, JS-Syntax und Diff-Prüfung;
155 Green-Tests grün, anschließend zusätzlicher nativer Upload-Abbruchtest
mit 11-MB-Simulationsdatei grün (nun 9 native Tests, insgesamt 156 Testfälle).
Abgedeckt: Verbindungsablehnung, HTTP 503 vor Daten, Abbruch mitten im Upload,
verlorene Antwort, IPP-Ablehnung, falsche Identität, Prozessabbruch-Checkpoint,
Datenminimierung und kein erneutes Senden. Kein physischer Ausdruck.
Keine UI-Änderung; Geräte-/Accessibility-Prüfung für dieses reine Loggingpaket
nicht betroffen. Der ursprüngliche Druckerhänger ist damit noch nicht behoben.
Vor Geräteabnahme sind Veröffentlichung/Installation separat freizugeben.

Offizieller Quellcode:
https://github.com/OpenPrinting/cups/blob/v2.4.18/cups/request.c
https://openprinting.github.io/cups/doc/cupspm.html
Keine neue CUPS-Abhängigkeit oder Versionsänderung. Das ARM64-Image wird durch
bestehende CI gebaut; lokale native Tests verwenden die macOS-CUPS-Bibliothek.
