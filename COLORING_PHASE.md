# Leos Bildauswahl – Green 0.3.77

6. September 2026. Umsetzung beauftragt, Live-Rollout noch nicht freigegeben.
Branch `codex/leo-coloring-assets`, Ausgangspunkt Main `5f029ac`.

Der vorhandene Druckadapter erhält drei unveränderliche A4-Vorlagen aus privatem Storage.
`leo-v1` im Claim verhindert, dass ältere Green-Versionen einen Motivauftrag
als Testseite drucken. Das Journal bindet Motiv und Drucker. Wiederanlieferung,
Neustart und unbestätigte Übertragung dürfen keinen erneuten Ausdruck auslösen.
Keine frei wählbaren Netzwerkziele, Shellbefehle oder Konvertierung auf Green.
Das öffentliche Repository enthält keine Drittanbieter-Bilddateien. Der
bestehende authentifizierte Druckendpoint liefert ausschließlich feste Motive;
Green begrenzt Dateigröße/Zeit, prüft Hashes und speichert einen privaten Cache.

Alle Assets in `hoebbie-gateway/print-assets.mjs` haben feste SHA-256-Prüfsummen.
Die Druckraster wurden mit Poppler/300 dpi und der offiziellen CUPS Raster API
aufbereitet und als vollständige einzelne A4-Seite zurückgelesen. Die maximale
Dateigröße des nativen Helpers ist auf 12 MB begrenzt; ausschließlich vier
fest erlaubte Pfade einschließlich Pilotseite; Katalogdateien liegen unter /data/print-assets. Größte aktuelle Vorlage: 4,4 MB.

## Quellen

Geprüft am 6. September 2026. Private Familienvorlagen, keine öffentliche
Weiterverbreitungslizenz. Alle Hinweise im Original erhalten/ergänzt.

- `charizard-v1`: [Pokémon Parents](https://parents.pokemon.com/en-us/),
  [Glurak-PDF](https://assets.pokemon.com/assets/cms2/pdf/play-pokemon/pokemon-club/coloring-pages/color-by-number-charizard.pdf), einzige Seite.
- `lloyd-v1`: [LEGOLAND Florida](https://www.legoland.com/florida/blog/coloring-sheet-lloyd-s-spinjitzu-kick-of-energy-tornado/),
  [Druckvorlage](https://www.legoland.com/florida/media/btkhfgby/ninjago-coloring-1.png), einzige Seite.
- `ninjago-comic-v1`: [LEGO Coloring Pages](https://www.lego.com/cdn/cs/set/assets/bltd45f05c205bceb4a/LEGO_Coloring_Pages.pdf), Seite 1 von 8.

## Prüfung und Rollout

146 lokale Repository-Tests plus vier zusätzliche private Tests grün,
einschließlich privatem Downloadcache und echter
libcups-Übertragung aller drei
Raster an einen lokalen IPP-Simulator, verlorener Antwort, Neustart und
Motivkonflikt. Kein realer Ausdruck. ARM64-Containerprüfung erfolgt im PR nach ausdrücklicher Freigabe des
öffentlichen Branch-Pushs. Die drei echten Motive werden ausschließlich im
privaten Hoebbie-OS-Repository gehalten; öffentliche Tests nutzen eigene Fixtures.

App/Backend-Details im separaten Hoebbie-OS-Repository unter
`docs/LEO_COLORING_LIBRARY_PHASE.md`. Nach konkreter Freigabe Backend-Migration
und Endpoint veröffentlichen, Green aktualisieren, dann gesonderte
`coloring_enabled`-Freigabe. Bei Rücknahme keine ungeklärten Aufträge löschen;
Queue und Journal behalten. Keine neuen Hersteller-Zugangsdaten erforderlich.

## Sammlungserweiterung vom 6. September 2026

56 privat geprüfte Motive, Protokoll `leo-v2`, Version 0.3.78. Die feste
Dateiliste wird auch im nativen CUPS-Client geprüft. Ausschließlich Code und
Hashes im Green-Repository; die Bilddateien bleiben privat in Hoebbie OS und
später im privaten Storage. Maximal 64 MB Rastercache, LRU-Verdrängung nur
bekannter Bilddateien. Journaldateien mit Wiederholschutz bleiben erhalten.
147 Gateway-Tests sowie privater nativer Transfer aller 56 Motive grün.
Kein realer Druck, keine Installation und kein öffentlicher Push.
