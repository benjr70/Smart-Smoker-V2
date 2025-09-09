  FROM node:20-bookworm-slim

  # Install only runtime dependencies for the backend within the image.
  # We intentionally do NOT copy any .env files into the image.
  WORKDIR /apps/backend

  # Copy only the package manifest first for better layer caching
  COPY apps/backend/package.json ./

  # Install production deps; avoid peer dep resolution issues in older packages
  RUN npm install --omit=dev --legacy-peer-deps

  # Copy the compiled application output (built in CI prebuild step)
  COPY apps/backend/dist ./dist

  # Runtime configuration
  ENV NODE_ENV=prod
  ENV PORT=3001

  CMD ["npm", "run", "start:production"]
