# Build context is the repository root.
#
# Stage 1 installs production node_modules INSIDE the image so buildx
# produces the correct binaries for whatever --platform was requested
# (arm/v7 today). Native modules (serialport, node-wifi) are built under
# qemu, NOT cross-compiled — replaces the previous out-of-band
# `Prepare device-service ARMv7 node_modules` prebuild in publish.yml.
#
# Workspaces require root package.json + lockfile + every member's manifest
# for npm to validate the topology, so we copy each before `npm ci`.

FROM node:20-bookworm-slim AS deps

ENV DEBIAN_FRONTEND=noninteractive

# Toolchain for native modules (serialport, node-wifi).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Workspace topology: root manifest + lockfile + every member manifest.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/device-service/package.json apps/device-service/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/smoker/package.json apps/smoker/package.json
COPY packages/TemperatureChart/package.json packages/TemperatureChart/package.json

# Root `prepare` script invokes the husky binary, which lives in
# devDependencies. With --omit=dev the binary is absent and `prepare`
# fails (exit 127). Strip the prepare hook from the copied root manifest
# before install — does not touch the host repo, only the image layer.
# We can't use --ignore-scripts because native bindings (serialport,
# node-wifi) need their build scripts to run under qemu.
RUN npm pkg delete scripts.prepare \
    && npm ci -w device-service --omit=dev --legacy-peer-deps


FROM node:20-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# NetworkManager for wifi management (nmcli).
RUN apt-get update \
    && apt-get install -y --no-install-recommends network-manager \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /apps/device-service

# npm workspaces hoists most modules to the root; bring both layers into
# the runtime image so requires resolve correctly.
COPY --from=deps /workspace/node_modules /node_modules
COPY --from=deps /workspace/apps/device-service/node_modules ./node_modules
COPY apps/device-service/package.json ./package.json
COPY apps/device-service/dist ./dist

CMD ["npm", "run", "start:prod"]
