#!/bin/bash
# Deployment Rollback Script
# Restores previous deployment state after failed health checks
# Usage: ./scripts/rollback.sh
# Environment: COMPOSE_FILE (default: cloud.docker-compose.yml)

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-cloud.docker-compose.yml}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo -e "${RED}🚨 Deployment Rollback Initiated${NC}"
echo "=========================================="

BACKUP_BASE_DIR="/opt/smart-smoker/backups/deployments"
BACKUP_LOCATION_FILE="${BACKUP_BASE_DIR}/last-deployment-backup.txt"

# Check if backup location file exists
if [ ! -f "$BACKUP_LOCATION_FILE" ]; then
    echo -e "${RED}❌ No backup location found at: ${BACKUP_LOCATION_FILE}${NC}"
    echo "Cannot perform automatic rollback"
    echo "Manual intervention required"
    exit 1
fi

BACKUP_DIR=$(cat "$BACKUP_LOCATION_FILE")

# Verify backup directory exists
if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}❌ Backup directory does not exist: ${BACKUP_DIR}${NC}"
    echo "Cannot perform automatic rollback"
    echo "Manual intervention required"
    exit 1
fi

echo -e "${YELLOW}Rolling back using backup: ${BACKUP_DIR}${NC}"
echo ""

# Verify backup contents
echo "Verifying backup contents..."
if [ ! -f "${BACKUP_DIR}/manifest.txt" ]; then
    echo -e "${RED}⚠️  Warning: Backup manifest not found${NC}"
else
    echo "Backup manifest:"
    cat "${BACKUP_DIR}/manifest.txt"
    echo ""
fi

# Stop current containers (preserve volumes for data safety)
echo "Stopping current containers..."
if docker compose -f "$COMPOSE_FILE" down; then
    echo -e "${GREEN}✅ Containers stopped${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: Some containers may not have stopped cleanly${NC}"
fi

# Restore Docker images
echo "Restoring Docker images..."
if [ -f "${BACKUP_DIR}/docker-images.tar.gz" ]; then
    if gunzip -c "${BACKUP_DIR}/docker-images.tar.gz" | docker load; then
        echo -e "${GREEN}✅ Docker images restored${NC}"
    else
        echo -e "${RED}❌ Failed to restore Docker images${NC}"
        echo "Continuing with existing images..."
    fi
else
    echo -e "${YELLOW}⚠️  No Docker images backup found, using current images${NC}"
fi

# Restore docker-compose file
echo "Restoring docker-compose file..."
if [ -f "${BACKUP_DIR}/${COMPOSE_FILE}.backup" ]; then
    cp "${BACKUP_DIR}/${COMPOSE_FILE}.backup" "$COMPOSE_FILE"
    echo -e "${GREEN}✅ Docker Compose file restored${NC}"
else
    echo -e "${YELLOW}⚠️  No docker-compose backup found, using current file${NC}"
fi

# Restore MongoDB data
echo "Restoring MongoDB data..."
if [ -f "${BACKUP_DIR}/mongodb-data.tar.gz" ]; then
    # Remove current database directory
    if [ -d "./database" ]; then
        echo "Backing up current database to ./database.failed-deployment..."
        mv ./database ./database.failed-deployment
    fi

    # Extract backup
    if tar -xzf "${BACKUP_DIR}/mongodb-data.tar.gz" -C .; then
        echo -e "${GREEN}✅ MongoDB data restored${NC}"
    else
        echo -e "${RED}❌ Failed to restore MongoDB data${NC}"
        # Try to restore the failed deployment database
        if [ -d "./database.failed-deployment" ]; then
            mv ./database.failed-deployment ./database
        fi
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  No MongoDB data backup found${NC}"
fi

# Restore environment file
echo "Restoring environment file..."
if [ -f "${BACKUP_DIR}/.env.prod.backup" ]; then
    cp "${BACKUP_DIR}/.env.prod.backup" .env.prod
    echo -e "${GREEN}✅ Environment file restored${NC}"
else
    echo -e "${YELLOW}⚠️  No environment file backup found${NC}"
fi

# Start services with restored configuration
echo "Starting services with restored configuration..."
if docker compose -f "$COMPOSE_FILE" up -d; then
    echo -e "${GREEN}✅ Services started${NC}"
else
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
fi

# Wait for services to initialize
echo "Waiting for services to initialize (60 seconds)..."
sleep 60

# Create rollback report
ROLLBACK_REPORT="${BACKUP_DIR}/rollback-report.txt"
cat > "$ROLLBACK_REPORT" << EOF
Rollback Report
===============
Rollback Time: $(date)
Backup Used: ${BACKUP_DIR}
Hostname: $(hostname)

Container Status After Rollback:
$(docker ps -a --filter name=mongo --filter name=backend_cloud --filter name=frontend_cloud)

Docker Images:
$(docker images | grep "benjr70/smart-smoker")
EOF

echo ""
echo -e "${GREEN}=========================================="
echo "✅ Rollback Complete"
echo "==========================================${NC}"
echo "Backup used: ${BACKUP_DIR}"
echo "Rollback report: ${ROLLBACK_REPORT}"
echo ""
echo "Next steps:"
echo "1. Run health checks: ./scripts/deployment-health-check.sh localhost 3"
echo "2. Review rollback report: cat ${ROLLBACK_REPORT}"
echo "3. Investigate deployment failure logs in: ${BACKUP_DIR}/"

exit 0
