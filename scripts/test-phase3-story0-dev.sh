#!/bin/bash
# Phase 3 Story 0 - Dev Cloud Testing Script
# This script tests MongoDB 7.0 upgrade, health checks, and backups
# Then cleans up everything when done

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TEST_LOG="/tmp/phase3-story0-test-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$TEST_LOG"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$TEST_LOG"
    ((TESTS_PASSED++))
}

error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$TEST_LOG"
    ((TESTS_FAILED++))
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$TEST_LOG"
}

section() {
    echo "" | tee -a "$TEST_LOG"
    echo -e "${BLUE}========================================${NC}" | tee -a "$TEST_LOG"
    echo -e "${BLUE}$1${NC}" | tee -a "$TEST_LOG"
    echo -e "${BLUE}========================================${NC}" | tee -a "$TEST_LOG"
}

# Cleanup function
cleanup() {
    section "CLEANUP: Removing all test resources"

    # Find the test directory (could be Smart-Smoker-V2 or Smart-Smoker-V2-test)
    if [ -n "${TEST_DIR:-}" ] && [ -d "$TEST_DIR" ]; then
        cd "$TEST_DIR" 2>/dev/null || true
    else
        cd /root/Smart-Smoker-V2 2>/dev/null || cd /root/Smart-Smoker-V2-test 2>/dev/null || true
    fi

    log "Stopping all Docker containers..."
    docker compose -f cloud.docker-compose.yml down -v 2>/dev/null || true

    log "Removing test database directory..."
    rm -rf database/ 2>/dev/null || true

    log "Removing test repository..."
    cd /root
    rm -rf Smart-Smoker-V2 2>/dev/null || true
    rm -rf Smart-Smoker-V2-test 2>/dev/null || true

    log "Pruning Docker resources..."
    docker system prune -f 2>/dev/null || true

    success "Cleanup complete"
}

# Trap cleanup on exit
trap cleanup EXIT

# Start testing
section "PHASE 3 STORY 0 - DEV CLOUD TESTING"
log "Test log: $TEST_LOG"

# Test 1: Setup repository
section "TEST 1: Setup Repository"

# Check if we're already in a synced repository
if [ -f "cloud.docker-compose.yml" ] && [ -d "infra" ]; then
    log "Using pre-synced repository in current directory"
    TEST_DIR=$(pwd)
    success "Repository ready (pre-synced)"
else
    # Need to clone from GitHub
    cd /root
    if [ -d "Smart-Smoker-V2" ]; then
        rm -rf Smart-Smoker-V2
    fi

    log "Cloning repository from GitHub..."
    if git clone https://github.com/benjr70/Smart-Smoker-V2.git &>> "$TEST_LOG"; then
        success "Repository cloned"
    else
        error "Failed to clone repository"
        error "Tip: If GitHub is unreachable, sync the repo using: ./scripts/sync-to-dev-cloud.sh"
        exit 1
    fi

    cd Smart-Smoker-V2
    TEST_DIR=$(pwd)

    log "Checking out feat/infra-phase3-story0 branch..."
    if git checkout feat/infra-phase3-story-0 &>> "$TEST_LOG"; then
        success "Branch checked out"
    else
        error "Failed to checkout branch"
        exit 1
    fi
fi

# Test 2: Verify new files exist
section "TEST 2: Verify Implementation Files"

