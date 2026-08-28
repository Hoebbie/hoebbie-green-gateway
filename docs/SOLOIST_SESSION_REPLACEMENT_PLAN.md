# Green – deterministischer Soloist-Session-Ersatz

Datum: 28. August 2026

## Befund

- Ein neuer Playliststart auf einem noch gruppierten Ziel übernimmt die
  bestehende Gruppe, obwohl ein einzelner Raum gewählt wurde.
- `players/cmd/ungroup` löst nur die aktuelle Rolle des übergebenen Players.
  Wenn Music Assistant oder Sonos den Koordinator gewechselt hat, kann eine
  Restgruppe bestehen bleiben. Die bisherige Rückprüfung erkannte das nicht.
- Soloist erlaubt pro Spotify-Konto nur eine unabhängige Wiedergabe. Eine
  nicht vollständig beendete vorherige Queue kann deshalb den nächsten Start
  ablehnen.
- Der normale `play_media`-Aufruf endet nach fünf Sekunden, obwohl ein kalter
  Soloist-Start länger dauern und danach trotzdem erfolgreich spielen kann.
- Ein WebSocket-Fehler ruft synchron erneut `close()` auf und kann in Undici
  rekursiv bis zum Stackoverflow laufen.

## Kleinster sauberer Ausbau

1. Vor einem neuen Einzelraumstart die bereits bestätigte Profilqueue stoppen.
2. Gruppen, die das alte oder neue Ziel enthalten, über Music Assistants
   offiziellen `players/cmd/ungroup_many`-Pfad vollständig auflösen.
3. Erfolg erst akzeptieren, wenn jedes betroffene Mitglied einzeln steht.
4. Soloist einen begrenzten längeren Startzeitraum geben und nach einem
   HTTP-Timeout den tatsächlichen Player-/Queue-Zustand rücklesen.
5. HTTP-Status und Timeout als sichere Fehlerkategorien erhalten; keine
   Antworttexte, Medienkennungen oder Zugangsdaten protokollieren.
6. WebSocket-Reconnect idempotent planen, ohne im Fehlerereignis erneut
   `close()` aufzurufen.

App, Alfred, Audio, Datenbank und Tool-Routing bleiben unverändert.

## Abnahme

- Dreiergruppe vollständig auflösen; alle drei Räume sind danach einzeln.
- Eine neue Playlist auf Küche stoppt die vorherige Profilqueue, löst eine
  bestehende Gruppe um Alt- oder Neuziel und spielt ausschließlich in Küche.
- Ein nach fünf Sekunden noch laufender Soloist-Start wird durch Rücklesen
  korrekt bestätigt oder nachvollziehbar abgelehnt.
- Ein WebSocket-Fehler erzeugt höchstens einen Reconnect und keinen rekursiven
  `close()`-Aufruf.
