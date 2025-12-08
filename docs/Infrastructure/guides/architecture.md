# Architecture Overview

## System Architecture

Smart Smoker V2 infrastructure runs on a local Proxmox server with the following components:

### Infrastructure Components

- **Proxmox Server**: Host for all containers and VMs
- **LXC Containers**: Lightweight containers for services
- **VMs**: Virtual machines for device simulation
- **Terraform**: Infrastructure as Code provisioning
- **Ansible**: Configuration management
- **Docker**: Container runtime
- **Tailscale**: Secure networking

### Deployment Environments

- **Development**: dev-cloud (VMID 104) - Auto-deploy on master merge
- **Production**: prod-cloud (VMID 106) - Manual deployment with approval
- **Testing**: virtual-smoker-device (VMID 9001) - Device simulation

### Services

- **MongoDB 7.0**: Database with authentication
- **Backend**: NestJS application
- **Frontend**: React application
- **Device Service**: Raspberry Pi device service

## Architecture Decisions

### Infrastructure as Code

**Decision**: Use Terraform for infrastructure provisioning

**Rationale**:
- Reproducible infrastructure
- Version controlled
- Easy to modify and scale

### Container Orchestration

**Decision**: Use Docker Compose for service orchestration

**Rationale**:
- Simple deployment
- Easy to manage
- Good for single-server deployment

### Networking

**Decision**: Use Tailscale for secure networking

**Rationale**:
- Secure mesh networking
- Easy public access via funnels
- No port forwarding required

### Backup Strategy

**Decision**: Automated backups with retention policies

**Rationale**:
- Data protection
- Disaster recovery
- Compliance requirements

## Security Architecture

### Authentication

- MongoDB: Two-user model (admin + application)
- SSH: Key-only authentication
- Services: Authenticated connections

### Network Security

- Firewall: UFW with minimal ports
- fail2ban: Brute force protection
- Tailscale: Encrypted mesh networking

### Secrets Management

- GitHub Secrets: For CI/CD
- Environment Variables: For runtime
- No secrets in code: All secrets externalized

## Deployment Architecture

### CI/CD Pipeline

1. Code pushed to GitHub
2. GitHub Actions triggers workflow
3. Self-hosted runner executes deployment
4. Pre-deployment backup created
5. Services deployed
6. Health checks verify deployment
7. Rollback on failure

### Deployment Safety

- Pre-deployment backups
- Health verification
- Automated rollback
- Audit trail

## Related Documentation

- [Getting Started](getting-started.md) - Quick start guide
- [Infrastructure Features](../features/infrastructure/proxmox.md) - Infrastructure details
- [Deployment Features](../features/deployment/automation.md) - Deployment details

---

**Last Updated**: 2025-12-07



