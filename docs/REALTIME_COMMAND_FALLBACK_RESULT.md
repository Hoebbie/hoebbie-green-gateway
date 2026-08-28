# Green – Realtime-Auftragsersatzabruf

Datum: 28. August 2026  
Add-on-Version: `0.3.64`

## Umsetzung

Supabase Broadcast bleibt der schnelle Primärpfad und enthält weiterhin keine
ausführbare Aktion. Verpasst Green dieses Wecksignal, fragt der vorhandene
serverautorisierte Claim-Pfad die dauerhafte Gruppenqueue nun spätestens nach
15 Sekunden erneut ab. Vorher geschah das erst nach fünf Minuten.

Der Gruppenauftrag hat 90 Sekunden Laufzeit und kann damit nicht mehr vor dem
nächsten Ersatzabruf verfallen. Unabhängige Worker werden bewusst nicht
häufiger abgefragt; der breite Fünf-Minuten-Abgleich bleibt unverändert.

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
- Regressionstest: Der Gruppen-Ersatzabruf bleibt positiv und liegt höchstens
  bei der Hälfte der 90-sekündigen Gruppenauftragsfrist.
- Realtime-Protokoll, Queue-Drain, Music-Assistant-Adapter, Docker-
  Importvertrag und übrige Gateway-Tests grün.
- Diff-Prüfung und Secret-Suche ohne neuen Befund; die beiden Treffer in
  `run.sh` lesen ausschließlich lokale Add-on-Konfiguration und enthalten
  keine Zugangsdaten.
- Keine Änderung an UI, Audio, Alfred, Datenbank oder Music-Assistant-
  Gruppierungssemantik. Geräteformat- und Accessibility-Prüfungen sind für
  diesen reinen Gateway-Timing-Fix nicht einschlägig.

## Rollout und reale Prüfung

Nach Lars' ausdrücklicher Freigabe wurde Commit
`6df0c8a582b158fa5ccf3ebcbfac7d64ba2de3d0` per Fast-forward auf Green-`main`
übernommen. GitHub Actions Lauf `33182177644` war vollständig grün.

Home Assistant hat Add-on-Version `0.3.64` gebaut, installiert und erfolgreich
gestartet. Die reale Prüfung bestätigte:

- installierte und neueste Version jeweils `0.3.64`
- laufender Add-on-Zustand
- erfolgreiches `gateway.realtime_joined`
- über mehr als einen 15-Sekunden-Gruppenzyklus kein zusätzlicher Fehler des
  unabhängigen Album-Workers

Der zunächst festhängende Store-Abruf löste sich selbst; ein Neustart des
Home-Assistant-Supervisors war nicht erforderlich.
