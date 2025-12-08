#!/bin/bash

# sync-to-dev-cloud.sh
# Transfers the repository to dev-cloud for testing

set -e

DEV_CLOUD_IP="100.106.181.103"
REMOTE_DIR="/root/Smart-Smoker-V2-test"
LOCAL_DIR="/home/benjr70/Dev/Smart-Smoker-V2"

echo "🔄 Syncing repository to dev-cloud..."
echo "📂 Local: $LOCAL_DIR"
echo "📍 Remote: root@${DEV_CLOUD_IP}:${REMOTE_DIR}"

# Create remote directory if it doesn't exist
ssh root@${DEV_CLOUD_IP} "mkdir -p ${REMOTE_DIR}"

# Sync the repository (excluding .git but INCLUDING node_modules and dist for testing)
rsync -avz --progress \
  --exclude='.git' \
  --exclude='.cache' \
  --exclude='database' \
  --exclude='.env*' \
  "${LOCAL_DIR}/" "root@${DEV_CLOUD_IP}:${REMOTE_DIR}/"

echo ""
echo "✅ Repository synced successfully!"
echo ""
echo "To run the test script on dev-cloud:"
echo "  ssh root@${DEV_CLOUD_IP}"
echo "  cd ${REMOTE_DIR}"
echo "  bash scripts/test-phase3-story0-dev.sh"
