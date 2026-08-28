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

## Noch nicht bereitgestellt

Kein Push, Merge und keine Installation ohne erneute ausdrückliche Freigabe
durch Lars.

## Risiko

Der Ablauf kann beim Auflösen kurz hörbar unterbrechen, weil die gemeinsam
verwendete Sonos-Session erst beendet werden muss. Ein Playlist-Ende oder
Titelneustart darf wegen der Index-/Zeitverifikation nicht als Erfolg gelten.
