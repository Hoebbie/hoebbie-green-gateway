# Lars-Profil – generischer VW-Fahrzeugadapter

Stand: 29. August 2026  
Branch: `codex/lars-profile-vw`  
Add-on-Version: `0.3.69`

Der bestehende Lars-Profil-Reporter akzeptiert optional eine feste Zuordnung
von Home-Assistant-Entitäten für Tank, Reichweite, Kilometerstand, grobe Zone,
Verriegelung, Türen, Fenster, Warnungsanzahl und Servicetermin. Es werden weder
Volkswagen-Zugangsdaten noch Koordinaten gelesen oder übertragen. Tank- und
Kilometerwerte benötigen die von Home Assistant bestätigten Einheiten `%`
beziehungsweise `km`; unbekannte Zustände werden ausgelassen statt geschätzt.
Für jedes übertragene Feld wird der eigene `last_updated`-Zeitpunkt bewahrt.

Der reale Green-Stand enthält aktuell keine Volkswagen-Integration und keine
Tiguan-Entitäten. Die verbreitete HACS-Integration Volkswagen Connect ist nach
ihrem eigenen aktuellen Release und Issue #989 seit dem 18. August 2026 erneut
durch Volkswagen blockiert. Deshalb bleibt die Fahrzeugzuordnung bewusst leer
und Version 0.3.69 wird nicht installiert, bis eine funktionierende Quelle
kontrolliert bestätigt wurde.

Prüfung: 104 Node-Tests, JavaScript-Syntaxprüfung und Diff-Prüfung sind grün.
