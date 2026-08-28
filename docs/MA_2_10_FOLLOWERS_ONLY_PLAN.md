# Green – Music Assistant 2.10.0 Followers-only: Plan

Datum: 28. August 2026  
Status: umgesetzt und lokal geprüft

1. Den tatsächlichen Music-Assistant-2.10.0-Controller als Sollpfad festhalten.
2. Vor dem Auflösen Leader, Folgeräume und laufende Leader-Queue frisch lesen.
3. Ausschließlich jeden bestätigten Folgeraum über `players/cmd/ungroup`
   trennen; niemals `ungroup_many`, Leader-`ungroup`, Queue-`stop` oder
   nachträgliches `play_index` verwenden.
4. Queue und Gruppentopologie zweimal stabil rücklesen. Bei abweichender
   Ausgangstopologie vor jeder Mutation abbrechen.
5. Add-on-Version auf 0.3.67 erhöhen und den exakten 2.10.0-Ablauf testen.
