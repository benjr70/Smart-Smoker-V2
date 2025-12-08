# Deployment Environments

## Overview

The Smart Smoker V2 infrastructure supports multiple deployment environments: development, production, and virtual device testing.

## Environment Types

### Development Environment

**Location**: dev-cloud (VMID 104)  
**Hostname**: smoker-dev-cloud  
**IP Address**: 10.20.0.20/24  
**Resources**: 2 CPU cores, 4GB RAM, 20GB storage

**Configuration**:
- Ubuntu 22.04 LTS
- Docker Engine
- Docker Compose
- Git for deployments
- Tailscale client
- MongoDB 7.0 with authentication
- Automated backups

**Access**:
- SSH: `ssh root@smoker-dev-cloud` (via Tailscale)
- Internal Tailscale: `smoker-dev-cloud.tail74646.ts.net`
- Backend API: `http://localhost:8443` (internal)
- Frontend: `http://localhost:80` (internal)

**Deployment**:
- Auto-deploy on master merge (planned)
- Manual deployment via scripts
- Latest container images
- Development database

**Features**:
- Integration testing
- Development data
- Faster iteration cycles
- Less strict monitoring

### Production Environment

**Location**: prod-cloud (VMID 106) or Raspberry Pi  
**Hostname**: smart-smoker-cloud-prod or smokecloud-1  
**IP Address**: 10.20.0.30/24 (prod-cloud)  
**Resources**: 4 CPU cores, 8GB RAM, 40GB storage (prod-cloud)

**Configuration**:
- Ubuntu 22.04 LTS
- Docker Engine
- Docker Compose
- Git for deployments
- Tailscale client with funnel
- MongoDB 7.0 with authentication
- Automated backups
- LXC snapshots

**Access**:
- SSH: `ssh root@smart-smoker-cloud-prod` (via Tailscale)
- Public: `https://smokecloud.tail74646.ts.net` (Tailscale funnel)
- Backend API: `https://smokecloud.tail74646.ts.net:8443`
- Frontend: `https://smokecloud.tail74646.ts.net`

**Deployment**:
- Manual deployment with approval
- Tagged stable releases
- Production database
- Health monitoring
- Automated rollback

**Features**:
- Production data
- Strict monitoring
- Automated backups
- Disaster recovery
- SSL certificates via Tailscale

### Virtual Device Testing

**Location**: virtual-smoker-device (VM - ARM64)  
**VMID**: 9001  
**Resources**: 2 CPU cores (ARM64), 2GB RAM, 32GB storage

**Configuration**:
- Raspberry Pi OS Lite 64-bit
- VNC Server for GUI access
- Mock hardware simulation services
- Python serial communication simulators
- Node.js device service environment
- GPIO simulation libraries
- Temperature sensor mock data generators
- Tailscale client

**Access**:
- SSH: `ssh root@virtual-smoker-device` (via Tailscale)
- VNC: Port 5900 (for GUI access)

**Purpose**:
- Integration test execution
- Mock hardware validation
- Performance testing
- User acceptance testing

## Environment Differences

### Development vs Production

| Feature | Development | Production |
|---------|------------|------------|
| Resources | 2 CPU, 4GB RAM | 4 CPU, 8GB RAM |
| Storage | 20GB | 40GB |
| Deployment | Auto/manual | Manual approval |
| Monitoring | Basic | Comprehensive |
| Backups | Daily | Daily + LXC snapshots |
| Access | Internal only | Public via Tailscale |
| Database | Dev data | Production data |
| SSL | Internal | Tailscale funnel |

### Configuration Files

**Development**: `cloud.docker-compose.dev.yml`  
**Production**: `cloud.docker-compose.yml`

**Key Differences**:
- Environment variables
- Resource limits
- Logging levels
- Monitoring configuration

## Environment Setup

### Initial Setup

**Development**:
```bash
# Deploy via Ansible
cd infra/proxmox/ansible
ansible-playbook playbooks/setup-dev-cloud.yml
```

**Production**:
```bash
# Deploy via Ansible
cd infra/proxmox/ansible
ansible-playbook playbooks/setup-prod-cloud.yml
```

### Environment Variables

**Development**:
```bash
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=<dev-password>
MONGO_APP_PASSWORD=<dev-app-password>
ENCODED_MONGO_APP_PASSWORD=<url-encoded>
NODE_ENV=development
```

**Production**:
```bash
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=<prod-password>
MONGO_APP_PASSWORD=<prod-app-password>
ENCODED_MONGO_APP_PASSWORD=<url-encoded>
NODE_ENV=production
```

## Environment Management

### Switching Environments

```bash
# Development
cd /opt/smart-smoker-dev
docker compose -f cloud.docker-compose.yml <command>

# Production
cd /opt/smart-smoker-prod
docker compose -f cloud.docker-compose.yml <command>
```

### Environment-Specific Scripts

```bash
# Development scripts
/opt/smart-smoker-dev/scripts/backup-mongodb.sh
/opt/smart-smoker-dev/scripts/deployment-health-check.sh

# Production scripts
/opt/smart-smoker-prod/scripts/backup-mongodb.sh
/opt/smart-smoker-prod/scripts/deployment-health-check.sh
```

## Network Configuration

### Development Network

- **Internal Access**: Tailscale mesh network
- **No Public Access**: Internal only
- **Ports**: Standard Docker ports (80, 8443, 27017)

### Production Network

- **Public Access**: Tailscale funnel
- **SSL**: Automatic via Tailscale
- **Ports**: Standard Docker ports exposed via funnel

See [Tailscale Configuration](../networking/tailscale.md) for details.

## Monitoring

### Development Monitoring

- Basic health checks
- Container status
- Log aggregation

### Production Monitoring

- Comprehensive health checks
- Performance metrics
- Alert notifications
- Backup verification
- Disaster recovery testing

See [Monitoring](../operations/monitoring.md) for details.

## Best Practices

### Development

1. **Fast Iteration**: Deploy frequently for testing
2. **Test Data**: Use development data, not production
3. **Experimentation**: Safe to test new features
4. **Documentation**: Document any issues found

### Production

1. **Stability**: Only deploy tested, stable releases
2. **Backups**: Always backup before deployment
3. **Monitoring**: Monitor closely after deployment
4. **Rollback**: Be ready to rollback if needed
5. **Documentation**: Document all production changes

## Related Documentation

- [Deployment Automation](automation.md) - CI/CD workflows
- [Health Checks](health-checks.md) - Health monitoring
- [Rollback](rollback.md) - Rollback procedures
- [Terraform Configuration](../infrastructure/terraform.md) - Infrastructure setup
- [Proxmox Configuration](../infrastructure/proxmox.md) - Container setup

---

**Last Updated**: 2025-12-07



