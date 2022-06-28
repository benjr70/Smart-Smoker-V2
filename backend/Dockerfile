  FROM node:16.15.1 

  WORKDIR /code

  ENV PORT 3001

  COPY package.json /code/package.json

  RUN npm install

  COPY . /code

  CMD ["npm", "start"]