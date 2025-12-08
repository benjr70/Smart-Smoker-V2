# Deployment Automation

## Overview

Deployment automation uses GitHub Actions with self-hosted runners to automate CI/CD pipelines for cloud environments and Raspberry Pi devices.

## Deployment Pipeline

### Pipeline Flow

```
GitHub Repository
├── Feature Branch Push
│   ├── Lint & Test (GitHub Hosted)
│   ├── Build Docker Images (GitHub Hosted)
│   └── Push to Development Registry
│
├── Master Branch Merge
│   ├── Run Full Test Suite (Self-hosted Runner)
│   ├── Build Production Images (Self-hosted Runner)
│   ├── Deploy to Dev Cloud (Proxmox LXC)
│   ├── Integration Tests (Virtual Smoker VM)
│   └── Tag Release Candidate
│
├── Production Release
│   ├── Manual Approval Required
│   ├── Deploy to Production Cloud (Proxmox LXC)
│   ├── Update Raspberry Pi Devices
│   ├── Verify Deployment Health
│   └── Send Notifications
│
└── Rollback Process
    ├── Detect Deployment Issues
    ├── Automatic/Manual Rollback
    ├── Restore Previous Version
    └── Alert Team
```

## GitHub Actions Workflow

### Cloud Deployment Workflow

**File**: `.github/workflows/cloud-deploy.yml`

**Workflow Steps**:

1. **Pre-Deployment Backup**
   ```yaml
   - name: Backup current deployment
     run: |
       sudo mkdir -p /opt/smart-smoker/backups/deployments
       sudo ./scripts/deployment-backup.sh
   ```

2. **URL-Encode MongoDB Password**
   ```yaml
   - name: URL-encode MongoDB password
     run: |
       ENCODED_PASSWORD=$(printf %s "${{ secrets.MONGO_APP_PASSWORD }}" | jq -sRr @uri)
       echo "ENCODED_MONGO_APP_PASSWORD=$ENCODED_PASSWORD" >> $GITHUB_ENV
   ```

3. **Pull Docker Images**
   ```yaml
   - name: docker pull
     env:
       VERSION: ${{ inputs.version }}
       MONGO_ROOT_USER: admin
       MONGO_ROOT_PASSWORD: ${{ secrets.MONGO_ROOT_PASSWORD }}
       MONGO_APP_PASSWORD: ${{ secrets.MONGO_APP_PASSWORD }}
       ENCODED_MONGO_APP_PASSWORD: ${{ env.ENCODED_MONGO_APP_PASSWORD }}
     run: sudo -E docker compose -f cloud.docker-compose.yml pull
   ```

4. **Build Docker Images**
   ```yaml
   - name: docker build
     run: sudo -E docker compose -f cloud.docker-compose.yml build
   ```

5. **Stop Services**
   ```yaml
   - name: docker compose down
     run: sudo -E docker compose -f cloud.docker-compose.yml down
   ```

6. **Restart Tailscale**
   ```yaml
   - name: kill tailscale
     run: sudo systemctl stop tailscaled
   ```

7. **Start Services**
   ```yaml
   - name: docker compose up
     run: sudo -E docker compose -f cloud.docker-compose.yml up -d --force-recreate
   ```

8. **Restart Tailscale**
   ```yaml
   - name: start tailscale
     run: sudo systemctl start tailscaled
   ```

9. **Wait for Startup**
   ```yaml
   - name: Wait for startup
     run: sleep 60
   ```

10. **Health Verification**
    ```yaml
    - name: Verify deployment health
      id: health_check
      run: |
        if ! ./scripts/deployment-health-check.sh localhost 3; then
          echo "Health check failed after 3 retries"
          exit 1
        fi
    ```

11. **Rollback on Failure**
    ```yaml
    - name: Rollback on failure
      if: failure() && steps.health_check.outcome == 'failure'
      run: |
        echo "🚨 Deployment failed health check, initiating rollback..."
        sudo ./scripts/rollback.sh
        sleep 30
        if ./scripts/deployment-health-check.sh localhost 1; then
          echo "✅ Rollback successful, system restored"
        else
          echo "💥 Rollback failed - MANUAL INTERVENTION REQUIRED"
          exit 1
        fi
    ```

12. **Cleanup**
    ```yaml
    - name: docker compose remove old containers
      if: success()
      run: sudo docker system prune -a --volumes --force
    ```

## Deployment Targets

### Development Environment

**Location**: dev-cloud (VMID 104)  
**Trigger**: Auto-deploy on master merge  
**Access**: Tailscale internal access  
**Features**:
- Latest container images
- Integration testing
- Development database

