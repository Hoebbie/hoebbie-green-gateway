# Green – Music Assistant 2.10.0 Followers-only: Ergebnis

## Umsetzung

Add-on 0.3.67 richtet den Erhalt einer laufenden Profilwiedergabe auf Music
Assistant 2.10.0 aus. Green liest die vollständige Gruppentopologie vor jeder
Mutation und akzeptiert den Auftrag nur, wenn der serverautorisierte
Profilraum weiterhin Leader aller übrigen Räume ist.

Danach ruft Green `players/cmd/ungroup` ausschließlich für die bestätigten
Folger auf. Der Leader wird nicht entgruppiert, gestoppt oder neu gestartet.
`ungroup_many`, `player_queues/stop` und `player_queues/play_index` werden in
diesem Erhalt-Pfad nicht mehr verwendet. Zwei stabile Rücklesungen bestätigen
anschließend eigenständige stille Folger und die unveränderte fortlaufende
Leader-Queue.

Der separate, ausdrücklich angeforderte Start einer neuen Einzelraum-Session
darf eine bestehende Session weiterhin vollständig ersetzen.

## Official First

Geprüft wurden der offizielle Music-Assistant-2.10.0-Controller und die dort
gebundene Version `aiosonos==0.1.12`. Music Assistant überträgt beim
Entgruppieren eines Leaders die Führung auf ein verbleibendes Gruppenmitglied.
Ein Sammel-Auftrag über Leader und Folger kann dadurch die übertragene Führung
erneut auflösen. Der Sonos-Gruppenstopp kann zudem die gemeinsame Cloud-Queue
leeren. Der Followers-only-Pfad vermeidet beide Mutationen.

## Tests

- vollständige Green-Suite: 99/99 grün
- Leader bleibt unangetastet; nur Folger erhalten `players/cmd/ungroup`
- unveränderte Queue, Index, Titel und fortlaufende Position bestätigt
- wieder spielender Folger verhindert eine falsche Erfolgsmeldung
- geänderter Koordinator bricht vor jedem Player-Befehl ab
- Add-on-Version: 0.3.67

## Bereitstellung

Noch nicht erfolgt. Pull Request, Commits, CI-Läufe und Home-Assistant-Nachweis
werden nach der freigegebenen Bereitstellung ergänzt.

## Risiko

Die reale Soloist-/Sonos-Topologie kann sich während eines Auftrags ändern. In
diesem Fall bleibt der Ablauf bewusst fail-closed und meldet keine bestätigte
Auflösung.
