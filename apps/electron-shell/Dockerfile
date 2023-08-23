FROM node:16.15.1 

COPY apps/electron-shell/dist /electron-shell-linux-armv7l/dist
# COPY apps/electron-shell/node_modules /electron-shell-linux-armv7l/node_modules
COPY apps/electron-shell/package.json package.json
# RUN chmod +x ./electron-shell-linux-armv7l
 RUN npm install

CMD ["npm", "run", "start:prod"]