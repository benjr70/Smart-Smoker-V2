# Getting Started

## Overview

This guide provides a quick start for working with Smart Smoker V2 infrastructure. For detailed information, see the feature-specific documentation.

## Prerequisites

- Access to Proxmox server
- SSH access to containers
- GitHub repository access
- Basic knowledge of Docker, Terraform, and Ansible

## Quick Start

### 1. Infrastructure Setup

**Terraform** (provision infrastructure):
```bash
cd infra/proxmox/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your configuration
terraform init
terraform plan
terraform apply
```

**Ansible** (configure infrastructure):
```bash
cd infra/proxmox/ansible
ansible-playbook playbooks/site.yml
```

### 2. Deploy Application

**Development**:
```bash
cd /opt/smart-smoker-dev
git pull origin master
docker compose -f cloud.docker-compose.yml up -d
```

**Production**:
```bash
cd /opt/smart-smoker-prod
git pull origin <tag>
./scripts/deployment-backup.sh
docker compose -f cloud.docker-compose.yml up -d
./scripts/deployment-health-check.sh localhost 3
```

### 3. Verify Deployment

```bash
# Check container health
docker ps --filter health=healthy

# Test health endpoints
curl http://localhost:8443/api/health | jq

# Check logs
docker compose -f cloud.docker-compose.yml logs --tail=50
```

## Common Tasks

### View Container Status

```bash
# All containers
docker ps -a

# Healthy containers
docker ps --filter health=healthy

# Container logs
docker logs <container-name> --tail 50
```

### Backup Operations

```bash
# Create backup
/opt/smart-smoker-prod/scripts/backup-mongodb.sh

# Verify backup
/opt/smart-smoker-prod/scripts/backup-validation.sh

# Restore from backup
# See Backups documentation
```

### Troubleshooting

```bash
# Check service health
./scripts/deployment-health-check.sh localhost 3

# View logs
docker compose -f cloud.docker-compose.yml logs -f

# Restart services
docker compose -f cloud.docker-compose.yml restart
```

## Next Steps

- [Architecture](architecture.md) - Understand the system architecture
- [Database Features](../features/database/mongodb.md) - MongoDB configuration
- [Deployment Features](../features/deployment/automation.md) - Deployment automation
- [Infrastructure Features](../features/infrastructure/terraform.md) - Infrastructure setup

---

**Last Updated**: 2025-12-07



