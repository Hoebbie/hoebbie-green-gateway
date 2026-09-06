## 0.3.79

- Begrenzte lokale Druckdiagnose für Verbindung, Upload und Druckerantwort.
- Nur feste Phasen und Zahlencodes; keine Adressen oder Dokumentnamen im Fehlerlog.
- Unklare Druckaufträge bleiben gesperrt und werden nicht erneut gesendet.

## 0.3.78

- Erweiterte private Ausmalbibliothek über leo-v2.
- Feste native Motivliste und geprüfte SHA-256-Werte.
- Bildcache auf 64 MB begrenzt; dauerhafte Drucknachweise bleiben erhalten.


## 0.3.77

- Add the private Leo coloring catalog with three verified, immutable A4 assets from authenticated private storage.
- Keep third-party artwork out of the public add-on repository; verify bounded downloads before caching.
- Advertise the leo-v1 claim protocol; bind journal entries to their exact motif.
- Preserve single submission, cancellation, expiry and unknown-outcome blocking.
