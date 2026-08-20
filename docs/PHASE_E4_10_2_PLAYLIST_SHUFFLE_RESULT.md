# E4.10.2 – Verifizierter Playlist-Shuffle

Datum: 19. August 2026
Version: `0.3.41`
Status: lokal umgesetzt und geprüft

## Umsetzung

- Der Gateway akzeptiert nur einen serverautorisierten Auftrag aus Queue-ID
  und booleschem Zielzustand.
- Ausgeführt wird ausschließlich `player_queues/shuffle` mit
  `shuffle_enabled`; frei wählbare Music-Assistant-Befehle sind ausgeschlossen.
- Nach dem Befehl wird dieselbe Queue erneut gelesen. Nur der erwartete
  bestätigte Shuffle-Zustand führt zu einem erfolgreichen Abschluss.
- Queue-Snapshots enthalten den booleschen Shuffle-Zustand, aber keine
  zusätzlichen Queue-Inhalte oder Zugangsdaten.
- Die API-Docs-Prüfung meldet ausschließlich, ob der feste Shuffle-Befehl in
  der lokalen Music-Assistant-Shell vorhanden ist.

## Prüfung

Alle 62 Node-Tests sind grün. Enthalten sind Shuffle an, Shuffle aus, die
exakte Befehls- und Argumentbindung, Rücklesung sowie Abweisung eines
ungültigen Zielzustands.
