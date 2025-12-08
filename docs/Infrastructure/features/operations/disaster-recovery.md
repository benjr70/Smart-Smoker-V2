# Disaster Recovery Guide

## Overview

This guide provides procedures for recovering the Smart Smoker V2 infrastructure in case of failures, data loss, or catastrophic events.

## Table of Contents

1. [Backup Procedures](#backup-procedures)
2. [Recovery Scenarios](#recovery-scenarios)
3. [Terraform State Recovery](#terraform-state-recovery)
4. [Container Recovery](#container-recovery)
5. [Data Restoration](#data-restoration)
6. [Testing Recovery Procedures](#testing-recovery-procedures)

---

## Backup Procedures

### Terraform State Backups

**Automated Backup** (Recommended):
```bash
# Add to cron job (daily at 2 AM)
0 2 * * * cd /home/benjr70/Dev/Smart-Smoker-V2/infra/proxmox/terraform && \
  cp state/terraform.tfstate state/terraform.tfstate.backup.$(date +\%Y\%m\%d) && \
  find state/ -name "terraform.tfstate.backup.*" -mtime +30 -delete
```

**Manual Backup**:
```bash
cd infra/proxmox/terraform
cp state/terraform.tfstate state/terraform.tfstate.backup.$(date +%Y%m%d-%H%M%S)
```

**Remote Backup** (For production):
```bash
# Sync to remote storage
aws s3 cp state/terraform.tfstate s3://smart-smoker-terraform/state/terraform.tfstate.$(date +%Y%m%d)
# Or use rsync to remote server
rsync -avz state/terraform.tfstate backup-server:/backups/terraform/
```

### Proxmox Backups

**LXC Container Backups**:
```bash
# On Proxmox host - backup all containers
vzdump 104 105 106 --mode snapshot --compress zstd --storage backup-storage

# Automated backup (add to Proxmox Datacenter > Backup)
# Schedule: Daily at 1 AM
# Retention: 7 daily, 4 weekly, 3 monthly
```

**VM Backups**:
```bash
# Backup virtual smoker VM
vzdump 9001 --mode snapshot --compress zstd --storage backup-storage
```

### Configuration Backups

**Backup terraform.tfvars** (Encrypted):
```bash
# Encrypt and backup sensitive configuration
gpg --symmetric --cipher-algo AES256 terraform.tfvars
cp terraform.tfvars.gpg ~/secure-backups/terraform.tfvars.$(date +%Y%m%d).gpg

# Decrypt when needed
gpg --decrypt terraform.tfvars.gpg > terraform.tfvars
```

**Git Repository Backup**:
```bash
# Clone mirror to backup location
git clone --mirror https://github.com/benjr70/Smart-Smoker-V2.git
cd Smart-Smoker-V2.git
git remote update
```

---

## Recovery Scenarios

### Scenario 1: Single Container Failure

**Symptoms**: One container is not responding or corrupted

**Recovery Steps**:
1. Verify container status:
   ```bash
   pct status 104  # Replace with affected VMID
   ```

2. Attempt to restore from backup:
   ```bash
   # List available backups
   ls /var/lib/vz/dump/ | grep 104

   # Restore from backup
   pct restore 104 /var/lib/vz/dump/vzdump-lxc-104-YYYY_MM_DD-HH_MM_SS.tar.zst
   ```

3. If backup restoration fails, rebuild with Terraform:
   ```bash
   cd infra/proxmox/terraform

   # Remove failed container from state
   terraform state rm module.dev_cloud[0].module.container.proxmox_virtual_environment_container.this

   # Re-create container
   terraform apply -target=module.dev_cloud
   ```

### Scenario 2: Complete Proxmox Host Failure

**Symptoms**: Proxmox server is completely offline/unrecoverable

**Recovery Steps**:
1. **Install Fresh Proxmox VE**:
   - Install Proxmox VE on new hardware
   - Configure network to match previous setup
   - Set up storage pools matching original configuration

2. **Restore Configuration**:
   ```bash
   # Restore Terraform configuration from git
   git clone https://github.com/benjr70/Smart-Smoker-V2.git
   cd Smart-Smoker-V2/infra/proxmox/terraform

   # Restore terraform.tfvars from encrypted backup
   gpg --decrypt ~/secure-backups/terraform.tfvars.YYYYMMDD.gpg > terraform.tfvars
   ```

3. **Rebuild Infrastructure**:
   ```bash
   # Initialize Terraform
   terraform init

   # Review plan
   terraform plan

   # Apply infrastructure
   terraform apply
   ```

4. **Restore Application Data** (see Data Restoration section)

### Scenario 3: Terraform State File Corruption

**Symptoms**: `terraform plan` shows unexpected changes or errors

**Recovery Steps**:
1. **Restore from backup**:
   ```bash
   cd infra/proxmox/terraform/state

   # List available backups
   ls -lh terraform.tfstate.backup.*

   # Restore most recent valid backup
   cp terraform.tfstate.backup.YYYYMMDD terraform.tfstate

   # Verify
   terraform plan
   ```

2. **If no backup available, rebuild state**:
   ```bash
   # Import existing resources
   terraform import 'module.github_runner[0].module.container.proxmox_virtual_environment_container.this' 105
   terraform import 'module.dev_cloud[0].module.container.proxmox_virtual_environment_container.this' 104
   terraform import 'module.prod_cloud[0].module.container.proxmox_virtual_environment_container.this' 106

   # Verify state is correct
   terraform plan
   ```

### Scenario 4: Accidental Resource Deletion

**Symptoms**: Critical resources were destroyed (prevented by lifecycle policy in production)

**Recovery Steps**:
1. **If resources have `prevent_destroy = true`**:
   - Terraform will prevent deletion
   - Error message: "Error: Instance cannot be destroyed"

2. **If deletion occurred before lifecycle protection**:
   ```bash
   # Check if resources still exist in Proxmox
   pct list
   qm list

   # If resources exist, re-import to Terraform
   terraform import 'module.prod_cloud[0].module.container.proxmox_virtual_environment_container.this' 106

   # If resources don't exist, recreate
   terraform apply -target=module.prod_cloud
   ```

3. **Restore data from backup**

---

## Terraform State Recovery

### Remote Backend Migration (Recommended for Production)

**Setup S3 Backend**:
```hcl
# infra/proxmox/terraform/backend.tf
terraform {
  backend "s3" {
    bucket         = "smart-smoker-terraform-state"
    key            = "proxmox/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

**Migrate from Local to Remote**:
```bash
# Backup current state
cp state/terraform.tfstate state/terraform.tfstate.backup.pre-migration

# Update backend.tf with remote configuration
# Run migration
terraform init -migrate-state

# Verify migration
terraform plan
```

### State Locking

**PostgreSQL Backend with Locking**:
```hcl
terraform {
  backend "pg" {
    conn_str = "postgres://terraform:password@postgres.example.com/terraform_state?sslmode=require"
  }
}
```

---

## Container Recovery

### GitHub Runner Recovery

**Priority**: HIGH - Required for CI/CD

1. Restore container from backup or recreate with Terraform
2. Reinstall GitHub Actions runner:
   ```bash
   pct enter 105
   cd /opt/actions-runner
   ./config.sh --url https://github.com/benjr70/Smart-Smoker-V2 --token <NEW_TOKEN>
   ./svc.sh install
   ./svc.sh start
   ```

3. Verify runner connectivity in GitHub repository settings

### Development Cloud Recovery

**Priority**: MEDIUM

1. Restore container from backup or recreate
2. Redeploy application:
   ```bash
   # Trigger deployment workflow or manual deploy
   ssh root@10.20.0.20
   cd /opt/smart-smoker
   docker-compose pull
   docker-compose up -d
   ```

### Production Cloud Recovery

**Priority**: CRITICAL

1. **Restore from most recent backup**:
   ```bash
   pct restore 106 /var/lib/vz/dump/vzdump-lxc-106-latest.tar.zst
   pct start 106
   ```

2. **Verify application data integrity**:
   ```bash
   pct enter 106
   docker ps
   docker-compose logs
   ```

3. **Restore database if needed** (see Data Restoration)

4. **Update DNS/traffic routing** after verification

---

## Data Restoration

### Database Restoration

**PostgreSQL/TimescaleDB** (if used):
```bash
# Restore from backup
pct enter 106
cd /var/lib/postgresql/backups
pg_restore -U postgres -d smart_smoker latest.dump

# Or from continuous archive
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
```

### Docker Volume Restoration

```bash
# Backup volumes
docker run --rm -v smart-smoker_data:/data -v $(pwd):/backup ubuntu \
  tar czf /backup/data-backup.tar.gz /data

# Restore volumes
docker run --rm -v smart-smoker_data:/data -v $(pwd):/backup ubuntu \
  tar xzf /backup/data-backup.tar.gz -C /
```

### Application Configuration

```bash
# Restore environment files
pct push 106 /secure-backups/.env /opt/smart-smoker/.env

# Restore application configs
pct push 106 /secure-backups/config /opt/smart-smoker/config
```

---

## Testing Recovery Procedures

### Quarterly DR Tests

**Schedule**: First weekend of each quarter

**Test Procedures**:

1. **Test Terraform State Backup/Restore**:
   ```bash
   # Backup current state
   cp state/terraform.tfstate state/terraform.tfstate.CURRENT

   # Restore from old backup
   cp state/terraform.tfstate.backup.LAST_WEEK state/terraform.tfstate

   # Verify
   terraform plan

   # Restore current state
   mv state/terraform.tfstate.CURRENT state/terraform.tfstate
   ```

2. **Test Container Recovery**:
   ```bash
   # Create test container
   terraform apply -target=module.test_container

   # Destroy
   terraform destroy -target=module.test_container

   # Recover
   terraform apply -target=module.test_container
   ```

3. **Test Backup Restoration**:
   ```bash
   # Restore dev-cloud to test VMID
   pct restore 199 /var/lib/vz/dump/vzdump-lxc-104-latest.tar.zst

   # Verify application starts
   pct start 199
   pct enter 199
   docker-compose up -d

   # Cleanup
   pct stop 199
   pct destroy 199
   ```

### DR Drill Checklist

- [ ] Terraform state backup exists and is recent (< 24 hours)
- [ ] Can successfully restore Terraform state from backup
- [ ] Proxmox backups are configured and running
- [ ] Can restore LXC container from backup
- [ ] Can recreate container from Terraform
- [ ] terraform.tfvars is backed up securely
- [ ] Database backups are automated and tested
- [ ] Docker volumes are backed up
- [ ] Recovery procedures documentation is up-to-date
- [ ] All team members know where to find this guide
- [ ] Emergency contact information is current

---

## Emergency Contacts

**Infrastructure Team**:
- Primary: [Name] - [Email] - [Phone]
- Secondary: [Name] - [Email] - [Phone]

**Escalation Path**:
1. Infrastructure Team
2. Development Lead
3. Technical Director

**External Vendors**:
- Proxmox Support: [Contact Info]
- Cloud Provider: [Contact Info]

---

## Recovery Time Objectives (RTO) & Recovery Point Objectives (RPO)

| Component | RTO | RPO | Priority |
|-----------|-----|-----|----------|
| Terraform State | 15 minutes | 24 hours | HIGH |
| GitHub Runner | 30 minutes | N/A | HIGH |
| Production Cloud | 1 hour | 1 hour | CRITICAL |
| Development Cloud | 4 hours | 24 hours | MEDIUM |
| Virtual Smoker VM | 4 hours | 24 hours | LOW |
| Application Data | 1 hour | 1 hour | CRITICAL |

---

## Post-Recovery Checklist

After any recovery operation:

- [ ] Document what happened (incident report)
- [ ] Verify all services are operational
- [ ] Check monitoring and alerting
- [ ] Run `terraform plan` to verify infrastructure matches desired state
- [ ] Test application functionality
- [ ] Verify backups are working
- [ ] Update this document if procedures changed
- [ ] Conduct post-mortem meeting
- [ ] Identify preventative measures

---

## Related Documentation

- [Terraform Configuration](../infrastructure/terraform.md)
- [Proxmox Infrastructure](../infrastructure/proxmox.md)
- [Proxmox Infrastructure README](../../infra/proxmox/README.md)
- [Secrets Management Guide](./secrets-management-guide.md)

---

**Last Updated**: 2025-10-05
**Next Review Date**: 2026-01-05
**Document Owner**: Infrastructure Team
