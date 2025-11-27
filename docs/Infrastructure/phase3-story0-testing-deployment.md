# Phase 3 Story 0: Testing & Deployment Guide

This guide covers Steps 6-8 from the Phase 3 Story 0 implementation plan:
- Step 6: Testing in dev-cloud environment
- Step 7: Production deployment (Raspberry Pi)
- Step 8: Production backup deployment

## Prerequisites Checklist

Before proceeding, ensure:

- [x] Steps 1-5 completed (MongoDB 7.0 upgrade, backups, health checks)
- [x] Code committed to `feat/infra-phase3-story-0` branch
- [ ] GitHub Secrets configured (see `github-secrets-setup.md`)
- [ ] Access to dev-cloud (VMID 104) via SSH/Tailscale
- [ ] Access to Raspberry Pi production environment
- [ ] Proxmox access for LXC snapshot configuration

---

## STEP 6: Testing in Dev-Cloud Environment

**Duration**: 2-3 hours
**Environment**: dev-cloud (VMID 104) - smoker-dev-cloud
**Goal**: Validate MongoDB 7.0 upgrade, health checks, and rollback mechanisms

### 6.1 Generate MongoDB Passwords

First, generate secure passwords for dev environment:

```bash
# Generate MongoDB root password
MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
echo "MONGO_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}"

# Generate MongoDB app password
MONGO_APP_PASSWORD=$(openssl rand -base64 32)
echo "MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD}"

# Save these temporarily - you'll need them for testing
```

**Important**: Save these passwords in a secure location (password manager).

### 6.2 SSH to Dev-Cloud

```bash
# Via Tailscale
ssh root@smoker-dev-cloud

# OR via direct IP (if on Proxmox network)
ssh root@10.20.0.20
```

### 6.3 Backup Existing Data (Safety First)

```bash
# Navigate to application directory
cd /opt/smart-smoker-dev

# Check if MongoDB is currently running
docker ps | grep mongo

# If MongoDB is running, create a backup
docker exec mongo mongodump --out /data/db/pre-upgrade-backup-$(date +%Y%m%d)

# Verify backup created
ls -lh /data/db/pre-upgrade-backup-*
```

### 6.4 Pull Latest Code

```bash
# Navigate to deployment directory
cd /opt/smart-smoker-dev

# Fetch latest code
git fetch origin

# Checkout the Phase 3 Story 0 branch
git checkout feat/infra-phase3-story-0
git pull origin feat/infra-phase3-story-0
```

### 6.5 Set Environment Variables

```bash
# Create a secure environment file for this deployment
cat > .env.mongo-credentials <<EOF
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
MONGO_APP_PASSWORD=${MONGO_APP_PASSWORD}
EOF

# Set file permissions (owner read-only)
chmod 600 .env.mongo-credentials

# Source the credentials
source .env.mongo-credentials
```

### 6.6 Stop Existing Services

```bash
# Stop current Docker Compose services
docker-compose -f cloud.docker-compose.yml down

# Verify all containers stopped
docker ps | grep -E "mongo|backend|frontend"
# Should return nothing
```

### 6.7 Start MongoDB 7.0 with Authentication

```bash
# Start only MongoDB first to initialize users
MONGO_ROOT_USER=admin \
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD} \
MONGO_APP_PASSWORD=${MONGO_APP_PASSWORD} \
docker-compose -f cloud.docker-compose.yml up -d mongo

# Watch MongoDB logs
docker logs -f mongo
# Look for: "Waiting for connections" and "Successfully authenticated"
# Press Ctrl+C when ready
```

### 6.8 Verify MongoDB Authentication

```bash
# Test admin authentication
docker exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" --eval "db.adminCommand({listDatabases: 1})"
# Should show list of databases

# Test application user authentication
docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker --eval "db.test.insertOne({test: 'data'})"
# Should return: { acknowledged: true, insertedId: ObjectId(...) }

# Verify application user CANNOT access admin database
docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" admin --eval "db.adminCommand({listDatabases: 1})"
# Should fail with authentication error - this is correct!
```

### 6.9 Start Backend and Frontend

```bash
# Start all services
MONGO_ROOT_USER=admin \
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD} \
MONGO_APP_PASSWORD=${MONGO_APP_PASSWORD} \
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY} \
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY} \
docker-compose -f cloud.docker-compose.yml up -d

# Watch all logs
docker-compose -f cloud.docker-compose.yml logs -f --tail=50
# Look for: "Database connected" in backend logs
# Press Ctrl+C when ready
```

### 6.10 Verify Health Checks

