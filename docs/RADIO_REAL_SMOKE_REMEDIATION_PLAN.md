# Radio-Real-Smoke – Session- und Startkorrektur

Datum: 26. August 2026

## Fehlerbild

Der erste TestFlight-Smoke zeigte zwei unabhängige Music-Assistant-Queues.
Hoebbie OS zeigte weiterhin einen alten Titel, während eine direkte Spotify-
Wiedergabe auf der bestätigten Profilqueue bereits einen anderen Titel führte.
Fortsetzen wirkte deshalb auf die echte Sonos-Queue, die sichtbaren Metadaten
blieben jedoch veraltet. Ein Radiostart blieb während der Bestätigung hängen.

## Ursache und kleinster Fix

- Der Green-Gateway wählte bei mehreren laufenden Queues die erste beliebige
  Music-Assistant-Queue. Die bereits bestätigte Profilqueue hatte nur bei
  `PAUSED` oder `IDLE` Vorrang. Sie erhält nun unabhängig von ihrem Zustand
  Vorrang, solange sie im aktuellen Queue-Register existiert.
- Ein gegebenenfalls bereits falsch gespeicherter lokaler Queue-Bezug wird
  nicht blind weiterverwendet. Nur eine Queue, für die der bestehende
  serverseitige Profilabgleich tatsächlich mindestens eine Sitzung aktualisiert,
  wird erneut lokal gespeichert; andernfalls prüft Green begrenzt den nächsten
  Music-Assistant-Kandidaten.
- Music Assistant 2.9.13 löst direkte Radio-URLs vor dem Queue-Start über den
  Builtin-Provider auf. Dafür galt fälschlich das allgemeine Fünf-Sekunden-
  HTTP-Limit. Nur der feste Radio-Start erhält nun ein begrenztes
  20-Sekunden-API- und 30-Sekunden-Gesamtbudget.
- Räume, Gruppen, Lautstärke, Transport und Metadaten bleiben auf demselben
  bestehenden Profil-/Queue-Pfad. Es entsteht keine Radio-Sonderarchitektur.

Vor einem erneuten Geräte-Smoke werden Unit-Tests, Syntaxprüfung, Container-
Build und Secret-Prüfung ausgeführt. Das Green-Add-on wird erst danach gezielt
auf Version 0.3.48 aktualisiert.
