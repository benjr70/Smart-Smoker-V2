  FROM node:16.15.1 

  ENV PORT 3000

  COPY apps/frontend/dist /dist
  COPY apps/frontend/package.json package.json

  RUN npm install --global serve
  CMD ["npm", "run", "serve:prod"]
  EXPOSE 3000