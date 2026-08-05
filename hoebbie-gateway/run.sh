#!/usr/bin/with-contenv bashio
set -euo pipefail

export HOEBBIE_GATEWAY_URL="$(bashio::config 'gateway_url')"
export HOME_ASSISTANT_URL="$(bashio::config 'home_assistant_url')"
export HOME_ASSISTANT_ACCESS_TOKEN="$(bashio::config 'home_assistant_access_token')"
export HOME_ASSISTANT_PILOT_ENTITY_ID="$(bashio::config 'pilot_entity_id')"

exec node /app/index.js
