# E4.10 – Green-Reparatur für Realtime-Berichte

Datum: 19. August 2026  
Version: `0.3.39`

## Befund

Der echte Development-Lauf zeigte zwei getrennte Ursachen:

- Music-Assistant-Realtime-Ereignisse lösten für jedes einzelne Ereignis einen
  vollständigen Inventar- und Sitzungsbericht aus. Die parallelen Berichte
  belegten den lokalen und serverseitigen Pfad so stark, dass kurzlebige
  Titelsuchaufträge erst nach ihrer Frist abgeschlossen wurden.
- Music Assistant lieferte bei einer aktiven Queue einen Quellzeitanker, der
  außerhalb des bereits aktivierten E4.7.2-Serververtrags lag. Der Server
  lehnte den Snapshot deshalb korrekt ab.

Die Playlist-Abfrage wurde im selben Lauf innerhalb rund einer Sekunde
erfolgreich abgeschlossen. Providerzuordnung, Music-Assistant-Bibliothek und
der grundsätzliche Katalog-Abschlussvertrag bleiben daher unverändert.

## Umsetzung

- Realtime-Signale werden 250 Millisekunden gebündelt.
- Es läuft höchstens ein vollständiger Musikbericht gleichzeitig. Ereignisse
  während dieses Berichts erzeugen genau einen nachfolgenden Bericht.
- Fehler verlieren einen vorgemerkten Nachlauf nicht.
- Ein Quellzeitanker wird nur übernommen, wenn er zu einem frisch beobachteten,
  spielenden Snapshot passt. Veraltete, zukünftige und bei Pause irrelevante
  Anker werden als `null` gemeldet. Es wird keine Zeit ersetzt oder geschätzt.
- Suche, Wiedergabestart, Gruppen, Lautstärke, Seek und Raumwechsel behalten
  ihre getrennten serverautorisierten Auftragsarbeiter.

## Prüfung

- 56 Node-Tests grün.
- Neue Tests decken Ereignisbündelung, genau einen Nachlauf, Fehlerfortsetzung
  sowie gültige, veraltete, zukünftige und pausierte Zeitanker ab.
- Syntaxprüfung für Gateway und Music-Assistant-Adapter grün.
- Docker-Laufzeitimportvertrag, Diff-Prüfung und Secret-Suche grün.

## Rollout-Grenze

Dieses Paket ändert ausschließlich das Green-Add-on. Datenbank, Edge Function,
Mobile Preview, Hoebbie-OS-`main`, Release und Android bleiben unverändert.
Nach grüner GitHub-CI darf der ausdrücklich freigegebene Fast-forward auf
Green-`main` erfolgen. Anschließend ist ein Geräte-Realtest mit Titelsuche und
den datensparsamen Logmarkern erforderlich.
