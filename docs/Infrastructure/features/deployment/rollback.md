# Deployment Rollback

## Overview

The deployment rollback system provides automated recovery from failed deployments. It uses a three-layer safety net: pre-deployment backup, health verification, and automated rollback.

## Safety Mechanisms

### 1. Pre-Deployment Backup

Before any deployment, the current state is backed up:

**Script**: `scripts/deployment-backup.sh`

**What Gets Backed Up**:
- Docker images (docker save)
- Docker Compose file
- MongoDB data directory
- Container logs
- Environment files
- Manifest with metadata

**Backup Location**: `/opt/smart-smoker/backups/deployments/backup-YYYYMMDD-HHMMSS/`

### 2. Health Verification

After deployment, health checks verify the deployment succeeded:

**Script**: `scripts/deployment-health-check.sh`

**Verifies**:
1. Backend `/api/health` endpoint responding
2. Frontend HTTP 200 response
3. All Docker containers healthy
4. Disk usage < 90%

**Retries**: 3 attempts with 10s delay  
**Exit Codes**: 0 = success, 1 = failure

### 3. Automated Rollback

If health checks fail, automatic rollback restores the previous state:

**Script**: `scripts/rollback.sh`

**Restores**:
1. Stop all containers
2. Restore Docker images (docker load)
3. Restore Docker Compose file
4. Restore MongoDB data
5. Restart services
6. Generate rollback report

## Usage

### Manual Rollback

```bash
# Execute rollback script
sudo /opt/smart-smoker-prod/scripts/rollback.sh

# Verify rollback success
sleep 30
sudo /opt/smart-smoker-prod/scripts/deployment-health-check.sh localhost 1
```

### Automated Rollback (GitHub Actions)

Rollback is automatically triggered on deployment failure:

```yaml
# Pre-deployment backup
- name: Create pre-deployment backup
  run: sudo /opt/smart-smoker-prod/scripts/deployment-backup.sh

# Deployment
- name: docker compose up
  run: sudo -E docker compose -f cloud.docker-compose.yml up -d

# Health verification (3 retries, 10s delay)
- name: Health check
  run: sudo /opt/smart-smoker-prod/scripts/deployment-health-check.sh smoker-cloud-prod 3

# Automatic rollback on failure
- name: Rollback on failure
  if: failure() && steps.health_check.outcome == 'failure'
  run: |
    echo "🚨 Deployment failed health check, initiating rollback..."
    sudo /opt/smart-smoker-prod/scripts/rollback.sh

    # Verify rollback success
    sleep 30
    if sudo /opt/smart-smoker-prod/scripts/deployment-health-check.sh localhost 1; then
      echo "✅ Rollback successful, system restored"
    else
      echo "💥 Rollback failed - MANUAL INTERVENTION REQUIRED"
      exit 1
    fi
```

## Rollback Process

### Step 1: Locate Backup

The rollback script reads the backup location from:
```
/opt/smart-smoker/backups/deployments/last-deployment-backup.txt
```

This file contains the path to the most recent deployment backup.

### Step 2: Verify Backup

```bash
# Check backup directory exists
ls -la /opt/smart-smoker/backups/deployments/backup-YYYYMMDD-HHMMSS/

# Verify backup contents
cat /opt/smart-smoker/backups/deployments/backup-YYYYMMDD-HHMMSS/manifest.txt
```

### Step 3: Stop Services

```bash
# Stop all containers (preserves volumes for data safety)
docker compose -f cloud.docker-compose.yml down
```

### Step 4: Restore Images

```bash
# Restore Docker images from backup
gunzip -c backup-YYYYMMDD-HHMMSS/docker-images.tar.gz | docker load
```

### Step 5: Restore Configuration

```bash
# Restore Docker Compose file
cp backup-YYYYMMDD-HHMMSS/cloud.docker-compose.yml.backup cloud.docker-compose.yml

# Restore environment files if needed
cp backup-YYYYMMDD-HHMMSS/.env.prod.backup .env.prod
```

### Step 6: Restore Data

```bash
# Restore MongoDB data
tar -xzf backup-YYYYMMDD-HHMMSS/mongodb-data.tar.gz
```

### Step 7: Restart Services

```bash
# Start services with restored configuration
docker compose -f cloud.docker-compose.yml up -d
```

### Step 8: Verify Rollback

```bash
# Run health checks
./scripts/deployment-health-check.sh localhost 3

# Check service logs
docker logs backend_cloud --tail 50
docker logs mongo --tail 50
```

## Backup Contents

### Backup Directory Structure

