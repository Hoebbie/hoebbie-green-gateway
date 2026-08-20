# E4.10.1 – Verifizierte Queue-Skip-Aufträge

Datum: 19. August 2026
Version: `0.3.40`
Status: lokal umgesetzt und geprüft, nicht auf Green bereitgestellt

## Umsetzung

- Der Gateway akzeptiert ausschließlich die serverseitig beanspruchten
  Richtungen `previous` und `next`.
- Die Richtungen werden fest auf `player_queues/previous` beziehungsweise
  `player_queues/next` abgebildet; die Queue-ID stammt aus dem beanspruchten,
  serverautorisierten Auftrag.
- Vor und nach dem Befehl wird dieselbe Music-Assistant-Queue gelesen. Nur eine
  geänderte Queueposition, geänderte Medieninformation oder ein bestätigter
  Neustart des laufenden Titels bei „Zurück“ führt zu einem erfolgreichen
  Abschluss.
- Interne Queue-Indizes verlassen den Green-Adapter nicht. Titel, Queue-ID und
  Medieninhalt werden nicht protokolliert.
- Die lokalen API-Docs melden ohne vertrauliche Werte, ob die zwei festen
  Befehle in der installierten Music-Assistant-Shell erscheinen.

## Prüfung

Alle 59 Node-Tests sind grün. Enthalten sind der feste Weiter-Befehl mit
Queue-Rücklesung, der Neustartfall bei Zurück und die Abweisung jeder anderen
Richtung. `git diff --check` ist grün.

Eine Bereitstellung auf den Green-Feature-Branch, Green-`main` oder das Gerät
ist nicht erfolgt und benötigt jeweils die vorgesehene neue Freigabe.
