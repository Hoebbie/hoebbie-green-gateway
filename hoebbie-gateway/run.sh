#!/usr/bin/with-contenv bashio
set -euo pipefail

export HOEBBIE_GATEWAY_URL="$(bashio::config 'gateway_url')"
export HOME_ASSISTANT_URL="http://supervisor/core"
export HOME_ASSISTANT_ACCESS_TOKEN="${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN ist nicht verfügbar.}"
export HOME_ASSISTANT_PILOT_ENTITY_ID="$(bashio::config 'pilot_entity_id')"

exec node /app/gateway.mjs
