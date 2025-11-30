FROM node:20-bookworm-slim

# Build context is the repository root
# We do NOT run npm install inside the image - use workspace node_modules
WORKDIR /apps/backend

# Hoisted workspace dependencies from root
COPY node_modules /node_modules

# App files
COPY apps/backend/package.json ./package.json
COPY apps/backend/dist ./dist
COPY apps/backend/healthcheck.js ./healthcheck.js

ENV NODE_ENV=prod
ENV PORT=3001

CMD ["npm", "run", "start:production"]
