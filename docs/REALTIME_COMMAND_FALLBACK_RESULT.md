# Green – Realtime-Auftragsersatzabruf

Datum: 28. August 2026  
Add-on-Version: `0.3.64`

## Umsetzung

Supabase Broadcast bleibt der schnelle Primärpfad und enthält weiterhin keine
ausführbare Aktion. Verpasst Green dieses Wecksignal, fragt der vorhandene
serverautorisierte Claim-Pfad die dauerhaften Warteschlangen nun spätestens
nach zehn Sekunden erneut ab. Vorher geschah das erst nach fünf Minuten.

Die kürzeste aktuelle serverseitige Auftragsfrist beträgt 20 Sekunden. Der
Ersatzabruf liegt damit bei höchstens der Hälfte dieser Frist; der konkrete
Gruppenauftrag mit 90 Sekunden Laufzeit kann nicht mehr vor dem nächsten
Ersatzabruf verfallen.

## Offizielle Referenz

Geprüft wurde die aktuelle offizielle Supabase-Dokumentation zu Broadcast und
Realtime-Protokoll. Datenbank-Broadcasts werden über WebSocket an verbundene
Empfänger zugestellt; ohne Replay ist ein Broadcast kein dauerhafter
Auftragsspeicher. Hoebbie OS behält deshalb die bestehende Datenbankqueue als
Quelle der Wahrheit und nutzt Broadcast ausschließlich als Wecksignal.

- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/realtime/protocol

## Prüfung

- 97/97 Node-Tests grün.
- Syntaxprüfung für Gateway und Queue-Drain grün.
- Regressionstest: Der Ersatzabruf bleibt positiv und liegt höchstens bei der
  Hälfte der kürzesten bekannten Auftragsfrist.
- Realtime-Protokoll, Queue-Drain, Music-Assistant-Adapter, Docker-
  Importvertrag und übrige Gateway-Tests grün.
- Diff-Prüfung und Secret-Suche ohne neuen Befund; die beiden Treffer in
  `run.sh` lesen ausschließlich lokale Add-on-Konfiguration und enthalten
  keine Zugangsdaten.
- Keine Änderung an UI, Audio, Alfred, Datenbank oder Music-Assistant-
  Gruppierungssemantik. Geräteformat- und Accessibility-Prüfungen sind für
  diesen reinen Gateway-Timing-Fix nicht einschlägig.

## Rollout-Grenze

Dieses Paket ändert ausschließlich das Green-Add-on. Ein Update des laufenden
Add-ons erfolgt erst nach Lars' ausdrücklicher Deployment-Freigabe.
