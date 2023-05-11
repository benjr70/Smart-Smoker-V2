  FROM node:16.15.1 

  ENV PORT 8080

  COPY apps/smoker/dist /dist
  COPY apps/smoker/package.json package.json

  RUN npm install --global serve
  CMD ["npm", "run", "serve:prod"]
  EXPOSE 8080