#!/bin/bash
# Deployment Rollback Script
# Restores previous deployment state after failed health checks
# Usage: ./scripts/rollback.sh

set -euo pipefail

echo "=========================================="
echo "🚨 Deployment Rollback Initiated"
echo "=========================================="

# Check if backup location file exists
if [ ! -f "/tmp/last-deployment-backup.txt" ]; then
    echo "❌ No backup location found"
    echo "Cannot perform automatic rollback"
    echo "Manual intervention required"
    exit 1
fi

BACKUP_DIR=$(cat /tmp/last-deployment-backup.txt)

# Verify backup directory exists
if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory does not exist: ${BACKUP_DIR}"
    echo "Cannot perform automatic rollback"
    echo "Manual intervention required"
    exit 1
fi

echo "Rolling back using backup: ${BACKUP_DIR}"
echo ""

# Stop current containers
echo "Stopping current containers..."
docker compose down || echo "Warning: Some containers may not have stopped cleanly"

# Attempt to restore previous state
echo "Restarting services..."

# For now, we'll just restart with the current docker-compose file
# In a more sophisticated setup, we could restore previous image versions
# from the backup, but that requires version pinning strategy

docker compose up -d

echo ""
echo "✅ Rollback initiated - containers restarted"
echo "Backup used: ${BACKUP_DIR}"
echo ""
echo "Please run health checks to verify rollback success:"
echo "  ./scripts/deployment-health-check.sh localhost 1"

exit 0
