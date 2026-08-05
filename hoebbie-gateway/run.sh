#!/usr/bin/with-contenv bashio
set -euo pipefail

export HOME_ASSISTANT_URL="http://supervisor/core"
export HOME_ASSISTANT_ACCESS_TOKEN="${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN ist nicht verfügbar.}"
export HOEBBIE_GATEWAY_URL="https://rstobkrfiebbmolrglal.supabase.co/functions/v1/home-assistant-pilot"

exec node /app/gateway.mjs
