
  FROM node:20-bookworm-slim

  ENV DEBIAN_FRONTEND=noninteractive

  # Install NetworkManager for wifi management (nmcli)
  RUN apt-get update \
      && apt-get install -y --no-install-recommends network-manager \
      && rm -rf /var/lib/apt/lists/*

  # Prepare runtime
  WORKDIR /apps/device-service

  # Install only production dependencies for the device-service
  COPY apps/device-service/package.json ./
  RUN npm install --omit=dev --legacy-peer-deps

  # Copy compiled output
  COPY apps/device-service/dist ./dist

  CMD ["npm", "run", "start:prod"]

  # sudo docker run --privileged  --device=/dev/ttyUSB0 -p 3000:3000 --net host -it --volume /:/host -v /var/run/dbus:/var/run/dbus  benjr70/smart_smoker:device-serviceTest