### Production Environment

**Location**: prod-cloud (VMID 106) or Raspberry Pi  
**Trigger**: Manual deployment approval  
**Access**: Tailscale funnel (public access)  
**Features**:
- Tagged stable releases
- Health monitoring
- Automated backups

### Raspberry Pi Devices

**Trigger**: Watchtower auto-updates or manual deployment  
**Features**:
- Standardized container names
- Health monitoring
- Remote management via Tailscale

## CI/CD Improvements

### Standardized Docker Compose

Changed all `docker-compose` → `docker compose` (hyphen vs space) for Docker Compose v2 compatibility.

### Secrets Management

**Before**: Secrets in `run:` commands (risk of logging)  
**After**: Secrets in `env:` blocks (secure)

```yaml
# Secure secrets handling
- name: docker compose up
  env:
    MONGO_APP_PASSWORD: ${{ secrets.MONGO_APP_PASSWORD }}
    ENCODED_MONGO_APP_PASSWORD: ${{ env.ENCODED_MONGO_APP_PASSWORD }}
  run: sudo -E docker compose -f cloud.docker-compose.yml up -d
```

### MongoDB Password URL Encoding

Base64 passwords contain special characters that must be URL-encoded for connection strings:

```yaml
# URL-encode MongoDB password
- name: URL-encode MongoDB password
  run: |
    ENCODED_PASSWORD=$(printf %s "${{ secrets.MONGO_APP_PASSWORD }}" | jq -sRr @uri)
    echo "ENCODED_MONGO_APP_PASSWORD=$ENCODED_PASSWORD" >> $GITHUB_ENV
```

## Self-Hosted Runner

### Runner Configuration

**Location**: GitHub runner (VMID 105)  
**Resources**: 2 CPU cores, 4GB RAM, 50GB storage  
**Features**:
- GitHub Actions runner service
- Terraform with Proxmox provider
- Docker CLI for deployments
- Tailscale client
- Node.js/npm for builds

### Runner Setup

See [Ansible Configuration](../configuration/ansible.md) for runner setup procedures.

## Deployment Safety

### Pre-Deployment Backup

Always creates backup before deployment changes.

### Health Verification

Verifies deployment succeeded with retries.

### Automated Rollback

Automatically rolls back on health check failure.

See [Rollback](rollback.md) for details.

## Manual Deployment

### Deploy to Dev-Cloud

```bash
# Sync code to dev-cloud
./scripts/sync-to-dev-cloud.sh

# SSH to dev-cloud
ssh root@smoker-dev-cloud

# Navigate to deployment directory
cd /opt/smart-smoker-dev

# Pull latest code
git fetch origin
git checkout master
git pull origin master

# Deploy
docker compose -f cloud.docker-compose.yml pull
docker compose -f cloud.docker-compose.yml up -d --force-recreate

# Verify
./scripts/deployment-health-check.sh localhost 3
```

### Deploy to Production

```bash
# On production server
cd /opt/smart-smoker-prod

# Pull latest code
git fetch origin
git checkout <tag-or-branch>
git pull origin <tag-or-branch>

# Deploy (with backup)
./scripts/deployment-backup.sh
docker compose -f cloud.docker-compose.yml pull
docker compose -f cloud.docker-compose.yml up -d --force-recreate

# Verify
./scripts/deployment-health-check.sh localhost 3
```

## Troubleshooting

### Deployment Fails

**Symptoms**: Workflow fails during deployment

**Solution**:
```bash
# Check workflow logs in GitHub Actions
# Verify secrets are configured
# Check runner connectivity
# Review deployment logs on server
```

### Health Checks Fail

**Symptoms**: Deployment succeeds but health checks fail

**Solution**:
```bash
# Check service logs
docker logs backend_cloud --tail 50
docker logs mongo --tail 50

# Verify health endpoints
curl http://localhost:8443/api/health

# Check container health
docker ps --filter health=unhealthy
```

### Rollback Issues

**Symptoms**: Rollback fails or doesn't trigger

**Solution**:
```bash
# Verify backup exists
ls -la /opt/smart-smoker/backups/deployments/

# Check backup location file
cat /opt/smart-smoker/backups/deployments/last-deployment-backup.txt

# Manual rollback if needed
sudo ./scripts/rollback.sh
```

## Related Documentation

- [Health Checks](health-checks.md) - Health verification procedures
- [Rollback](rollback.md) - Rollback procedures
- [Environments](environments.md) - Environment configuration
- [Secrets Management](../security/secrets-management.md) - GitHub Secrets setup

---

**Last Updated**: 2025-12-07