```
/opt/smart-smoker/backups/deployments/backup-YYYYMMDD-HHMMSS/
├── manifest.txt                    # Backup metadata
├── docker-images.tar.gz            # Docker images backup
├── cloud.docker-compose.yml.backup # Docker Compose file
├── mongodb-data.tar.gz             # MongoDB data backup
├── image-info.txt                  # Image information
├── compose-state.txt               # Container state
├── running-containers.txt          # Running containers info
├── backend_cloud.log               # Backend logs
├── frontend_cloud.log              # Frontend logs
└── mongo.log                       # MongoDB logs
```

### Manifest File

The manifest contains backup metadata:

```
Backup Timestamp: 20251207-143000
Backup Location: /opt/smart-smoker/backups/deployments/backup-20251207-143000
Docker Images: benjr70/smart-smoker-backend:latest, benjr70/smart-smoker-frontend:latest
MongoDB Data: ./database
Compose File: cloud.docker-compose.yml
```

## Rollback Scenarios

### Scenario 1: Failed Health Check

**Trigger**: Health checks fail after deployment

**Process**:
1. Health check script exits with code 1
2. GitHub Actions workflow detects failure
3. Rollback script executes automatically
4. System restored to previous state
5. Rollback report generated

### Scenario 2: Manual Rollback

**Trigger**: Manual intervention needed

**Process**:
1. Identify backup to restore
2. Run rollback script manually
3. Verify restoration
4. Investigate deployment issue

### Scenario 3: Partial Rollback

**Trigger**: Only specific services need rollback

**Process**:
1. Stop specific service
2. Restore service-specific data/config
3. Restart service
4. Verify service health

## Benefits

- **Zero Data Loss**: Always backup before changes
- **Fast Recovery**: Automated rollback in < 2 minutes
- **Deployment Confidence**: Health checks prevent bad deployments
- **Audit Trail**: Manifests and reports for every deployment

## Limitations

### Docker Image Backup

**Issue**: `deployment-backup.sh` may create incomplete backups when using locally-built images.

**Impact**: Missing `docker-images.tar.gz` in backup archives.

**Workaround**: Backup still includes MongoDB data and compose file (sufficient for most rollbacks).

**Status**: Investigate in future improvements.

### Rollback Time

**Typical Rollback Duration**: 1-2 minutes

**Factors**:
- Docker image size
- MongoDB data size
- Network speed (if pulling images)

## Troubleshooting

### Rollback Fails

**Symptoms**: Rollback script exits with error

**Solution**:
```bash
# Check backup directory exists
ls -la /opt/smart-smoker/backups/deployments/

# Verify backup location file
cat /opt/smart-smoker/backups/deployments/last-deployment-backup.txt

# Check backup contents
ls -la /opt/smart-smoker/backups/deployments/backup-YYYYMMDD-HHMMSS/

# Manually verify backup integrity
tar -tzf backup-YYYYMMDD-HHMMSS/mongodb-data.tar.gz | head -10
```

### Services Don't Start After Rollback

**Symptoms**: Containers fail to start after rollback

**Solution**:
```bash
# Check container logs
docker logs backend_cloud --tail 50
docker logs mongo --tail 50

# Verify Docker Compose file
docker compose -f cloud.docker-compose.yml config

# Check environment variables
docker compose -f cloud.docker-compose.yml config | grep -i env

# Verify MongoDB data restored
ls -la ./database/
```

### Missing Backup

**Symptoms**: No backup found for rollback

**Solution**:
```bash
# Check if backup was created
ls -la /opt/smart-smoker/backups/deployments/

# Check backup location file
cat /opt/smart-smoker/backups/deployments/last-deployment-backup.txt

# If no backup exists, manual recovery required
# 1. Restore from MongoDB backup (see Backups documentation)
# 2. Restore from Proxmox snapshot
# 3. Rebuild from source code
```

## Best Practices

### Before Deployment

1. **Verify Backup Location**: Ensure backup directory exists and is writable
2. **Check Disk Space**: Ensure sufficient space for backup
3. **Test Rollback**: Periodically test rollback procedure

### During Deployment

1. **Monitor Health Checks**: Watch health check results
2. **Review Logs**: Check deployment logs for issues
3. **Be Ready**: Have rollback plan ready if needed

### After Rollback

1. **Investigate Root Cause**: Determine why deployment failed
2. **Fix Issues**: Address problems before next deployment
3. **Update Documentation**: Document any issues encountered
4. **Test Fixes**: Verify fixes work before next deployment

## Related Documentation

- [Deployment Automation](automation.md) - CI/CD workflows with rollback
- [Health Checks](health-checks.md) - Health verification procedures
- [Backups](../database/backups.md) - Backup system details
- [Disaster Recovery](../operations/disaster-recovery.md) - Recovery procedures

---

**Last Updated**: 2025-12-07  
**Rollback Time**: < 2 minutes



