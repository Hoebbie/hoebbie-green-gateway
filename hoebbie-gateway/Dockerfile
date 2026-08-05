ARG BUILD_FROM

FROM node:22-alpine AS build
WORKDIR /build
COPY apps/home-assistant-gateway/package.json apps/home-assistant-gateway/tsconfig.json ./
COPY apps/home-assistant-gateway/src ./src
COPY tsconfig.base.json /tsconfig.base.json
RUN npm install --no-audit --no-fund --save-dev typescript @types/node && npx tsc

FROM ${BUILD_FROM}
RUN apk add --no-cache nodejs
COPY --from=build /build/dist /app
COPY run.sh /run.sh
RUN chmod a+x /run.sh
CMD ["/run.sh"]
