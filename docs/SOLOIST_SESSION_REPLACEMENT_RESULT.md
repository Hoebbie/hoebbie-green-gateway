# Green – Soloist-Session-Ersatz und Gruppenreparatur

Datum: 28. August 2026  
Add-on-Version: `0.3.63`

## Umsetzung

- Ein neuer Hoebbie-Musikstart stoppt zuerst die bereits bestätigte lokale
  Profilqueue. Eine laufende oder pausierte vorherige Hoebbie-Sitzung wird
  damit bewusst ersetzt.
- Gruppen um die vorherige Queue oder das neue Einzelziel werden über Music
  Assistants offiziellen Befehl `players/cmd/ungroup_many` vollständig
  aufgelöst. Green akzeptiert Erfolg erst, wenn kein Mitglied mehr Follower
  oder Leader einer Restgruppe ist.
- Der Start verwendet weiterhin ausschließlich `player_queues/play_media` mit
  `option: replace`. Einzelraumwahl, Queue-Ersatz und Rückprüfung bleiben
  serverautorisiert und lokal begrenzt.
- Der Soloist-Start erhält ein begrenztes HTTP-Zeitfenster von zwölf Sekunden.
  Falls nur die HTTP-Antwort ausbleibt, prüft Green anschließend den wirklichen
  Player- und Queue-Zustand, statt vorschnell einen Verbindungsfehler zu melden.
- Abgelehnte Befehle behalten nun eine sichere HTTP-Statuskategorie. Freie
  Antworttexte, Medienkennungen, Playerkennungen und Zugangsdaten werden nicht
  protokolliert.
- Der Music-Assistant-WebSocket plant seinen Reconnect idempotent. Der
  Fehlerhandler ruft nicht mehr erneut `close()` auf und kann deshalb nicht in
  Undicis rekursiven Stackoverflow laufen.

## Offizielle Referenz

Geprüft wurde der tatsächlich verwendete Music-Assistant-2.9-Pfad im
offiziellen Servercode:

- `players/cmd/ungroup` entfernt abhängig von der aktuellen Rolle nur den
  übergebenen Player oder die Follower eines tatsächlichen Leaders.
- `players/cmd/ungroup_many` ruft den vorgesehenen Auflösepfad für jedes
  übergebene Mitglied auf.
- `player_queues/stop` beendet die aktive Queue vor dem neuen
  `player_queues/play_media`-Aufruf.
- Die HTTP-API gibt bei internen Befehlsfehlern absichtlich nur Status 500 und
  keinen Detailtext zurück. Green speichert deshalb die sichere Statusklasse;
  die interne Ursache bleibt im Music-Assistant-Protokoll.

Hoebbie wich vorher ab, weil ausschließlich der bei Auftragserstellung
angenommene Leader entgruppiert wurde und die Rückprüfung eine unter neuem
Koordinator verbliebene Restgruppe akzeptierte.

## Prüfung

- 96 Node-Tests grün.
- Syntaxprüfung für Gateway und Music-Assistant-Adapter grün.
- Docker-Laufzeitimportvertrag grün.
- Diff-Prüfung und Secret-Suche ohne Befund.
- Neue Regressionen decken Dreierraum-Restgruppe, Koordinatorwechsel,
  Session-Stopp vor Neustart, kalten Soloist-Timeout, sichere HTTP-Fehlerklasse
  und den WebSocket-Stackoverflow ab.

## Rollout-Grenze und Realtest

Das Paket ändert ausschließlich das Green-Add-on. App, Alfred, Audio,
Datenbank, Edge Functions und Tool-Routing bleiben unverändert. Ein Rollout ist
noch nicht erfolgt.

Vor dem ersten Realtest muss die aktuell bereits bestehende Restgruppe
`Esszimmer + Wohnzimmer` einmalig vollständig aufgelöst werden. Danach:

1. Playlist auf `Alle Räume` starten.
2. Gruppe auflösen und prüfen, dass alle Räume einzeln stehen.
3. Eine andere Playlist nur auf `Küche` starten.
4. Prüfen, dass ausschließlich Küche spielt und kein `Start nicht bestätigt`
   erscheint.
5. Während der Wiedergabe erneut eine andere Playlist auf Küche starten und
   prüfen, dass die alte Sitzung ersetzt wird.

Offenes Risiko: Eine vollständig außerhalb von Hoebbie OS gestartete
Spotify-Connect-Sitzung unterliegt Soloists Anbietergrenzen und kann nicht mit
demselben lokalen Hoebbie-Sessionnachweis verifiziert werden.
