  FROM node:16.15.1 

  # WORKDIR /code

  # COPY . /code
  # COPY package.json /code/package.json

  # RUN npm install --legacy-peer-deps

  # WORKDIR /code/apps/backend


  # RUN npm install --legacy-peer-deps
 

  # RUN npm run build

  COPY package*.json ./
  COPY node_modules /node_modules
 
  COPY apps/backend/dist apps/backend/dist
  COPY apps/backend/package.json apps/backend/package.json
  COPY apps/backend/node_modules apps/backend/node_modules

  WORKDIR /apps/backend
  ENV NODE_ENV=prod
  ENV PORT 3001

  CMD ["npm", "run", "start:production"]