# Green – Sonos-Gruppe mit fortgesetzter Leader-Queue

## Ergebnis

Add-on 0.3.66 korrigiert die Realregression aus 0.3.65. Ein Stop des frisch
abgelösten Sonos-Folgeraums kann die noch geteilte Playback-Session und damit
auch den Leader stoppen. Green liest deshalb vor jeder Änderung die laufende
Leader-Queue einschließlich Titel, Index und Zeitposition.

Nach dem offiziellen Music-Assistant-Auflösepfad wird eine weiterlaufende
gemeinsame Session einmal beendet. Danach startet Green ausschließlich die
serverautorisierte Leader-Queue mit `player_queues/play_index` am vorherigen
Index und `seek_position`. Zwei stabile Rücklesungen müssen denselben Titel
ohne deutlichen Positionsrücksprung sowie stille, eigenständige ehemalige
Folgeräume bestätigen.

Fehlt vorab eine verifizierbare laufende Queue, wird die Gruppe nicht verändert.

## Official First

Geprüft wurden der installierte offizielle Music-Assistant-Stand 2.9.13 und
`aiosonos==0.1.12`. Der Queue-Stopp endet intern beim Sonos Group Controller;
der offizielle Index-/Zeitpfad ist `player_queues/play_index`.

## Tests

- 98 Green-Unit- und Integrationstests grün
- Leader-Fortsetzung mit identischem Titel, Index und Zeitposition grün
- ehemaliger Folgeraum bleibt still
- ein erneut spielender Folgeraum verhindert die Erfolgsmeldung
- Add-on-Version: 0.3.66

## Bereitstellung

- Pull Request #23
- Quellcommit `b1bdf851b938095811150e7be8b682abfe173dff`
- Mergecommit `d408fb7d11e9b4867b77b8bb66a8d1fc5dab27b6`
- Branch-Lauf #166, PR-Lauf #167 und nachgelagerter `main`-Lauf #168 grün
- Add-on 0.3.66 in Home Assistant installiert und gestartet
- Music-Assistant-Discovery mit sieben Playern sowie Realtime-Socket und
  Realtime-Beitritt im Startprotokoll bestätigt

## Risiko

Der Ablauf kann beim Auflösen kurz hörbar unterbrechen, weil die gemeinsam
verwendete Sonos-Session erst beendet werden muss. Ein Playlist-Ende oder
Titelneustart darf wegen der Index-/Zeitverifikation nicht als Erfolg gelten.
