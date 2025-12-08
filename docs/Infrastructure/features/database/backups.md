# Automated Backup System

## Overview

The Smart Smoker V2 infrastructure uses an automated backup system for MongoDB with retention policies and validation. Backups are managed via Ansible roles and run automatically via cron jobs.

## Backup System Architecture

### Components

**Ansible Backup Role** (`infra/proxmox/ansible/roles/backups/`):
```
infra/proxmox/ansible/roles/backups/
├── defaults/main.yml                    # Configuration (7d/4w/12m retention)
├── tasks/main.yml                       # Ansible tasks + cron jobs
├── handlers/main.yml                    # Service handlers
└── templates/
    ├── backup-mongodb.sh.j2             # MongoDB dump script
    ├── backup-retention.sh.j2           # Cleanup old backups
    └── backup-validation.sh.j2          # Verify backup integrity
```

**Playbooks Updated**:
```
infra/proxmox/ansible/playbooks/
├── setup-dev-cloud.yml                  # Added backups role
└── setup-prod-cloud.yml                 # Added backups role
```

## Backup Schedule

### Daily MongoDB Backups

**Time**: 2:00 AM daily  
**Script**: `backup-mongodb.sh`

```bash
mongodump \
  --username=smartsmoker \
  --password="${MONGO_APP_PASSWORD}" \
  --authenticationDatabase=admin \
  --db=smartsmoker \
  --out=/opt/smart-smoker-{{env}}/backups/mongodb/backup-${TIMESTAMP} \
  --gzip
```

### Retention Cleanup

**Time**: 2:30 AM daily  
**Script**: `backup-retention.sh`

**Retention Policy**:
- **Daily**: Keep 7 days
- **Weekly**: Keep 4 weeks (Sundays)
- **Monthly**: Keep 12 months (1st of month)

### Backup Validation

**Time**: Sundays at 3:00 AM  
**Script**: `backup-validation.sh`

**Validation Checks**:
- Backup directory exists
- Contains BSON files
- File sizes reasonable
- Timestamps within expected range
- Gzip integrity

### Cron Schedule

```cron
0 2 * * * /opt/smart-smoker-{{env}}/scripts/backup-mongodb.sh
30 2 * * * /opt/smart-smoker-{{env}}/scripts/backup-retention.sh
0 3 * * 0 /opt/smart-smoker-{{env}}/scripts/backup-validation.sh
```

## Configuration

### Retention Policy

**Default Configuration** (`infra/proxmox/ansible/roles/backups/defaults/main.yml`):

```yaml
backups_retention_daily: 7
backups_retention_weekly: 4
backups_retention_monthly: 12
backups_mongodb_user: smartsmoker
backups_mongodb_database: smartsmoker
```

**Customization**: Override in inventory `host_vars` or `group_vars`:

```yaml
# For production, keep more backups
backups_retention_daily: 14
backups_retention_weekly: 8
backups_retention_monthly: 24
```

### Backup Locations

- **Dev**: `/opt/smart-smoker-dev/backups/mongodb/`
- **Prod**: `/opt/smart-smoker-prod/backups/mongodb/`
- **Symlink**: `latest` points to most recent backup

### Backup Directory Structure

```
/opt/smart-smoker-{env}/backups/
├── mongodb/
│   ├── backup-20251207-140000/      # Daily backups
│   │   ├── smartsmoker/
│   │   │   ├── sessions.bson.gz
│   │   │   └── users.bson.gz
│   │   └── backup.log
│   ├── latest -> backup-20251207-140000/
│   └── validation-report.txt
└── deployments/
    ├── backup-20251207-150000/
    │   ├── manifest.txt
    │   ├── docker-images.tar.gz
    │   ├── cloud.docker-compose.yml.backup
    │   └── mongodb-data.tar.gz
    └── last-deployment-backup.txt
```

## Deployment

### Deploy Backup Role

**To Dev-Cloud**:
```bash
cd infra/proxmox/ansible
ansible-playbook playbooks/setup-dev-cloud.yml --tags backups
```

**To Prod-Cloud**:
```bash
cd infra/proxmox/ansible
ansible-playbook playbooks/setup-prod-cloud.yml \
  --tags backups \
  --extra-vars "mongo_app_password=${PROD_MONGO_APP_PASSWORD}"
```

### Verify Installation

```bash
# Check cron jobs
ssh root@smart-smoker-cloud-prod "crontab -l | grep backup"

# Check scripts installed
ssh root@smart-smoker-cloud-prod "ls -la /opt/smart-smoker-prod/scripts/backup-*"

# Verify backup directories created
ssh root@smart-smoker-cloud-prod "ls -la /opt/smart-smoker-prod/backups/"
```

## Manual Operations

### Create Manual Backup

```bash
# On production server
/opt/smart-smoker-prod/scripts/backup-mongodb.sh

# Verify backup created
ls -lh /opt/smart-smoker-prod/backups/mongodb/
```

### Verify Backup

```bash
# Run validation script
/opt/smart-smoker-prod/scripts/backup-validation.sh

# Check validation report
cat /opt/smart-smoker-prod/backups/mongodb/validation-report.txt
```

