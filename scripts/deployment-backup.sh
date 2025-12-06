#!/bin/bash
# Pre-Deployment Backup Script
# Creates a comprehensive backup of current deployment state before updating
# Usage: ./scripts/deployment-backup.sh

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_BASE_DIR="/opt/smart-smoker/backups/deployments"
BACKUP_DIR="${BACKUP_BASE_DIR}/backup-${TIMESTAMP}"

echo "=========================================="
echo "Pre-Deployment Backup"
echo "Timestamp: ${TIMESTAMP}"
echo "=========================================="

# Create backup directory (persistent location with fallback)
mkdir -p "${BACKUP_DIR}"

echo "Creating pre-deployment backup in: ${BACKUP_DIR}"

# Save current Docker image information
echo "Saving current Docker image information..."
docker images --format "{{.ID}}|{{.Repository}}:{{.Tag}}|{{.CreatedAt}}" | grep "benjr70/smart-smoker" > "${BACKUP_DIR}/image-info.txt" || echo "No images found"

# Save actual image layers for rollback
echo "Saving Docker images..."
IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "benjr70/smart-smoker" || echo "")
if [ -n "$IMAGES" ]; then
    docker save $IMAGES | gzip > "${BACKUP_DIR}/docker-images.tar.gz"
    BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/docker-images.tar.gz" | cut -f1)
    echo "Saved images: $IMAGES (Size: ${BACKUP_SIZE})"
else
    echo "No images to save"
fi

# Save current compose state
echo "Saving Docker Compose state..."
docker compose ps > "${BACKUP_DIR}/compose-state.txt" 2>/dev/null || echo "No containers running"

# Backup docker-compose file
echo "Backing up docker-compose file..."
if [ -f "cloud.docker-compose.yml" ]; then
    cp cloud.docker-compose.yml "${BACKUP_DIR}/cloud.docker-compose.yml.backup"
fi

# Save current environment (if exists)
echo "Saving environment files..."
if [ -f ".env.prod" ]; then
    cp .env.prod "${BACKUP_DIR}/.env.prod.backup"
fi

# Backup MongoDB data directory
echo "Backing up MongoDB data..."
if [ -d "./database" ]; then
    # Create compressed backup of database
    tar -czf "${BACKUP_DIR}/mongodb-data.tar.gz" -C . database/
    BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/mongodb-data.tar.gz" | cut -f1)
    echo "MongoDB backup size: ${BACKUP_SIZE}"
else
    echo "Warning: MongoDB data directory not found at ./database"
fi

# Save current running container information
echo "Saving running container information..."
docker ps --format "{{.ID}} {{.Names}} {{.Image}} {{.Status}}" > "${BACKUP_DIR}/running-containers.txt" || echo "No containers running"

# Save container logs for debugging
echo "Saving container logs..."
for container in backend_cloud frontend_cloud mongo; do
    if docker ps -a --format "{{.Names}}" | grep -q "^${container}$"; then
        docker logs "$container" --tail 100 > "${BACKUP_DIR}/${container}.log" 2>&1 || true
    fi
done

# Create backup manifest
cat > "${BACKUP_DIR}/manifest.txt" << EOF
Backup Timestamp: ${TIMESTAMP}
Backup Location: ${BACKUP_DIR}
Created: $(date)
Hostname: $(hostname)
Docker Version: $(docker version --format '{{.Server.Version}}')
Compose Version: $(docker compose version --short)
EOF

# Record backup location for rollback script (persistent location)
echo "${BACKUP_DIR}" > "${BACKUP_BASE_DIR}/last-deployment-backup.txt"

# Cleanup old backups (keep last 5)
echo "Cleaning up old backups (keeping last 5)..."
cd "${BACKUP_BASE_DIR}"
ls -dt backup-* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

echo "✅ Backup created successfully: ${BACKUP_DIR}"
echo "Backup location saved to: ${BACKUP_BASE_DIR}/last-deployment-backup.txt"
echo ""
echo "Backup contents:"
ls -lh "${BACKUP_DIR}"

exit 0