```bash
# Check container health status
docker ps --filter health=healthy

# Should show all 3 containers as healthy:
# - mongo
# - backend_cloud
# - frontend_cloud

# Check individual health
docker inspect --format='{{.State.Health.Status}}' mongo
docker inspect --format='{{.State.Health.Status}}' backend_cloud
docker inspect --format='{{.State.Health.Status}}' frontend_cloud

# All should return: "healthy"
```

### 6.11 Test Health Endpoints

```bash
# Test backend health endpoint
curl http://localhost:8443/api/health | jq
# Expected: {"status":"ok","timestamp":"...","database":{"status":"connected",...},...}

# Test frontend
curl -I http://localhost:80
# Expected: HTTP/1.1 200 OK

# Test via Tailscale (external access)
curl https://smoker-dev-cloud.tail74646.ts.net:8443/api/health | jq
```

### 6.12 Test Deployment Health Check Script

```bash
# Run the automated health check script
./scripts/deployment-health-check.sh localhost 3

# Expected output:
# ✅ Backend API is healthy
# ✅ Frontend is healthy
# ✅ All Docker containers are healthy (3/3)
# ✅ Disk usage acceptable
# 🎉 All health checks passed
```

### 6.13 Test Manual Backup

```bash
# Trigger manual MongoDB backup
/opt/smart-smoker-dev/scripts/backup-mongodb.sh

# Verify backup created
ls -lh /opt/smart-smoker-dev/backups/mongodb/

# Check backup symlink
ls -lh /opt/smart-smoker-dev/backups/mongodb/latest
# Should point to most recent backup

# Test backup validation
/opt/smart-smoker-dev/scripts/backup-validation.sh
# Expected: ✅ All validation checks passed
```

### 6.14 Test Rollback Scenario (Optional but Recommended)

```bash
# This simulates a failed deployment

# 1. Create pre-deployment backup
./scripts/deployment-backup.sh

# 2. Intentionally break something (e.g., stop backend)
docker stop backend_cloud

# 3. Run health check (should fail)
./scripts/deployment-health-check.sh localhost 3
# Expected: ❌ Backend API failed health check

# 4. Trigger rollback
./scripts/rollback.sh

# 5. Verify system restored
./scripts/deployment-health-check.sh localhost 1
# Expected: 🎉 All health checks passed
```

### 6.15 Success Criteria

Before proceeding to production, verify:

- [ ] MongoDB 7.0 running and accessible
- [ ] Admin authentication works
- [ ] Application authentication works
- [ ] Backend connects to MongoDB successfully
- [ ] Health checks pass for all services
- [ ] Health endpoints return correct status
- [ ] Manual backup succeeds
- [ ] Backup validation passes
- [ ] Rollback mechanism works
- [ ] No errors in logs for 30+ minutes

---

## STEP 7: Production Deployment (Raspberry Pi)

**Duration**: 2-3 hours
**Environment**: Raspberry Pi (current production)
**CRITICAL**: This deploys to production - schedule maintenance window

### 7.1 Pre-Production Checklist

- [ ] Dev-cloud testing completed successfully (Step 6)
- [ ] Maintenance window scheduled (recommend 2 AM)
- [ ] User notification sent (if applicable)
- [ ] Full backup of current production data
- [ ] Rollback plan reviewed
- [ ] Team member on standby (optional but recommended)

### 7.2 Schedule Maintenance Window

**Recommended**: 2 AM - 5 AM (low traffic period)

**Notification Template:**
```
Smart Smoker Maintenance Notice

Date: [DATE]
Time: 2:00 AM - 5:00 AM [TIMEZONE]
Duration: ~2-3 hours (may complete sooner)

What's happening:
- MongoDB database upgrade (security + performance)
- Automated backup system deployment
- Deployment safety improvements

Impact:
- Service will be unavailable during upgrade
- All existing data will be preserved
- App will automatically reconnect after upgrade

Questions? Contact: [YOUR-EMAIL]
```

### 7.3 Generate Production Passwords

```bash
# Generate strong production passwords (different from dev!)
PROD_MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
PROD_MONGO_APP_PASSWORD=$(openssl rand -base64 32)

# Display passwords (save to password manager immediately!)
echo "Production MongoDB Root Password: ${PROD_MONGO_ROOT_PASSWORD}"
echo "Production MongoDB App Password: ${PROD_MONGO_APP_PASSWORD}"

# Add these to GitHub Secrets:
# 1. Go to GitHub repo → Settings → Secrets and variables → Actions
# 2. Update MONGO_ROOT_PASSWORD with ${PROD_MONGO_ROOT_PASSWORD}
# 3. Update MONGO_APP_PASSWORD with ${PROD_MONGO_APP_PASSWORD}
```

