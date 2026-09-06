# Green-Druck-Pilot – 6. September 2026

Auftrag Lars: den nächsten Druckbaustein auf Green umsetzen. Der einmalige
Mac-Ausdruck ist einschließlich Sichtprüfung bestanden. Umfang dieses Pakets:
dauerhafter, deaktivierbarer Druckadapter und sicherer Server-Auftrag für
genau die feste, bereits geprüfte A4-Testseite. Keine Leo-Oberfläche,
Bildsuche oder KI-Erstellung in dieser Phase.

Basis: Hoebbie OS `7af0df5`, Green `262db19` (Add-on 0.3.75).
Branches: `codex/green-print-pilot` und `codex/green-print-adapter`.

1. Offiziellen IPP-/CUPS-Pfad und Alpine-Paket prüfen; keine eigene
   Protokollimplementierung. Die geprüfte PWG-Testdatei mit Prüfsumme bündeln.
2. Eigenständiges Green-Modul: opt-in Druckerkonfiguration, fest erlaubtes
   Asset, feste A4/Schwarzweiß/1-Kopie-Optionen, persistentes Journal vor
   Übermittlung, Statusabfrage und konservativer Wiederanlauf ohne Blind-Retry.
3. Additive Migration mit abgeschotteter Druckqueue, Haushalt/Geräte-
   Autorisierung, einmaliger Mutation, atomarem Claim, Gültigkeit, Audit
   und Gateway-Key-Prüfung. Bestehendes privates Wecksignal wiederverwenden;
   keine offenen Ports, keine Druckeradresse aus Toolargumenten.
4. Separaten Server-Endpunkt für Anforderung, Status, Claim und Ergebnis
   anbinden. Green-Worker unabhängig von Musik/Haus betreiben.
5. Simulator-, Neustart-, Doppelauftrag-, Timeout- und Rechteprüfungen;
   bestehende Prüfungen laufen lassen. Getrennte private PRs vorbereiten.
6. Vor Main-/Deployment-/Green-Aktualisierung konkrete geprüfte Commits und
   Freigabeschritt nennen. Realer Green-Test erst auf eindeutig zugeordnetem
   ausgelieferten Stand. Keine TestFlight-Änderung nötig, da kein App-Code.

Pilotgrenzen: ein aktiver Auftrag je Gateway, höchstens drei neue Testaufträge
pro Haushalt in 24 Stunden, maximal zehn Minuten bis Übermittlung. Unklare
Übermittlung wird niemals als Fehlschlag mit automatischem Neudruck behandelt.
Bei blockiertem Gerät bleiben Fehler sichtbar; noch keine freie PDF-Annahme.

Quellen: PWG IPP Guide; OpenPrinting `ipptool`, `ipptoolfile` und Raster API;
Alpine 3.21 CUPS APKBUILD; offizielle HA-App-Konfiguration. Versionen und
verbleibende Laufzeitprüfung im Ergebnisbericht dokumentieren.
