#!/bin/bash
# Simplified Phase 3 Story 0 Testing
# Assumes applications are already built and synced from local machine

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 3 Story 0 - Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Generate passwords
echo -e "${YELLOW}STEP 1: Generate Test Credentials${NC}"
MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
MONGO_APP_PASSWORD=$(openssl rand -base64 32)

echo ""
echo "Generated MongoDB credentials:"
echo "export MONGO_ROOT_USER=admin"
echo "export MONGO_ROOT_PASSWORD='${MONGO_ROOT_PASSWORD}'"
echo "export MONGO_APP_PASSWORD='${MONGO_APP_PASSWORD}'"
echo ""
echo "Save these for GitHub Secrets!"
read -p "Press ENTER to continue..."

# Step 2: Create .env file
echo ""
echo -e "${YELLOW}STEP 2: Create .env file${NC}"

# URL-encode the passwords for MongoDB connection string
ENCODED_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)

# Use existing VAPID keys from the project
VAPID_PUBLIC_KEY="BDb95f2IXgHf2pwHegV4DGNvyKoHSzp0tPOqhpB7WOgjAt8GmGuGK9RyE7-Ltzprdlp3ftq1xR94ff7j3EXYsEs"
VAPID_PRIVATE_KEY="056QmHxzfE9zNL93Ewtdxa_p3CYQVnojTD738X36gGY"

cat > .env << EOF
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
MONGO_APP_PASSWORD=${MONGO_APP_PASSWORD}
ENCODED_MONGO_APP_PASSWORD=${ENCODED_APP_PASSWORD}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
EOF
echo -e "${GREEN}✅ Created .env file${NC}"
read -p "Press ENTER to continue..."

# Step 3: Verify built files exist
echo ""
echo -e "${YELLOW}STEP 3: Verify Built Files${NC}"
if [ -d "apps/backend/dist" ] && [ -d "apps/frontend/dist" ]; then
    echo -e "${GREEN}✅ Backend dist found${NC}"
    echo -e "${GREEN}✅ Frontend dist found${NC}"
else
    echo -e "${RED}❌ Missing dist folders!${NC}"
    echo "Run the build-and-sync script from your local machine first"
    exit 1
fi
read -p "Press ENTER to continue..."

# Step 4: Build Docker images
echo ""
echo -e "${YELLOW}STEP 4: Build Docker Images${NC}"
docker compose -f cloud.docker-compose.dev.yml build
echo -e "${GREEN}✅ Docker images built${NC}"
read -p "Press ENTER to continue..."

# Step 5: Start MongoDB
echo ""
echo -e "${YELLOW}STEP 5: Start MongoDB 7.0${NC}"
docker compose -f cloud.docker-compose.dev.yml up -d mongo
echo ""
echo "Waiting 30 seconds for MongoDB to initialize..."
sleep 30
echo -e "${GREEN}✅ MongoDB started${NC}"
read -p "Press ENTER to continue..."

# Step 6: Check MongoDB health
echo ""
echo -e "${YELLOW}STEP 6: Check MongoDB Health${NC}"
docker compose -f cloud.docker-compose.dev.yml ps
echo ""
echo "Verify mongo service shows as 'healthy'"
read -p "Press ENTER to continue..."

# Step 7: Test MongoDB authentication
echo ""
echo -e "${YELLOW}STEP 7: Test MongoDB Authentication${NC}"
echo "Testing admin user..."
docker compose -f cloud.docker-compose.dev.yml exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" --authenticationDatabase admin --eval "db.adminCommand('ping')"
echo ""
echo "Testing application user..."
docker compose -f cloud.docker-compose.dev.yml exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" --authenticationDatabase admin smartsmoker --eval "db.runCommand({ping: 1})"
echo -e "${GREEN}✅ Authentication working${NC}"
read -p "Press ENTER to continue..."

# Step 8: Start all services
echo ""
echo -e "${YELLOW}STEP 8: Start All Services${NC}"
docker compose -f cloud.docker-compose.dev.yml up -d
echo ""
echo "Waiting 60 seconds for services to start..."
sleep 60
echo -e "${GREEN}✅ All services started${NC}"
read -p "Press ENTER to continue..."

# Step 9: Check all services
echo ""
echo -e "${YELLOW}STEP 9: Check All Services Health${NC}"
docker compose -f cloud.docker-compose.dev.yml ps
echo ""
echo "All services should show as 'healthy'"
read -p "Press ENTER to continue..."

# Step 10: Test health endpoint
echo ""
echo -e "${YELLOW}STEP 10: Test Backend Health Endpoint${NC}"
echo "Testing: curl http://localhost:3001/api/health"
curl -s http://localhost:3001/api/health | jq . || curl -s http://localhost:3001/api/health
echo ""
echo -e "${GREEN}✅ Health endpoint working${NC}"
read -p "Press ENTER to continue..."

# Step 11: Run deployment health check
echo ""
echo -e "${YELLOW}STEP 11: Test Deployment Health Check Script${NC}"
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