### 7.4 Connect to Raspberry Pi

```bash
# Connect via Tailscale
ssh pi@smokecloud-1

# OR via local network (if on same network)
ssh pi@<raspberry-pi-ip>
```

### 7.5 Pre-Migration Backup (CRITICAL)

```bash
# Navigate to application directory
cd /path/to/smart-smoker  # Adjust path as needed

# Create timestamped backup directory
BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/pre-mongo7-upgrade-${BACKUP_TIMESTAMP}"

# Backup MongoDB data
docker exec mongo mongodump --out "${BACKUP_DIR}"

# Create compressed backup
tar -czf ~/mongodb-backup-${BACKUP_TIMESTAMP}.tar.gz database/

# Copy backup to safe location (e.g., another machine)
# Option 1: Copy to local machine
scp ~/mongodb-backup-${BACKUP_TIMESTAMP}.tar.gz user@your-machine:/backups/

# Option 2: Copy to Proxmox host
scp ~/mongodb-backup-${BACKUP_TIMESTAMP}.tar.gz root@192.168.1.151:/var/backups/smart-smoker/

# Verify backup integrity
tar -tzf ~/mongodb-backup-${BACKUP_TIMESTAMP}.tar.gz | head -20
# Should list backup files
```

### 7.6 Verify Backup (Dry-Run Restore)

```bash
# Test that backup can be restored (doesn't modify database)
mongorestore --dry-run --drop "${BACKUP_DIR}"
# Should complete without errors
```

### 7.7 Execute Production Migration

```bash
# Pull latest code
git fetch origin
git checkout feat/infra-phase3-story-0
git pull origin feat/infra-phase3-story-0

# Stop all services
docker-compose -f cloud.docker-compose.yml down

# Set production environment variables
export MONGO_ROOT_USER=admin
export MONGO_ROOT_PASSWORD="${PROD_MONGO_ROOT_PASSWORD}"
export MONGO_APP_PASSWORD="${PROD_MONGO_APP_PASSWORD}"

# Start MongoDB 7.0 with authentication
docker-compose -f cloud.docker-compose.yml up -d mongo

# Wait for MongoDB initialization (creates users)
sleep 60

# Watch logs
docker logs mongo | tail -50
# Look for: "Waiting for connections"

# Verify authentication
docker exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" --eval "db.adminCommand({listDatabases: 1})"
# Should succeed

# Start backend
docker-compose -f cloud.docker-compose.yml up -d backend

# Wait for backend connection
sleep 30

# Check backend logs
docker logs backend_cloud | grep -i "database connected"
# Should see successful connection

# Start frontend
docker-compose -f cloud.docker-compose.yml up -d frontend

# Wait for all services to stabilize
sleep 30
```

### 7.8 Post-Migration Validation

```bash
# Run health checks
./scripts/deployment-health-check.sh localhost

# Test API
curl http://localhost:8443/api/health | jq

# Test frontend
curl -I http://localhost:80

# Check all container health
docker ps --filter health=healthy
# Should show all 3 containers

# Verify existing data visible
# - Open web UI
# - Login
# - Verify past smoke sessions visible
# - Create test record
# - Verify saves successfully
```

### 7.9 Monitor for Issues

```bash
# Monitor logs for 30-60 minutes
docker-compose -f cloud.docker-compose.yml logs -f --tail=100

# Watch for:
# - No authentication errors
# - No connection failures
# - Normal application behavior
```

### 7.10 Create Post-Migration Backup

```bash
# Create backup of successfully upgraded database
docker exec mongo mongodump \
  --username smartsmoker \
  --password "${MONGO_APP_PASSWORD}" \
  --authenticationDatabase admin \
  --out /data/db/post-migration-$(date +%Y%m%d)

# Verify backup
ls -lh /data/db/post-migration-*
```

### 7.11 Production Rollback Plan (If Needed)

**Only use if migration fails:**

```bash
# 1. Stop all services
docker-compose -f cloud.docker-compose.yml down

# 2. Restore previous code
git checkout <previous-commit-hash>

# 3. Restore MongoDB data (if corrupted)
rm -rf database/*
tar -xzf ~/mongodb-backup-${BACKUP_TIMESTAMP}.tar.gz

# 4. Restart with MongoDB 4.4.14 (previous version)
docker-compose -f cloud.docker-compose.yml up -d

# 5. Verify working
curl http://localhost:8443/api/health
curl http://localhost:80

# 6. Notify users of rollback
# 7. Investigate issue before retrying
```

