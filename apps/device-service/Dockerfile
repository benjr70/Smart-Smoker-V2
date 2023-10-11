
  FROM node:16.15.1
  RUN apt-get update --no-install-recommends && apt-get install network-manager -y

  COPY package*.json ./
  COPY node_modules /node_modules
 
  COPY apps/device-service/dist apps/device-service/dist
  COPY apps/device-service/package.json apps/device-service/package.json
  COPY apps/device-service/node_modules apps/device-service/node_modules

  WORKDIR /apps/device-service

  CMD ["npm", "run", "start:prod"]

  # sudo docker run --privileged  --device=/dev/ttyUSB0 -p 3000:3000 --net host -it --volume /:/host -v /var/run/dbus:/var/run/dbus  benjr70/smart_smoker:device-serviceTest

