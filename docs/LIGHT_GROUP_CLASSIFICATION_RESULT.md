# Einzellichtzählung – 6. September 2026

Begleitänderung für Hoebbie OS Sichtschutz/Routinen/Lampenzahl. Das tatsächliche Add-on übernimmt HA is_hue_group und nichtleere entity_id-Gruppenmitglieder als isGroup in den bestehenden Inventarbericht. Keine Änderung an Befehlen, Geräterecht oder Abfragetakt. Docker kopiert das neue Modul. Zielversion 0.3.75, nicht veröffentlicht.

Offizielle Referenz: Home Assistant Core 2026.9.1 hue/v2/group.py und https://www.home-assistant.io/integrations/hue/. 113 Node-Tests und Syntaxprüfung grün. Vor Auslieferung muss die Hoebbie-OS-Migration 20260906141000_light_group_classification.sql verfügbar sein. Ohne Migration wird das zusätzliche Feld vom bisherigen Import ignoriert. Keine Secrets im Diff. Main/Release/Geräteupdate benötigen Lars' Freigabe.
