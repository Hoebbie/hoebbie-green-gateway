ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:3.21
FROM ${BUILD_FROM}
ARG BUILD_ARCH
ARG BUILD_VERSION
LABEL \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.type="app" \
  io.hass.version="${BUILD_VERSION}"
RUN apk add --no-cache curl nodejs "cups-libs>=2.4.18"
COPY print /app/print
RUN apk add --no-cache --virtual .print-build build-base "cups-dev>=2.4.18" \
    && cc -Wall -Wextra -Werror /app/print/ipp-client.c -lcups -o /app/print/ipp-client \
    && apk del .print-build
COPY generated-print-asset.mjs /app/generated-print-asset.mjs
COPY print-asset-cache.mjs /app/print-asset-cache.mjs
COPY print-assets.mjs /app/print-assets.mjs
COPY print-adapter.mjs /app/print-adapter.mjs
COPY print-worker.mjs /app/print-worker.mjs
COPY gateway.mjs /app/gateway.mjs
COPY light-group.mjs /app/light-group.mjs
COPY gateway-response.mjs /app/gateway-response.mjs
COPY music-assistant-client.mjs /app/music-assistant-client.mjs
COPY personal-profile-status.mjs /app/personal-profile-status.mjs
COPY radio-stream-metadata.mjs /app/radio-stream-metadata.mjs
COPY read-only-reporter.mjs /app/read-only-reporter.mjs
COPY queue-drain.mjs /app/queue-drain.mjs
COPY realtime-protocol.mjs /app/realtime-protocol.mjs
COPY routine-target.mjs /app/routine-target.mjs
COPY waste-collection.mjs /app/waste-collection.mjs
COPY run.sh /run.sh
RUN chmod a+x /run.sh
CMD ["/run.sh"]
