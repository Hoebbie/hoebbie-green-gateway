# Changelog

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
