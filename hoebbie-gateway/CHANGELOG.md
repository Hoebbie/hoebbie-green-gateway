## 0.3.92

- Optionaler Hoebbie-FM-Adapter mit bestätigtem Status und Pause/Fortsetzen/Stopp.
- Morgenroutine kann Moin mit Hoebbie wählen, ohne die Studio-Auswahl zu ändern.
- Normale Radiosender bleiben unabhängig von der FM-Erreichbarkeit.

## 0.3.91

- Preserve observed station identity in the outgoing profile report.
- Report station changes immediately while retaining the existing payload allowlist.

## 0.3.90

- Report external radio station identity independently of song metadata.
- Preserve all status reporting and request reductions from 0.3.89.

## 0.3.89

- Übermittelt ausschließlich technische Updateangaben zu Core, OS, Supervisor, Green Gateway und Music Assistant über die bestehende Core-API und den bestehenden Gesundheitskanal.
- Keine zusätzlichen Rechte oder Netzwerkfreigaben; keine Updateinstallation. Bisherige Gateway-/HA-/Musikfunktionen erhalten.

# Changelog

## 0.3.88

- Read Music Assistant API availability, existing-token acceptance and server version locally.
- Extend the existing HA status report without exporting credentials, player or music data.
- Keep missing, rejected and unsupported status distinct; no playback commands.

## 0.3.87

- Report Core reachability and version through the existing authenticated gateway channel.
- Keep Supervisor credentials local; no device data, new listener or device commands.
- Preserve the original measurement timestamp and report failed Core checks explicitly.

## 0.3.86

- Skip unrelated empty command queues using authenticated read-only hints.
- Avoid unchanged music reports while retaining live changes and heartbeats.
- Reduce idle vacuum reporting; preserve immediate command feedback.

## 0.3.84

- Avoid empty music-group Edge recovery calls with an authenticated read-only hint.
- Preserve existing recovery on timeout, unavailable hints and expired sessions.
- Aggregate recovery diagnostics without command data.

## 0.3.83

- Deduplicate unchanged profile snapshots with a 60-second heartbeat.
- Preserve immediate reporting of changed data and observation timestamps.
- Add payload-free Edge request diagnostics.

## 0.3.82

- Musiksuche mit Songs, Alben und öffentlichen Spotify-Playlists.
- Cover und Metadaten für die visuelle Ergebnisansicht.

## 0.3.81

Add capability-validated vacuum controls, state reporting and maintenance data.
Commands require explicit household activation and are never retried on uncertain outcomes.

## 0.3.80

Runtime unchanged. Installation source separated from private development.
