FROM node:16.15.1 

WORKDIR /app

COPY apps/electron-shell/dist app/electron-shell-linux-armv7l/dist
# COPY apps/electron-shell/node_modules /electron-shell-linux-armv7l/node_modules
COPY . /app
COPY apps/electron-shell/package.json app/package.json
# RUN chmod +x ./electron-shell-linux-armv7l
RUN npm install

CMD ["npm", "run", "start:prod"]