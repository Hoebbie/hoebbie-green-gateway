# Green – konsistentes Entgruppieren einer Soloist-Wiedergabe

## Beobachtung

Nach dem Auflösen einer laufenden Sonos-Gruppe kann ein ehemaliger Folgeraum
den Titel als eigenständige Wiedergabe neu beginnen. Die bisherige Prüfung
bestätigt nur die aufgelöste Gruppentopologie und lässt diese zweite Wiedergabe
unbemerkt bestehen.

## Kleinster Fix

1. Die vom Server bestimmte Führung bleibt die autoritative Profilqueue.
2. Music Assistants vorgesehenen `ungroup_many`-Pfad unverändert nutzen.
3. Nach bestätigter Auflösung ausschließlich ehemalige Folgeräume stoppen,
   falls sie weiter oder neu spielen.
4. Führung und Profilqueue nicht neu starten oder unterbrechen.
5. Topologie und gestoppte Folgeräume vor Erfolg rücklesen.

## Abgrenzung

Keine Änderung an Soloist-Anmeldung, Spotify-Suche, Queue-Ersatz, Realtime,
Audio oder Gerätezuordnung.

## Abnahme

- Küche spielt und wird mit Esszimmer gruppiert.
- Beim Auflösen spielt Küche ohne Neustart weiter.
- Esszimmer ist danach einzeln und spielt nicht.
- Ein Fehler beim Stoppen eines weiterlaufenden Folgeraums wird nicht als
  erfolgreicher Auftrag gemeldet.