### Test Restore (Dry-Run)

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
```

### Restore from Backup

```bash
# Stop services
docker compose -f cloud.docker-compose.yml down

# Restore from backup
docker exec mongo mongorestore \
  --username smartsmoker \
  --password "${MONGO_APP_PASSWORD}" \
  --authenticationDatabase admin \
  --drop \
  --gzip \
  /opt/smart-smoker-prod/backups/mongodb/backup-YYYYMMDD-HHMMSS/smartsmoker

# Restart services
docker compose -f cloud.docker-compose.yml up -d
```

## Monitoring

### Check Backup Status

```bash
# List recent backups
ls -lth /opt/smart-smoker-prod/backups/mongodb/ | head -10

# Check backup logs
tail -50 /var/log/mongodb-backup.log

# Verify latest symlink
ls -lh /opt/smart-smoker-prod/backups/mongodb/latest

# Check validation report
cat /opt/smart-smoker-prod/backups/mongodb/validation-report.txt
```

### Verify Cron Jobs

```bash
# Check cron jobs are installed
crontab -l | grep backup

# Check cron service status
systemctl status cron

# View cron logs
grep CRON /var/log/syslog | grep backup
```

## Testing

### Test Backup Creation

```bash
# Manually trigger backup
/opt/smart-smoker-prod/scripts/backup-mongodb.sh

# Verify backup created
ls -lh /opt/smart-smoker-prod/backups/mongodb/backup-*

# Check backup contents
ls -lh /opt/smart-smoker-prod/backups/mongodb/backup-*/smartsmoker/
```

### Test Retention Cleanup

```bash
# Create test backups to verify retention works
for i in {1..10}; do
  /opt/smart-smoker-prod/scripts/backup-mongodb.sh
  sleep 5
done

# Run retention cleanup
/opt/smart-smoker-prod/scripts/backup-retention.sh

# Verify old backups removed according to policy
ls -lh /opt/smart-smoker-prod/backups/mongodb/
```

### Test Validation

```bash
# Run validation script
/opt/smart-smoker-prod/scripts/backup-validation.sh

# Check validation report
cat /opt/smart-smoker-prod/backups/mongodb/validation-report.txt
```

## Troubleshooting

### Backup Fails

**Symptoms**: Empty backup directory or error in logs

**Solution**:
```bash
# Check backup logs
tail -50 /var/log/mongodb-backup.log

# Verify MongoDB authentication works
docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" \
  --authenticationDatabase admin smartsmoker

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

### Cron Jobs Not Running

**Symptoms**: Backups not created automatically

**Solution**:
```bash
# Check cron service
systemctl status cron

# Verify cron jobs installed
crontab -l

# Check cron logs
grep CRON /var/log/syslog | grep backup

# Reinstall cron jobs via Ansible
ansible-playbook playbooks/setup-prod-cloud.yml --tags backups
```

### Validation Fails

**Symptoms**: Validation report shows errors

**Solution**:
```bash
# Check validation report
cat /opt/smart-smoker-prod/backups/mongodb/validation-report.txt

# Verify backup files exist
ls -lh /opt/smart-smoker-prod/backups/mongodb/backup-*/smartsmoker/

# Test gzip integrity
gunzip -t /opt/smart-smoker-prod/backups/mongodb/backup-*/smartsmoker/*.gz

# Re-run validation
/opt/smart-smoker-prod/scripts/backup-validation.sh
```

## Proxmox LXC Snapshots

### Configure Automated Snapshots

**On Proxmox Host**:

```bash
# Via Proxmox Web UI
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
```

**Manual Snapshot** (for testing):
```bash
# On Proxmox host
vzdump 106 \
  --mode snapshot \
  --storage local \
  --compress zstd \
  --notes-template "Smart Smoker Production Cloud Backup"

# Verify snapshot created
ls -lh /var/lib/vz/dump/ | grep 106
```

## Best Practices

### Backup Strategy

1. **Multiple Backup Types**: Use both MongoDB dumps and LXC snapshots
2. **Off-Site Storage**: Copy critical backups to remote location
3. **Regular Testing**: Test restore procedures quarterly
4. **Monitoring**: Set up alerts for backup failures
5. **Documentation**: Keep restore procedures documented and tested

### Retention Policy

- **Daily Backups**: 7 days (covers week-long issues)
- **Weekly Backups**: 4 weeks (covers monthly issues)
- **Monthly Backups**: 12 months (covers long-term recovery needs)

### Security

- **Encryption**: Consider encrypting backups at rest
- **Access Control**: Limit backup access to authorized personnel
- **Audit Logging**: Log all backup and restore operations
- **Password Protection**: Secure backup storage with strong passwords

## Related Documentation

- [MongoDB Configuration](mongodb.md) - MongoDB setup and authentication
- [Disaster Recovery](../operations/disaster-recovery.md) - Recovery procedures
- [Ansible Configuration](../configuration/ansible.md) - Ansible role management
- [Deployment Rollback](../deployment/rollback.md) - Deployment backup procedures

---

**Last Updated**: 2025-12-07  
**Retention Policy**: 7d/4w/12m



