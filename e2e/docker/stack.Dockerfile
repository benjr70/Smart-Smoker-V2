# Hermetic e2e image builder — builds all four services from the checkout for
# amd64. Build context is the repository root.
#
# One Dockerfile, shared `deps` + `build` stages, four runtime targets. Compose
# selects a target per service; buildkit caches the shared stages so the single
# `npm ci` + build runs once across all four image builds.
#
# apps/*/node_modules and packages/*/node_modules are excluded by the root
# .dockerignore, so the build always installs fresh, correct-platform modules.

# ---------------------------------------------------------------------------
# deps: install the whole workspace once (needs toolchain for native modules:
# serialport in device-service, usb at the repo root).
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ libudev-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
# Workspace topology: root manifest + lockfile + every member manifest.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/device-service/package.json apps/device-service/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/smoker/package.json apps/smoker/package.json
COPY packages/TemperatureChart/package.json packages/TemperatureChart/package.json
# Drop the husky `prepare` hook (devDependency binary, absent focus here) so
# `npm ci` doesn't exit 127 on the lifecycle script.
RUN npm pkg delete scripts.prepare \
    && npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
# build: compile every app from source. The smoker web bundle bakes in the
# localhost-pointing backend env before webpack runs.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /workspace
COPY apps ./apps
COPY packages ./packages
COPY e2e/docker/smoker.e2e.env apps/smoker/.env.prod
RUN npm run build -w backend \
    && npm run build -w device-service \
    && npm run build -w frontend \
    && npm run build -w smoker

# ---------------------------------------------------------------------------
# backend runtime (NestJS API + websocket gateway)
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS backend
WORKDIR /apps/backend
COPY --from=build /workspace/node_modules /node_modules
COPY --from=build /workspace/apps/backend/package.json ./package.json
COPY --from=build /workspace/apps/backend/dist ./dist
COPY --from=build /workspace/apps/backend/healthcheck.js ./healthcheck.js
ENV NODE_ENV=prod
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --retries=15 --start-period=20s \
    CMD node healthcheck.js
CMD ["node", "dist/main"]

# ---------------------------------------------------------------------------
# device-service runtime (serial/emulator bridge + websocket gateway).
# NODE_ENV=local enables the synthetic temperature emulator (every 500ms).
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS device-service
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /apps/device-service
COPY --from=build /workspace/node_modules /node_modules
COPY --from=build /workspace/apps/device-service/package.json ./package.json
COPY --from=build /workspace/apps/device-service/dist ./dist
ENV NODE_ENV=local
EXPOSE 3003
HEALTHCHECK --interval=10s --timeout=5s --retries=15 --start-period=20s \
    CMD curl -f http://localhost:3003/api/health || exit 1
CMD ["node", "dist/main"]

# ---------------------------------------------------------------------------
# frontend runtime (nginx serving the SPA, proxying /api + /socket.io to the
# backend service on the compose network).
# ---------------------------------------------------------------------------
FROM nginx:alpine AS frontend
COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=15 --start-period=10s \
    CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

# ---------------------------------------------------------------------------
# smoker-build: optionally re-bake the smoker web bundle against per-stack URLs.
#
# The bundle's cloud + device-service URLs are compiled in by dotenv-webpack from
# `apps/smoker/.env.prod` (the static e2e env copied in the `build` stage),
# which assumes the default host ports. A per-PR hermetic stack publishes the
# backend and device-service somewhere else entirely, so the stack runner passes
# the remapped host URLs as build args and this stage rewrites the env file and
# recompiles the bundle before it is served.
#
# With no args supplied — the default e2e stack — the rewrite is skipped
# entirely and the bundle is the one `build` already produced, so the served
# image is unchanged. Keeping this in its own stage also leaves the shared
# `build` stage arg-free, so the backend/frontend/device-service images stay on
# the same cached layers no matter what the smoker is pointed at.
# ---------------------------------------------------------------------------
FROM build AS smoker-build
ARG SMOKER_CLOUD_URL=
ARG SMOKER_CLOUD_URL_API=
ARG SMOKER_DEVICE_URL=
WORKDIR /workspace
RUN set -eu; \
    if [ -z "${SMOKER_CLOUD_URL}${SMOKER_CLOUD_URL_API}${SMOKER_DEVICE_URL}" ]; then exit 0; fi; \
    env_file=apps/smoker/.env.prod; \
    upsert() { \
    [ -n "$2" ] || return 0; \
    if grep -q "^$1=" "$env_file"; then \
    sed -i "s|^$1=.*|$1=$2|" "$env_file"; \
    else printf '%s=%s\n' "$1" "$2" >> "$env_file"; fi; \
    }; \
    upsert REACT_APP_CLOUD_URL "$SMOKER_CLOUD_URL"; \
    upsert REACT_APP_CLOUD_URL_API "$SMOKER_CLOUD_URL_API"; \
    upsert REACT_APP_DEVICE_URL "$SMOKER_DEVICE_URL"; \
    npm run build -w smoker

# ---------------------------------------------------------------------------
# smoker runtime (nginx serving the touchscreen web bundle)
# ---------------------------------------------------------------------------
FROM nginx:alpine AS smoker
COPY --from=smoker-build /workspace/apps/smoker/dist /usr/share/nginx/html
COPY apps/smoker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=15 --start-period=10s \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
