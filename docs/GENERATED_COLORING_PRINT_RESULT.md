# Eigene Ausmalbilder – Green 0.3.80

Der bestehende Druckadapter unterstützt serverseitig freigegebene eigene
Ausmalbilder über leo-v3. SHA-256, Bytezahl, Ablaufzeit und exaktes Dateischema
werden vor dem Druck geprüft. Der bestehende Wiederholschutz bleibt erhalten.
Temporäre Raster werden nach Verarbeitung und beim Wiederanlauf entfernt.
Keine Motive, Zugangsdaten oder privaten Geräteinformationen im Repository.

Grundlage ist der offizielle CUPS-Raster-/IPP-Pfad des vorhandenen Adapters;
keine Änderung an Audio oder Smart-Home-Steuerung. Der Server muss den
passenden leo-v3-Vertrag vor der Freischaltung liefern. Alte Adapter holen
keine eigenen Bildaufträge ab.

Prüfung: 163 Gateway-Tests einschließlich nativem lokalem IPP-Simulator.
CI baut zusätzlich das tatsächliche ARM64-Image. Kein realer Papierdruck.
Veröffentlichung erfolgt im Rahmen der ausdrücklichen Release-Freigabe.
