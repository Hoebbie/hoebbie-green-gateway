#!/usr/bin/with-contenv bashio
set -euo pipefail

export HOME_ASSISTANT_URL="http://supervisor/core"
export HOME_ASSISTANT_ACCESS_TOKEN="${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN ist nicht verfügbar.}"
export HOEBBIE_GATEWAY_URL="https://rstobkrfiebbmolrglal.supabase.co/functions/v1/home-assistant-pilot"

music_assistant_url="$(bashio::config 'music_assistant_url')"
music_assistant_access_token="$(bashio::config 'music_assistant_access_token')"
if [[ -n "${music_assistant_url}" || -n "${music_assistant_access_token}" ]]; then
  [[ -n "${music_assistant_url}" && -n "${music_assistant_access_token}" ]] || bashio::exit.nok "Music Assistant benötigt Adresse und Zugangsschlüssel gemeinsam."
  export MUSIC_ASSISTANT_URL="${music_assistant_url}"
  export MUSIC_ASSISTANT_ACCESS_TOKEN="${music_assistant_access_token}"
fi

exec node /app/gateway.mjs
