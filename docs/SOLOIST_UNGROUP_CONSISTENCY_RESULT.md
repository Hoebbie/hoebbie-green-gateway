# Green – Soloist-Entgruppierung konsistent abgeschlossen

## Ergebnis

Der explizit serverautorisierte Führungsraum bleibt beim Auflösen einer
laufenden Gruppe die einzige Profilwiedergabe. Nach Music Assistants
`players/cmd/ungroup_many` stoppt Green jeden ehemaligen Folgeraum über dessen
eigenen `player_queues/stop`-Pfad. Zwei aufeinanderfolgende Rücklesungen müssen
bestätigen, dass alle Räume einzeln stehen und kein Folgeraum mehr spielt.

Der Führungsraum erhält keinen Stopp und keinen Neustart. Kann ein Folgeraum
nicht zuverlässig beendet werden, meldet Green den Gruppenauftrag als Fehler
statt als Scheinerfolg.

## Official First

Geprüft wurde der lokale offizielle Quellstand der installierten Music-
Assistant-Version 2.9.13:

- `players/cmd/ungroup_many` führt den vorgesehenen Auflösepfad je Mitglied aus.
- Der allgemeine `players/cmd/stop` darf anhand von `active_source` zu einer
  anderen aktiven Queue umleiten.
- `player_queues/stop` ruft für die angegebene Player-ID ausdrücklich den
  internen Stopp ohne diese Umleitung auf.
- Der Sonos-Provider beendet dort die Wiedergabe des konkreten eigenständigen
  Players.

Hoebbie nutzt deshalb weiter die offiziellen Befehle und ergänzt nur die
produktspezifische Regel, dass die serverbestimmte Führung erhalten bleibt.

## Tests

- 98 Green-Unit- und Integrationstests grün.
- Neue Regression: Führung bleibt aktiv, ehemalige Folgeräume werden gestoppt.
- Neue Negativregression: Ein verzögert erneut spielender Folgeraum verhindert
  die Erfolgsmeldung.
- Dockerfile-Importvertrag ist Teil der grünen Tests.
- Add-on-Version: 0.3.65.

## Reale Abnahme nach Deployment

1. Playlist in Küche starten.
2. Küche und Esszimmer gruppieren.
3. Gruppe auflösen.
4. Prüfen: Küche spielt ohne Titelneustart weiter, Esszimmer bleibt still.
5. Pause in Hoebbie muss die sichtbare Küchenwiedergabe beenden.

## Risiko

Das konkrete zeitliche Verhalten von Sonos/Soloist wird abschließend erst am
realen System belegt. Der Fix ist begrenzt und meldet bei abweichendem Verhalten
geschlossen einen Fehler.

## Rollout

- Green-Main-Commit: `28e141f717569c41c0aba51e86ed2e7997c8e9eb`
- GitHub Green Add-on CI #164: erfolgreich
- installierte und rückgelesene Add-on-Version: 0.3.65
- Add-on-Status: läuft
- Realtime-Verbindung und Music-Assistant-Inventar nach dem Neustart bestätigt

Der reale Entgruppierungs-Smoke bleibt der einzige offene Nachweis.