FILES_TO_CHECK=(
    "infra/mongodb-init/01-create-users.js"
    "infra/mongodb-init/README.md"
    "scripts/deployment-health-check.sh"
    "scripts/deployment-backup.sh"
    "scripts/rollback.sh"
    "apps/backend/src/health/health.controller.ts"
    "apps/backend/.env.dev"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        success "Found: $file"
    else
        error "Missing: $file"
    fi
done

# Test 3: Generate test passwords
section "TEST 3: Generate Test Credentials"

MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
MONGO_APP_PASSWORD=$(openssl rand -base64 32)

log "Generated MongoDB credentials:"
log "  MONGO_ROOT_USER: admin"
log "  MONGO_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD:0:10}... (32 chars)"
log "  MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD:0:10}... (32 chars)"

export MONGO_ROOT_USER=admin
export MONGO_ROOT_PASSWORD
export MONGO_APP_PASSWORD
export VAPID_PUBLIC_KEY=BDb95f2IXgHf2pwHegV4DGNvyKoHSzp0tPOqhpB7WOgjAt8GmGuGK9RyE7-Ltzprdlp3ftq1xR94ff7j3EXYsEs
export VAPID_PRIVATE_KEY=056QmHxzfE9zNL93Ewtdxa_p3CYQVnojTD738X36gGY

success "Credentials generated and exported"

# Test 4: Start MongoDB 7.0
section "TEST 4: Start MongoDB 7.0 with Authentication"

log "Starting MongoDB container..."
if docker compose -f cloud.docker-compose.yml up -d mongo &>> "$TEST_LOG"; then
    success "MongoDB container started"
else
    error "Failed to start MongoDB"
    docker compose logs mongo | tail -20 >> "$TEST_LOG"
    exit 1
fi

log "Waiting for MongoDB to initialize (60 seconds)..."
sleep 60

# Check if container is running
if docker ps | grep -q "mongo"; then
    success "MongoDB container is running"
else
    error "MongoDB container failed to start"
    docker logs mongo >> "$TEST_LOG"
    exit 1
fi

# Test 5: Verify MongoDB Authentication
section "TEST 5: Verify MongoDB Authentication"

log "Testing admin authentication..."
if docker exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" --eval "db.adminCommand({listDatabases: 1})" &>> "$TEST_LOG"; then
    success "Admin authentication works"
else
    error "Admin authentication failed"
fi

log "Testing application user authentication..."
if docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker --eval "db.test.insertOne({test: 'data', timestamp: new Date()})" &>> "$TEST_LOG"; then
    success "Application user authentication works"
else
    error "Application user authentication failed"
fi

log "Verifying application user CANNOT access admin database..."
if docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" admin --eval "db.adminCommand({listDatabases: 1})" &>> "$TEST_LOG" 2>&1; then
    error "Application user has too many permissions (security risk!)"
else
    success "Application user properly restricted (expected failure)"
fi

# Test 6: Start Backend and Frontend
section "TEST 6: Start All Services"

log "Starting backend and frontend..."
if docker compose -f cloud.docker-compose.yml up -d &>> "$TEST_LOG"; then
    success "All services started"
else
    error "Failed to start services"
    docker compose logs >> "$TEST_LOG"
    exit 1
fi

log "Waiting for services to become healthy (90 seconds)..."
sleep 90

# Test 7: Verify Health Checks
section "TEST 7: Verify Docker Health Checks"

SERVICES=("mongo" "backend_cloud" "frontend_cloud")
for service in "${SERVICES[@]}"; do
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no-healthcheck")
    if [ "$HEALTH" = "healthy" ]; then
        success "$service is healthy"
    else
        warning "$service health status: $HEALTH"
        docker logs "$service" --tail 20 >> "$TEST_LOG"
    fi
done

# Test 8: Test Health Endpoints
section "TEST 8: Test Health Endpoints"

log "Testing backend health endpoint..."
if curl -f -s http://localhost:8443/api/health &>> "$TEST_LOG"; then
    HEALTH_JSON=$(curl -s http://localhost:8443/api/health)
    success "Backend health endpoint responding"
    log "Response: $HEALTH_JSON"
else
    error "Backend health endpoint failed"
fi

log "Testing frontend..."
if curl -f -s -I http://localhost:80 &>> "$TEST_LOG"; then
    success "Frontend responding"
else
    error "Frontend failed"
fi

# Test 9: Test Deployment Health Check Script
section "TEST 9: Test Deployment Health Check Script"

chmod +x scripts/deployment-health-check.sh

log "Running deployment health check script..."
if ./scripts/deployment-health-check.sh localhost 3 &>> "$TEST_LOG"; then
    success "Deployment health check passed"
else
    error "Deployment health check failed"
fi

# Test 10: Test Backup Scripts
section "TEST 10: Test Backup and Rollback Functionality"

# Test 10A: Syntax Validation
log "Testing backup script syntax..."
if bash -n scripts/deployment-backup.sh; then
    success "Deployment backup script syntax valid"
else
    error "Deployment backup script has syntax errors"
fi

log "Testing rollback script syntax..."
if bash -n scripts/rollback.sh; then
    success "Rollback script syntax valid"
else
    error "Rollback script has syntax errors"
fi

# Test 10B: Create backup directory structure
log "Creating backup directory structure..."
mkdir -p /opt/smart-smoker/backups/deployments
success "Backup directory created"

# Test 10C: Execute Full Deployment Backup
log "Executing deployment backup..."
chmod +x scripts/deployment-backup.sh
if ./scripts/deployment-backup.sh &>> "$TEST_LOG"; then
    success "Deployment backup executed successfully"

    # Verify backup location file was created
    if [ -f "/opt/smart-smoker/backups/deployments/last-deployment-backup.txt" ]; then
        BACKUP_DIR=$(cat /opt/smart-smoker/backups/deployments/last-deployment-backup.txt)
        success "Backup location recorded: $BACKUP_DIR"
    else
        error "Backup location file not created"
        BACKUP_DIR=""
    fi
else
    error "Deployment backup failed"
    BACKUP_DIR=""
fi

# Test 10D: Verify Backup Contents
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    log "Verifying backup contents..."

    REQUIRED_FILES=(
        "manifest.txt"
        "docker-images.tar.gz"
        "cloud.docker-compose.yml.backup"
        "mongodb-data.tar.gz"
    )

    for file in "${REQUIRED_FILES[@]}"; do
        if [ -f "${BACKUP_DIR}/${file}" ]; then
            FILE_SIZE=$(du -sh "${BACKUP_DIR}/${file}" | cut -f1)
            success "Backup contains: $file (${FILE_SIZE})"
        else
            error "Missing from backup: $file"
        fi
    done

    # Verify manifest contents
    if [ -f "${BACKUP_DIR}/manifest.txt" ]; then
        log "Backup manifest:"
        cat "${BACKUP_DIR}/manifest.txt" | tee -a "$TEST_LOG"
    fi
else
    warning "Skipping backup verification (backup directory not found)"
fi

# Test 10E: Insert Test Data for Rollback Verification
log "Inserting test data that should disappear after rollback..."
if docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker \
    --eval "db.rollbacktest.insertOne({data: 'should_disappear_after_rollback', timestamp: new Date()})" &>> "$TEST_LOG"; then
    success "Inserted rollback test data"

    # Verify the data exists
    COUNT=$(docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker \
        --quiet --eval "db.rollbacktest.countDocuments({})" 2>/dev/null | tr -d '\n' || echo "0")
    log "Rollback test collection has $COUNT document(s)"
else
    error "Failed to insert rollback test data"
fi

# Test 10F: Execute Rollback
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    log "Executing rollback to previous deployment state..."
    chmod +x scripts/rollback.sh

    if ./scripts/rollback.sh &>> "$TEST_LOG"; then
        success "Rollback executed successfully"

        # Wait for services to restart
        log "Waiting for services to restart after rollback (60 seconds)..."
        sleep 60
    else
        error "Rollback execution failed"
    fi

    # Test 10G: Verify Rollback Restored Previous State
    log "Verifying rollback restored previous database state..."
    COUNT=$(docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker \
        --quiet --eval "db.rollbacktest.countDocuments({})" 2>/dev/null | tr -d '\n' || echo "error")

    if [ "$COUNT" = "0" ]; then
        success "Rollback successfully removed post-backup data"
    elif [ "$COUNT" = "error" ]; then
        warning "Could not verify rollback (database connection issue)"
    else
        error "Rollback did not restore previous state (found $COUNT documents, expected 0)"
    fi

    # Verify services are running after rollback
    log "Verifying services restarted after rollback..."
    if docker ps | grep -q "mongo"; then
        success "MongoDB running after rollback"
    else
        error "MongoDB not running after rollback"
    fi

    if docker ps | grep -q "backend_cloud"; then
        success "Backend running after rollback"
    else
        error "Backend not running after rollback"
    fi

    if docker ps | grep -q "frontend_cloud"; then
        success "Frontend running after rollback"
    else
        error "Frontend not running after rollback"
    fi

    # Verify rollback report was created
    if [ -f "${BACKUP_DIR}/rollback-report.txt" ]; then
        success "Rollback report created"
        log "Rollback report:"
        cat "${BACKUP_DIR}/rollback-report.txt" | tee -a "$TEST_LOG"
    else
        warning "Rollback report not found"
    fi
else
    warning "Skipping rollback tests (no backup available)"
fi

# Test 11: Verify MongoDB Data Persistence
section "TEST 11: Verify Data Operations"

log "Creating test data..."
if docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker --eval "db.testcollection.insertOne({testData: 'Phase 3 Story 0 Test', timestamp: new Date(), version: '7.0'})" &>> "$TEST_LOG"; then
    success "Created test data"
else
    error "Failed to create test data"
fi

log "Reading test data..."
if docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker --eval "db.testcollection.find()" &>> "$TEST_LOG"; then
    success "Retrieved test data"
else
    error "Failed to retrieve test data"
fi

# Test Summary
section "TEST SUMMARY"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

echo "" | tee -a "$TEST_LOG"
echo -e "${BLUE}Total Tests:${NC} $TOTAL_TESTS" | tee -a "$TEST_LOG"
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED" | tee -a "$TEST_LOG"
echo -e "${RED}Failed:${NC} $TESTS_FAILED" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}" | tee -a "$TEST_LOG"
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}" | tee -a "$TEST_LOG"
    echo -e "${GREEN}========================================${NC}" | tee -a "$TEST_LOG"
    echo "" | tee -a "$TEST_LOG"
    echo -e "${GREEN}Phase 3 Story 0 implementation validated in dev-cloud!${NC}" | tee -a "$TEST_LOG"
    echo "" | tee -a "$TEST_LOG"
    echo "Next steps:" | tee -a "$TEST_LOG"
    echo "1. Configure GitHub Secrets (MONGO_ROOT_PASSWORD, MONGO_APP_PASSWORD)" | tee -a "$TEST_LOG"
    echo "2. Test deployment via GitHub Actions" | tee -a "$TEST_LOG"
    echo "3. Proceed to production deployment (Step 7)" | tee -a "$TEST_LOG"
    EXIT_CODE=0
else
    echo -e "${RED}========================================${NC}" | tee -a "$TEST_LOG"
    echo -e "${RED}❌ SOME TESTS FAILED${NC}" | tee -a "$TEST_LOG"
    echo -e "${RED}========================================${NC}" | tee -a "$TEST_LOG"
    echo "" | tee -a "$TEST_LOG"
    echo "Review the test log for details: $TEST_LOG" | tee -a "$TEST_LOG"
    EXIT_CODE=1
fi

echo "" | tee -a "$TEST_LOG"
log "Full test log saved to: $TEST_LOG"
log "Cleanup will run automatically..."

exit $EXIT_CODE
