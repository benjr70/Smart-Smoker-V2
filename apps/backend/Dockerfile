  FROM node:20-bookworm-slim

  # Build context already contains workspace node_modules.
  # We do NOT run npm install inside the image.
  WORKDIR /apps/backend

  # Hoisted workspace dependencies
  COPY node_modules /node_modules

  # App files
  COPY apps/backend/package.json ./package.json
  COPY apps/backend/dist ./dist

  ENV NODE_ENV=prod
  ENV PORT=3001

  CMD ["npm", "run", "start:production"]