### 7.12 Success Criteria

- [ ] MongoDB 7.0 running with authentication
- [ ] Backend connects successfully
- [ ] All API endpoints functional
- [ ] Frontend loads correctly
- [ ] Existing data preserved and accessible
- [ ] New data can be created/saved
- [ ] Health checks passing
- [ ] No errors in logs after 24 hours
- [ ] Performance equal or better than before

---

## STEP 8: Deploy Backup System to Production

**Duration**: 1-2 hours
**Prerequisites**: Step 7 complete (MongoDB 7.0 in production)

### 8.1 Deploy Backups Ansible Role to Prod-Cloud

If you're using prod-cloud (VMID 106) instead of Raspberry Pi:

```bash
# On your local machine
cd /home/benjr70/Dev/Smart-Smoker-V2/infra/proxmox/ansible

# Deploy backups role to prod-cloud
ansible-playbook playbooks/setup-prod-cloud.yml \
  --tags backups \
  --extra-vars "mongo_app_password=${PROD_MONGO_APP_PASSWORD}"

# Verify installation
ssh root@smart-smoker-cloud-prod "crontab -l | grep backup"

# Check scripts installed
ssh root@smart-smoker-cloud-prod "ls -la /opt/smart-smoker-prod/scripts/backup-*"
```

### 8.2 Manually Trigger First Backup

```bash
# SSH to prod-cloud
ssh root@smart-smoker-cloud-prod

# Run manual backup
/opt/smart-smoker-prod/scripts/backup-mongodb.sh

# Verify backup created
ls -lh /opt/smart-smoker-prod/backups/mongodb/

# Check backup contents
ls -lh /opt/smart-smoker-prod/backups/mongodb/backup-*
```

### 8.3 Test Restore (Dry-Run Only)

```bash
# Test restore capability without affecting production
docker exec mongo mongorestore \
  --dry-run \
  --username smartsmoker \
  --password "${MONGO_APP_PASSWORD}" \
  --authenticationDatabase admin \
  --drop \
  --gzip \
  /data/db/backups/mongodb/latest

# Should complete successfully
```

### 8.4 Configure Proxmox LXC Snapshots

**On Proxmox Host:**

```bash
# SSH to Proxmox host
ssh root@192.168.1.151

# Configure automated LXC snapshots via UI or vzdump cron

# Option 1: Via Proxmox Web UI
# 1. Navigate to Datacenter → Backup
# 2. Click "Add"
# 3. Configure:
#    - Storage: local (or your backup storage)
#    - Schedule: Daily at 01:00 (1 AM)
#    - Selection: VMID 106 (prod-cloud)
#    - Mode: Snapshot
#    - Compression: ZSTD
#    - Retention:
#      - Keep Daily: 7
#      - Keep Weekly: 4
#      - Keep Monthly: 12

# Option 2: Manual vzdump command (for testing)
vzdump 106 \
  --mode snapshot \
  --storage local \
  --compress zstd \
  --notes-template "Smart Smoker Production Cloud Backup"

# Verify snapshot created
ls -lh /var/lib/vz/dump/ | grep 106
```

### 8.5 Verify Backup Automation

```bash
# Check cron jobs on prod-cloud
ssh root@smart-smoker-cloud-prod "crontab -l"

# Should show:
# - MongoDB daily backup (2 AM)
# - Backup retention cleanup (2:30 AM)
# - Weekly backup validation (Sunday 3 AM)

# Wait for next scheduled backup or trigger manually
# Then verify backup validation runs successfully
ssh root@smart-smoker-cloud-prod "/opt/smart-smoker-prod/scripts/backup-validation.sh"
```

### 8.6 Test Backup Retention

```bash
# Create test backups to verify retention works
for i in {1..10}; do
  ssh root@smart-smoker-cloud-prod "/opt/smart-smoker-prod/scripts/backup-mongodb.sh"
  sleep 5
done

# Run retention cleanup
ssh root@smart-smoker-cloud-prod "/opt/smart-smoker-prod/scripts/backup-retention.sh"

# Verify old backups removed according to policy
ssh root@smart-smoker-cloud-prod "ls -lh /opt/smart-smoker-prod/backups/mongodb/"
```

### 8.7 Success Criteria

- [ ] Backups role deployed to prod-cloud
- [ ] MongoDB backup cron job running
- [ ] First backup completed successfully
- [ ] Backup validation passes
- [ ] Dry-run restore works
- [ ] LXC snapshots configured on Proxmox
- [ ] First LXC snapshot created
- [ ] Retention policies working correctly
- [ ] All backups compressed and timestamped

