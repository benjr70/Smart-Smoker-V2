#!/bin/bash
# Build locally and sync to dev-cloud for testing
# This bypasses network connectivity issues on dev-cloud

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Build & Sync to Dev-Cloud${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check if dependencies are installed
echo -e "${YELLOW}Step 1: Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo "Dependencies not found. Installing..."
    npm install --legacy-peer-deps
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi
echo ""

# Step 2: Build backend
echo -e "${YELLOW}Step 2: Building backend...${NC}"
npm run build -w backend
echo -e "${GREEN}✅ Backend built${NC}"
echo ""

# Step 3: Build frontend
echo -e "${YELLOW}Step 3: Building frontend...${NC}"
npm run build -w frontend
echo -e "${GREEN}✅ Frontend built${NC}"
echo ""

# Step 4: Sync to dev-cloud (including node_modules and dist folders)
echo -e "${YELLOW}Step 4: Syncing to dev-cloud...${NC}"
echo "This will include node_modules and dist folders"
echo ""

DEV_CLOUD_IP="100.106.181.103"
REMOTE_DIR="/root/Smart-Smoker-V2-test"

rsync -avz --progress \
  --exclude='.git' \
  --exclude='database' \
  --exclude='.cache' \
  --exclude='.env*' \
  "./" "root@${DEV_CLOUD_IP}:${REMOTE_DIR}/"

echo ""
echo -e "${GREEN}✅ Sync complete!${NC}"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Next Steps${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "SSH into dev-cloud and run the simplified test:"
echo ""
echo "  ssh root@${DEV_CLOUD_IP}"
echo "  cd ${REMOTE_DIR}"
echo "  bash scripts/test-phase3-story0-simple.sh"
echo ""
