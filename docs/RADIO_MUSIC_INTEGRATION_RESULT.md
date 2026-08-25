# Radio-Vertrag für Hoebbie OS Musik

Stand: 25. August 2026 · Add-on-Version 0.3.47

Der Gateway verwendet für Radio denselben serverautorisierten
`player_queues/play_media`-Pfad wie für Spotify. Als `media` wird ausschließlich
eine zuvor von Hoebbie OS freigegebene HTTPS-Stream-URL übergeben. Räume,
Gruppen, Lautstärke und Queue-Snapshots bleiben unverändert gemeinsam.

Für Music Assistant 2.9.13 wurde im offiziellen Tag `2.9.13` verifiziert:

- direkte URLs werden vom Builtin-Provider aufgelöst und endlose Streams als
  Radio behandelt;
- `radio_mode` bleibt `false`, weil diese Option die dynamische
  Ähnlichkeitsfunktion und nicht lineares Webradio bezeichnet;
- `/api-docs/commands.json` beschreibt `player_queues/play_media` und
  `music/radios/library_items` maschinenlesbar.

Beim Start liest der Gateway diesen Vertrag ausschließlich per GET und meldet
nur zwei Capability-Boolesche Werte. Tokens, URLs, Player- oder Bibliotheksdaten
werden nicht protokolliert. Die Sender werden nicht in Music Assistant
geschrieben; dadurch verändert das Add-on keine produktiven MA-Einstellungen.
Ein Radiostart prüft den gelesenen Vertrag erneut beziehungsweise verwendet
das bestätigte Ergebnis und bricht vor jedem Playerbefehl ab, falls direkte
URI-Wiedergabe nicht dokumentiert ist.
