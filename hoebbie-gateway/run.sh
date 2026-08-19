#!/usr/bin/with-contenv bashio
set -euo pipefail

export HOME_ASSISTANT_URL="http://supervisor/core"
export HOME_ASSISTANT_ACCESS_TOKEN="${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN ist nicht verfügbar.}"
export HOEBBIE_GATEWAY_URL="https://rstobkrfiebbmolrglal.supabase.co/functions/v1/home-assistant-pilot"

# Music Assistant stays opt-in until the separate discovery release is enabled.
# The Supervisor stores the password-valued option redacted for unprivileged
# callers; it is never printed by this script or the gateway.
export MUSIC_ASSISTANT_URL="$(bashio::config 'music_assistant_url')"
export MUSIC_ASSISTANT_ACCESS_TOKEN="$(bashio::config 'music_assistant_access_token')"
export MUSIC_PROFILE_PROVIDERS_JSON="$(bashio::config 'music_profile_providers_json')"

exec node /app/gateway.mjs
