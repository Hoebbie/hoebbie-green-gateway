# Radio – Live-Metadaten aus Music Assistant

Stand: 26. August 2026

## Ergebnis

Der Green-Adapter liest Radio-Titel jetzt aus dem von Music Assistant 2.9.13
vorgesehenen Feld `PlayerQueue.stream_title`. Bislang wurde nur
`PlayerQueue.current_item.name` ausgewertet; das ist bei einem linearen Stream
in der Regel der Sendername und nicht der aktuell laufende Titel.

Übliche ICY-Angaben im Format `Künstler - Titel` werden in die bereits
bestehenden gemeinsamen Felder `artist` und `title` überführt. Eine fehlende
oder unvollständige Angabe bleibt nicht blockierend. Queue, Räume, Lautstärke
und der Spotify-Pfad wurden nicht verändert.

## Verifikation

- offizieller Music-Assistant-2.9.13-Quellstand und dessen
  `PlayerQueue.stream_title`-Vertrag geprüft;
- gezielter Adaptertest für `Künstler - Titel` ergänzt;
- Fallbacktest für fehlende beziehungsweise einteilige Metadaten ergänzt;
- Add-on-Version auf `0.3.49` erhöht.

## Redigierte Laufzeitdiagnose

Falls die App trotz laufender Radio-Wiedergabe keine Live-Titel zeigt, kann
Green nun zusätzlich ausschließlich lesend feststellen, ob die aktuelle
Music-Assistant-Queue überhaupt `stream_title`-Werte liefert. Der Logeintrag
enthält nur zwei aggregierte Zähler: vorhandene Stream-Titel und daraus
erkennbare Künstler–Titel-Paare. Er enthält ausdrücklich keine Sendernamen,
Titel, Künstler, Queue- oder Player-IDs, Tokens oder andere Zugangsdaten.

Die Diagnose ändert keine Queue, Wiedergabe, Räume, Lautstärke oder
Music-Assistant-Einstellung. Sie dient dazu, sauber zwischen fehlender
Upstream-Metadatenlieferung und einer Adapter-/Projektionsabweichung zu
unterscheiden.
