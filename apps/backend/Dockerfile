  FROM node:16.15.1 

  WORKDIR /code

  ENV PORT 3001
  COPY . /code
  COPY package.json /code/package.json

  RUN npm install --legacy-peer-deps

  WORKDIR /code/apps/backend

  ENV NODE_ENV=prod

  RUN npm install --legacy-peer-deps
 

  RUN npm run build

  CMD ["npm", "run", "start:production"]