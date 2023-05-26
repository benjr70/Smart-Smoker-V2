  FROM node:16.15.1 

  WORKDIR /code
  
  RUN apt-get update && apt-get install -y wireless-tools wpasupplicant

  ENV PORT 3001
  COPY . /code
  COPY package.json /code/package.json

  RUN npm install --legacy-peer-deps

  WORKDIR /code/apps/device-service

  # RUN npm install --legacy-peer-deps
 

  RUN npm run build

  CMD ["npm", "run", "start:prod"]

  # docker run --privileged  --device=/dev/ttyUSB0 -p 3000:3000 --net host -v /usr/sbin/wpa_cli:wpa_cli  benjr70/smart_smoker:device-serviceTest