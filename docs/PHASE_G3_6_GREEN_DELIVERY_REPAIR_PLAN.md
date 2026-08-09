# Phase G3.6 – zuverlässige Green-Zustellung für Alfred

Stand: 9. August 2026  
Status: in Umsetzung nach Freigabe

## Befund

Ein Alfred-Einzelauftrag wird serverseitig korrekt validiert und als
`queued` gespeichert. Der Green beansprucht ihn jedoch nicht sofort. Die
private Realtime-Verbindung meldet bisher weder ihre erfolgreiche Anmeldung
noch den Empfang eines Weckereignisses. Deshalb kann der Fehler nicht sicher
vom Kanal, von der Nachricht oder vom Claim-Pfad abgegrenzt werden.

## Plan

1. Den Green-Realtime-Lebenszyklus datensparsam protokollierbar machen:
   Anmeldung, Empfang eines rein kategorischen Weckereignisses,
   Wiederverbindung und Claim-Ergebnis. Gerätekennungen, Schlüssel und
   Befehlsinhalte werden nicht geloggt.
2. Den bestehenden, serverseitig autorisierten Claim- und Bestätigungspfad
   unverändert beibehalten. Ein Realtime-Ereignis führt selbst weiterhin
   keinerlei Aktion aus.
3. Alfred darf bei einer erfolgreichen Einreihung nur die Weitergabe
   bestätigen, nicht den Schalt-Endzustand behaupten. Erst die bestätigte
   Green-Rückmeldung berechtigt zu einer Erfolgsantwort.
4. Unit- und Integrationsregressionen für Einzelgeräte, Gruppen und Routinen
   ausführen. Kein Auftrag wird durch Tests an ein reales Gerät gesendet.

## Latenz- und Sicherheitsentscheidung

Die Reparatur erhöht den Reasoning-Aufwand von `gpt-realtime-2.1` nicht;
Alfred bleibt bei `low`. Der Green behält den ereignisbasierten Weg statt eines
ständigen Zwei-Sekunden-Pollings. Damit bleiben Kosten und Latenz stabil. Die
alleinige Seltenheitsabfrage bleibt nur ein Ausfallrückfall und ist keine
Erfolgsbestätigung.
