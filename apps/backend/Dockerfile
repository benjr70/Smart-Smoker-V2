  FROM node:16.15.1 

  ENV PORT 3001

  COPY apps/backend/dist /dist
  COPY apps/backend/package.json package.json

  RUN npm i --save @nestjs/config
  CMD ["npm", "run", "start:production"]
  EXPOSE 3001