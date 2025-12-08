#!/bin/bash
# Manual Phase 3 Story 0 Testing - Step by Step
# Run each section manually and verify results

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 3 Story 0 - Manual Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "This script will guide you through testing Phase 3 Story 0"
echo "Press ENTER after each step to continue..."
echo ""

# Step 1: Generate passwords
echo -e "${YELLOW}STEP 1: Generate Test Credentials${NC}"
echo "Generate MongoDB passwords:"
echo ""
MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
MONGO_APP_PASSWORD=$(openssl rand -base64 32)

echo "export MONGO_ROOT_USER=admin"
echo "export MONGO_ROOT_PASSWORD='${MONGO_ROOT_PASSWORD}'"
echo "export MONGO_APP_PASSWORD='${MONGO_APP_PASSWORD}'"

# URL-encode the app password for MongoDB connection string
ENCODED_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)
echo "export ENCODED_MONGO_APP_PASSWORD='${ENCODED_APP_PASSWORD}'"

echo ""
echo "Copy and paste the above export commands to set environment variables"
read -p "Press ENTER when done..."

# Step 2: Create .env file
echo ""
echo -e "${YELLOW}STEP 2: Create .env file${NC}"
cat > .env << EOF
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
MONGO_APP_PASSWORD=${MONGO_APP_PASSWORD}
ENCODED_MONGO_APP_PASSWORD=${ENCODED_APP_PASSWORD}
VAPID_PUBLIC_KEY=test-public-key
VAPID_PRIVATE_KEY=test-private-key
EOF
echo -e "${GREEN}✅ Created .env file${NC}"
read -p "Press ENTER to continue..."

# Step 3: Install dependencies
echo ""
echo -e "${YELLOW}STEP 3: Install Dependencies${NC}"
echo "Running: npm install --legacy-peer-deps"
echo "This may take a few minutes on first run..."
npm install --legacy-peer-deps
echo -e "${GREEN}✅ Dependencies installed${NC}"
read -p "Press ENTER to continue..."

# Step 4: Build Backend
echo ""
echo -e "${YELLOW}STEP 4: Build Backend Application${NC}"
echo "Running: npm run build -w backend"
npm run build -w backend
echo -e "${GREEN}✅ Backend built${NC}"
read -p "Press ENTER to continue..."

# Step 5: Build Frontend
echo ""
echo -e "${YELLOW}STEP 5: Build Frontend Application${NC}"
echo "Running: npm run build -w frontend"
npm run build -w frontend
echo -e "${GREEN}✅ Frontend built${NC}"
read -p "Press ENTER to continue..."

# Step 6: Build Docker images
echo ""
echo -e "${YELLOW}STEP 6: Build Docker Images${NC}"
echo "Running: docker compose -f cloud.docker-compose.dev.yml build"
docker compose -f cloud.docker-compose.dev.yml build
echo -e "${GREEN}✅ Docker images built${NC}"
read -p "Press ENTER to continue..."

# Step 7: Start MongoDB only
echo ""
echo -e "${YELLOW}STEP 7: Start MongoDB 7.0${NC}"
echo "Running: docker compose -f cloud.docker-compose.dev.yml up -d mongo"
docker compose -f cloud.docker-compose.dev.yml up -d mongo
echo ""
echo "Waiting 30 seconds for MongoDB to initialize..."
sleep 30
echo -e "${GREEN}✅ MongoDB started${NC}"
read -p "Press ENTER to continue..."

# Step 8: Check MongoDB health
echo ""
echo -e "${YELLOW}STEP 8: Check MongoDB Health${NC}"
echo "Running: docker compose -f cloud.docker-compose.dev.yml ps"
docker compose -f cloud.docker-compose.dev.yml ps
echo ""
echo "Check that mongo service shows as 'healthy'"
read -p "Press ENTER to continue..."

# Step 9: Test MongoDB authentication
echo ""
echo -e "${YELLOW}STEP 9: Test MongoDB Authentication${NC}"
echo "Testing admin user..."
docker compose -f cloud.docker-compose.dev.yml exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" --authenticationDatabase admin --eval "db.adminCommand('ping')"
echo ""
echo "Testing application user..."
docker compose -f cloud.docker-compose.dev.yml exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" --authenticationDatabase admin smartsmoker --eval "db.runCommand({ping: 1})"
echo -e "${GREEN}✅ Authentication working${NC}"
read -p "Press ENTER to continue..."

# Step 10: Start all services
echo ""
echo -e "${YELLOW}STEP 10: Start All Services${NC}"
echo "Running: docker compose -f cloud.docker-compose.dev.yml up -d"
docker compose -f cloud.docker-compose.dev.yml up -d
echo ""
echo "Waiting 60 seconds for services to start..."
sleep 60
echo -e "${GREEN}✅ All services started${NC}"
read -p "Press ENTER to continue..."

# Step 11: Check all services
echo ""
echo -e "${YELLOW}STEP 11: Check All Services Health${NC}"
docker compose -f cloud.docker-compose.dev.yml ps
echo ""
echo "All services should show as 'healthy'"
read -p "Press ENTER to continue..."

# Step 12: Test health endpoint
echo ""
echo -e "${YELLOW}STEP 12: Test Backend Health Endpoint${NC}"
echo "Testing: curl http://localhost:3001/api/health"
curl -s http://localhost:3001/api/health | jq .
echo ""
echo -e "${GREEN}✅ Health endpoint working${NC}"
read -p "Press ENTER to continue..."

# Step 13: Run deployment health check
echo ""
echo -e "${YELLOW}STEP 13: Test Deployment Health Check Script${NC}"
echo "Running: ./scripts/deployment-health-check.sh localhost 3"
./scripts/deployment-health-check.sh localhost 3
echo -e "${GREEN}✅ Deployment health check passed${NC}"
read -p "Press ENTER to continue..."

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Phase 3 Story 0 verification complete!"
echo ""
echo "Next steps:"
echo "1. Save the passwords for GitHub Secrets:"
echo "   MONGO_ROOT_PASSWORD='${MONGO_ROOT_PASSWORD}'"
echo "   MONGO_APP_PASSWORD='${MONGO_APP_PASSWORD}'"
echo ""
echo "2. Clean up (when ready):"
echo "   docker compose -f cloud.docker-compose.dev.yml down -v"
echo "   rm -rf database/"
echo ""