---

## Final Validation Checklist

### Development Environment (dev-cloud)
- [ ] MongoDB 7.0 with authentication ✅
- [ ] Automated backups operational ✅
- [ ] Health checks passing ✅
- [ ] Rollback tested ✅

### Production Environment
- [ ] MongoDB 7.0 with authentication ✅
- [ ] Zero data loss ✅
- [ ] All services operational ✅
- [ ] Automated backups configured ✅
- [ ] LXC snapshots configured ✅
- [ ] 24-hour stability monitoring ✅

### Documentation
- [ ] GitHub Secrets configured ✅
- [ ] Passwords stored in password manager ✅
- [ ] Runbooks tested ✅
- [ ] Team trained (if applicable) ✅

---

## Troubleshooting

### Issue: MongoDB won't start with authentication

**Symptoms**: Container starts but exits immediately

**Solution**:
```bash
# Check logs
docker logs mongo

# Look for: "unauthorized" or "authentication failed"

# Verify environment variables set correctly
docker inspect mongo | grep -A 10 "Env"

# Ensure MONGO_INITDB_ROOT_PASSWORD is set
# Restart with correct environment variables
```

### Issue: Backend can't connect to MongoDB

**Symptoms**: "MongoServerError: Authentication failed"

**Solution**:
```bash
# Verify connection string in .env.prod
cat apps/backend/.env.prod

# Should be: mongodb://smartsmoker:${MONGO_APP_PASSWORD}@mongo:27017/smartsmoker?authSource=admin

# Verify MONGO_APP_PASSWORD environment variable
docker exec backend_cloud env | grep MONGO

# Test MongoDB connection manually
docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker
```

### Issue: Health checks failing

**Symptoms**: Containers marked as unhealthy

**Solution**:
```bash
# Check health check logs
docker inspect backend_cloud --format='{{json .State.Health}}' | jq

# Look at recent health check attempts
docker inspect backend_cloud --format='{{range .State.Health.Log}}{{.Output}}{{end}}'

# Common issues:
# 1. Service not fully started yet (wait 60-120s)
# 2. Health endpoint not accessible (check port mapping)
# 3. Dependencies not healthy (check mongo health first)
```

### Issue: Backup fails

**Symptoms**: Empty backup directory or error in logs

**Solution**:
```bash
# Check backup logs
tail -50 /var/log/mongodb-backup.log

# Verify MongoDB authentication works
docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" smartsmoker

# Check disk space
df -h /opt/smart-smoker-prod/backups

# Test backup manually with verbose output
docker exec mongo mongodump \
  --username=smartsmoker \
  --password="${MONGO_APP_PASSWORD}" \
  --authenticationDatabase=admin \
  --db=smartsmoker \
  --out=/data/db/backups/mongodb/manual-test \
  --gzip \
  --verbose
```

---

## Post-Deployment

### Monitoring (First 24 Hours)

```bash
# Check logs periodically
docker-compose logs -f --tail=100

# Monitor container health
watch -n 60 'docker ps --filter health=healthy'

# Check disk usage
df -h

# Verify backups running on schedule
ls -lt /opt/smart-smoker-prod/backups/mongodb/ | head -10
```

### Week 1 Tasks

- [ ] Day 1: Monitor logs every 2-4 hours
- [ ] Day 2-3: Monitor logs daily
- [ ] Day 7: Test restore procedure (restore to test environment)
- [ ] Day 7: Verify retention cleanup ran
- [ ] Day 7: Update Phase 3 Story 0 status to COMPLETE

### Quarterly Maintenance

- [ ] Test disaster recovery procedure
- [ ] Rotate MongoDB passwords
- [ ] Verify backup integrity
- [ ] Review and optimize retention policies
- [ ] Update documentation with lessons learned

---

## Success Declaration

Phase 3 Story 0 is **COMPLETE** when:

✅ MongoDB 7.0 LTS running with authentication (dev + prod)
✅ Automated backups operational (7d/4w/12m retention)
✅ Health checks preventing bad deployments
✅ Automated rollback tested and working
✅ Zero data loss during migration
✅ Production stable for 7+ days
✅ Documentation complete and tested

**Congratulations!** You've successfully completed Phase 3 Story 0 and established a solid foundation for deployment automation in Phase 3 Stories 1-5.

---

**Next Phase**: Phase 3 Story 1 - Automated Development Deployment

**Document Version**: 1.0
**Last Updated**: 2025-11-27
**Author**: Generated via Claude Code
