# Production Database Migration Runbook

This runbook covers migrating the Smart Smoker production MongoDB database from the Raspberry Pi to the Proxmox prod-cloud LXC container.

**Tracked by:** [Production Database Migration (Story 5)](https://github.com/benjr70/Smart-Smoker-V2/issues/170)

## Prerequisites

- Story 0 complete: MongoDB upgraded to 7.x with authentication enabled
- prod-cloud LXC provisioned and accessible via Tailscale
- Backup storage available for multiple copies

## Current State

| Attribute | Value |
|-----------|-------|
| Database | MongoDB 7.x stable |
| Authentication | Enabled with dedicated service account |
| Location | smart-smoker-cloud-prod LXC container (Proxmox) |
| Data Path | `/opt/smart-smoker/database:/data/db` |
| Backup | Integrated with Proxmox automated backup system |

## Phase 0: MongoDB Upgrade on Raspberry Pi (DO THIS FIRST)

1. **Upgrade MongoDB on Raspberry Pi**
   ```bash
   # This must be done BEFORE migration to Proxmox
   # Follow MongoDB 4.x -> 7.x upgrade path
   # Enable authentication during this upgrade
   # Test with backend service
   # Verify all data intact after upgrade
   ```

2. **Verify Upgrade Success**
   ```bash
   # Confirm MongoDB 7.x running with authentication
   # Backend connecting successfully with credentials
   # All existing data accessible
   # Take final backup of upgraded database
   ```

## Phase 1: Preparation (Pre-Migration)

1. **Create Migration Plan**
   ```bash
   ssh pi@smokecloud "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
   ssh pi@smokecloud "docker exec mongo mongosh --eval 'db.adminCommand({listDatabases: 1})'"
   ssh pi@smokecloud "du -sh database/"
   ```

2. **Backup Current Database**
   ```bash
   BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
   ssh pi@smokecloud "docker exec mongo mongodump --out /data/db/backup-${BACKUP_DATE}"
   scp -r pi@smokecloud:/path/to/database/backup-${BACKUP_DATE} ./backups/
   mongorestore --dry-run --drop ./backups/backup-${BACKUP_DATE}
   ```

3. **Prepare Target Environment**
   ```bash
   ssh root@smart-smoker-cloud-prod
   mkdir -p /opt/smart-smoker/database
   chown -R 999:999 /opt/smart-smoker/database
   ```

4. **Test Migration on Dev Environment**
   ```bash
   # Perform dry-run migration on dev-cloud first
   # This validates the process without affecting production
   ```

## Phase 2: Migration Window (Downtime Required)

Expected downtime: 30-60 minutes. Schedule for a low-traffic period.

1. **Stop Production Services on Pi**
   ```bash
   ssh pi@smokecloud "cd /path/to/compose && docker-compose down"
   ```

2. **Create Final Backup**
   ```bash
   FINAL_BACKUP=$(date +%Y%m%d-%H%M%S-final)
   ssh pi@smokecloud "sudo tar -czf /tmp/database-${FINAL_BACKUP}.tar.gz database/"
   scp pi@smokecloud:/tmp/database-${FINAL_BACKUP}.tar.gz ./backups/
   ```

3. **Transfer Database to Proxmox**
   ```bash
   # Method 1: Direct rsync (if both on Tailscale)
   ssh pi@smokecloud "rsync -avz --progress database/ root@smart-smoker-cloud-prod:/opt/smart-smoker/database/"

   # Method 2: Via mongodump/mongorestore (cleaner, slower)
   ssh pi@smokecloud "docker exec mongo mongodump --archive=/tmp/db-export.archive --gzip"
   scp pi@smokecloud:/tmp/db-export.archive /tmp/
   scp /tmp/db-export.archive root@smart-smoker-cloud-prod:/tmp/
   ```

4. **Deploy MongoDB on Proxmox**
   ```bash
   ssh root@smart-smoker-cloud-prod
   cd /opt/smart-smoker
   docker-compose up -d mongo
   sleep 10
   docker-compose logs mongo
   ```

5. **Restore Data (if using mongodump method)**
   ```bash
   ssh root@smart-smoker-cloud-prod
   docker exec -i mongo mongorestore --archive=/tmp/db-export.archive --gzip --drop
   ```

6. **Verify Data Integrity**
   ```bash
   ssh root@smart-smoker-cloud-prod "docker exec mongo mongosh"

   # Run verification queries
   db.adminCommand({listDatabases: 1})
   db.getCollectionNames()
   db.stats()
   db.users.countDocuments()
   db.cooksessions.countDocuments()
   ```

7. **Deploy Full Application Stack**
   ```bash
   ssh root@smart-smoker-cloud-prod
   cd /opt/smart-smoker

   VERSION=latest \
   VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY}" \
   VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY}" \
   docker-compose -f cloud.docker-compose.yml up -d
   ```

## Phase 3: Verification & Cutover

1. **Application Health Checks**
   ```bash
   sleep 30
   ssh root@smart-smoker-cloud-prod "docker-compose ps"
   curl -f http://smart-smoker-cloud-prod:8443/health
   curl -f http://smart-smoker-cloud-prod:80/
   ssh root@smart-smoker-cloud-prod "docker exec mongo mongosh --eval 'db.adminCommand({ping: 1})'"
   ```

2. **Functional Testing**
   - Login with test account
   - Verify existing cook sessions visible
   - Create new cook session
   - Verify real-time updates working
   - Test push notifications (if configured)

3. **Update DNS/Tailscale**
   ```bash
   ssh root@smart-smoker-cloud-prod "tailscale funnel --bg 80"
   curl https://smart-smoker-cloud-prod.tail74646.ts.net
   ```

4. **Monitor for Issues**
   ```bash
   ssh root@smart-smoker-cloud-prod "docker-compose logs -f --tail=100"
   ssh root@smart-smoker-cloud-prod "docker stats"
   ```

## Phase 4: Cleanup & Decommissioning

1. **Keep Pi as Backup (1-2 weeks)**
   - Do not delete Pi data immediately
   - Monitor new production for stability
   - Keep Pi available for emergency rollback

2. **Document New Production**
   - Update connection strings, IP addresses, volume paths, backup procedures

3. **Update GitHub Actions Workflows**
   - Update `cloud-deploy.yml` runner and deployment targets as needed

4. **Archive Pi Deployment (After 1-2 Weeks)**
   ```bash
   ssh pi@smokecloud "sudo tar -czf /tmp/pi-archive-$(date +%Y%m%d).tar.gz /path/to/compose database/"
   scp pi@smokecloud:/tmp/pi-archive-*.tar.gz ./archives/
   ssh pi@smokecloud "docker-compose down -v"
   ```

## Rollback Plan

If migration fails, restore Pi services:

```bash
ssh root@smart-smoker-cloud-prod "docker-compose down"
ssh pi@smokecloud "cd /path/to/compose && docker-compose up -d"
curl -f http://smokecloud:8443/health
curl -f http://smokecloud:80/
```

## Post-Migration Monitoring

**Week 1 Checklist:**
- [ ] Daily database backups configured and tested
- [ ] Monitoring alerts configured (disk, memory, container health)
- [ ] Performance metrics compared to Pi baseline
- [ ] No data loss or corruption reported
- [ ] Backup Pi still available but not receiving traffic

**Week 2 Actions:**
- [ ] Archive Pi deployment
- [ ] Update all documentation
- [ ] Update disaster recovery procedures
- [ ] Close migration ticket

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during transfer | Critical | Low | Multiple backups, verification steps |
| Extended downtime | High | Medium | Practice on dev, rollback plan ready |
| Service incompatibility | Medium | Low | Same MongoDB version, test first |
| Network connectivity issues | Medium | Low | Tailscale already configured |
| Performance degradation | Medium | Low | Proxmox more powerful than Pi |
