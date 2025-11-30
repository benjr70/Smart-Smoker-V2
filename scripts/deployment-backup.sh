#!/bin/bash
# Pre-Deployment Backup Script
# Creates a backup of current deployment state before updating
# Usage: ./scripts/deployment-backup.sh

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/deployment-backup-${TIMESTAMP}"

echo "=========================================="
echo "Pre-Deployment Backup"
echo "Timestamp: ${TIMESTAMP}"
echo "=========================================="

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "Creating pre-deployment backup in: ${BACKUP_DIR}"

# Save current Docker image tags
echo "Saving current Docker image tags..."
docker images --format "{{.Repository}}:{{.Tag}}" | grep "benjr70/smart-smoker" > "${BACKUP_DIR}/image-tags.txt" || echo "No images found"

# Save current compose state
echo "Saving Docker Compose state..."
docker-compose ps > "${BACKUP_DIR}/compose-state.txt" 2>/dev/null || echo "No containers running"

# Save current environment (if exists)
echo "Saving environment files..."
if [ -f ".env.prod" ]; then
    cp .env.prod "${BACKUP_DIR}/.env.prod.backup"
fi

# Save current running container IDs
echo "Saving running container IDs..."
docker ps --format "{{.ID}} {{.Names}} {{.Image}}" > "${BACKUP_DIR}/running-containers.txt" || echo "No containers running"

# Record backup location for rollback script
echo "${BACKUP_DIR}" > /tmp/last-deployment-backup.txt

echo "✅ Backup created successfully: ${BACKUP_DIR}"
echo "Backup location saved to: /tmp/last-deployment-backup.txt"
echo ""
echo "Backup contents:"
ls -lh "${BACKUP_DIR}"

exit 0
