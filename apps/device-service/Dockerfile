
  FROM node:20-bookworm-slim

  ENV DEBIAN_FRONTEND=noninteractive

  # Install NetworkManager for wifi management (nmcli)
  RUN apt-get update \
      && apt-get install -y --no-install-recommends network-manager \
      && rm -rf /var/lib/apt/lists/*

  WORKDIR /apps/device-service

  # We do NOT run npm install inside the image.
  # Use the app's prebuilt (ARM) node_modules only.
  COPY apps/device-service/node_modules ./node_modules

  COPY apps/device-service/package.json ./package.json
  COPY apps/device-service/dist ./dist

  CMD ["npm", "run", "start:prod"]

  # sudo docker run --privileged --device=/dev/ttyUSB0 -p 3000:3000 --net host -it \
  #   --volume /:/host -v /var/run/dbus:/var/run/dbus \
  #   benjr70/smart-smoker-device-service:device-serviceTest
