
  FROM node:16.15.1
  RUN apt-get update --no-install-recommends && apt-get install network-manager -y


  WORKDIR /code
  ENV PORT 3001
  COPY . /code
  COPY package.json /code/package.json

  RUN npm install --legacy-peer-deps

  WORKDIR /code/apps/device-service

  # RUN npm install --legacy-peer-deps
 
  RUN npm run build


  CMD ["npm", "run", "start:prod"]

# this one worked
  # sudo docker run --privileged  --device=/dev/ttyUSB0 -p 3000:3000 --net host -it --volume /:/host -v /var/run/dbus:/var/run/dbus  benjr70/smart_smoker:device-serviceTest

