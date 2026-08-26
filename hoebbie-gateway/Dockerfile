ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:3.21
FROM ${BUILD_FROM}
ARG BUILD_ARCH
ARG BUILD_VERSION
LABEL \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.type="app" \
  io.hass.version="${BUILD_VERSION}"
RUN apk add --no-cache nodejs
COPY gateway.mjs /app/gateway.mjs
COPY gateway-response.mjs /app/gateway-response.mjs
COPY music-assistant-client.mjs /app/music-assistant-client.mjs
COPY radio-stream-metadata.mjs /app/radio-stream-metadata.mjs
COPY queue-drain.mjs /app/queue-drain.mjs
COPY realtime-protocol.mjs /app/realtime-protocol.mjs
COPY routine-target.mjs /app/routine-target.mjs
COPY run.sh /run.sh
RUN chmod a+x /run.sh
CMD ["/run.sh"]
