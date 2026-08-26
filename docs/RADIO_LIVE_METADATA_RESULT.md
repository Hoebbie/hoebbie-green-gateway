# Radio – Live-Metadaten aus Music Assistant

Stand: 26. August 2026

## Ergebnis

Der Green-Adapter liest Radio-Titel bevorzugt aus dem von Music Assistant 2.9.13
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

Falls Music Assistant für einen laufenden, serverautorisierten Direktstream
kein `stream_title` liefert, liest der Green-Adapter ergänzend genau einen
begrenzt großen ICY-Metadatenblock direkt von diesem HTTPS-Stream. Die Abfrage
läuft höchstens alle 30 Sekunden, löst keinen Player-Befehl aus und darf die
Wiedergabe niemals blockieren. Nicht-Radio-Titel (etwa Spotify) sind durch die
fehlende feste Spieldauer des Radio-Queue-Items abgegrenzt und werden nicht
überschrieben.

Ein Teil der offiziellen Sender-CDNs verwendet weiterhin die ältere
Statuszeile `ICY 200`, die der strikte Node-HTTP-Leser verwirft. Version 0.3.52
liest diese Antwort deshalb über den im Add-on enthaltenen, ebenfalls auf sieben
Sekunden und eine kleine Datenmenge begrenzten Kompatibilitätspfad. Das betrifft
Radio Hamburg, 90s90s und TOGGO Radio; keine Sender-URL, Wiedergabe- oder
Raumkonfiguration wird dadurch geändert.

Version 0.3.53 nutzt denselben Kompatibilitätspfad auch dann, wenn der
Standardleser technisch antwortet, im ersten begrenzten Abruf aber noch keinen
Titel erhält. Das ist bei diesen Streams ein normaler leerer ICY-Block und kein
Wiedergabefehler.

Version 0.3.54 stößt den bestehenden, nicht-blockierenden Abgleich zusätzlich
unmittelbar nach einem bestätigten Radiostart an. Der reguläre 30-Sekunden-
Abgleich bleibt bestehen.

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
