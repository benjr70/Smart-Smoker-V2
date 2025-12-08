# Proxmox Infrastructure

## Overview

The Smart Smoker V2 infrastructure runs on a local Proxmox server using LXC containers and VMs. This document covers Proxmox setup, container configuration, and infrastructure management.

## Infrastructure Layout

```
Proxmox Server
├── github-runner (LXC Container - VMID 105)
│   ├── Self-hosted GitHub Actions runner
│   ├── Terraform with Proxmox provider
│   ├── Docker CLI for deployment
│   ├── Tailscale client for network access
│   └── Node.js/npm for builds
│
├── smart-smoker-dev-cloud (LXC Container - VMID 104)
│   ├── Auto-deployed on master merge
│   ├── Backend + Frontend + MongoDB
│   ├── Environment variables injection
│   ├── Health monitoring
│   └── Internal Tailscale access
│
├── smart-smoker-cloud-prod (LXC Container - VMID 106)
│   ├── Manual deployment trigger
│   ├── Backend + Frontend + MongoDB
│   ├── Tailscale client with funnel configuration
│   ├── Production SSL certificates via Tailscale
│   ├── Public access: https://smokecloud.tail74646.ts.net
│   └── Automated deployment workflow
│
└── virtual-smoker-device (VM - ARM64 - VMID 9001)
    ├── Raspberry Pi OS with desktop
    ├── VNC server for GUI access
    ├── Mock hardware devices
    ├── Device Service + Smoker UI + Electron Shell
    └── Complete smoker simulation environment
```

## Container Specifications

### GitHub Runner (VMID 105)

**Type**: LXC Container  
**Resources**: 2 CPU cores, 4GB RAM, 50GB storage  
**Network**: vmbr0 (10.20.0.10/24)  
**OS**: Ubuntu 22.04 LTS

**Features**:
- Nesting enabled for Docker-in-Docker
- GitHub Actions runner service
- Terraform CLI
- Docker CLI
- Tailscale client
- Node.js 20 LTS

### Development Cloud (VMID 104)

**Type**: LXC Container  
**Resources**: 2 CPU cores, 4GB RAM, 20GB storage  
**Network**: vmbr0 (10.20.0.20/24)  
**OS**: Ubuntu 22.04 LTS

**Features**:
- Docker Engine
- Docker Compose
- Git for deployments
- Tailscale client
- MongoDB 7.0
- Automated backups

### Production Cloud (VMID 106)

**Type**: LXC Container  
**Resources**: 4 CPU cores, 8GB RAM, 40GB storage  
**Network**: vmbr0 (10.20.0.30/24)  
**OS**: Ubuntu 22.04 LTS

**Features**:
- Docker Engine
- Docker Compose
- Git for deployments
- Tailscale client with funnel
- MongoDB 7.0
- Automated backups
- LXC snapshots

### Virtual Smoker Device (VMID 9001)

**Type**: VM (ARM64)  
**Resources**: 2 CPU cores (ARM64), 2GB RAM, 32GB storage  
**Network**: vmbr1 (10.30.0.40/24)  
**OS**: Raspberry Pi OS Lite 64-bit

**Features**:
- VNC Server for GUI access
- Mock hardware simulation
- Python serial communication simulators
- Node.js device service environment
- GPIO simulation libraries
- Tailscale client

## Infrastructure as Code

### Terraform Management

All infrastructure is managed via Terraform. See [Terraform Configuration](terraform.md) for setup and usage.

### Ansible Configuration

All containers are configured via Ansible. See [Ansible Configuration](../configuration/ansible.md) for setup and operations.

## Networking

### Network Bridges

**vmbr0** (Primary Network - 10.20.0.0/24):
- GitHub Runner: 10.20.0.10/24
- Dev Cloud: 10.20.0.20/24
- Prod Cloud: 10.20.0.30/24

**vmbr1** (Isolated Network - 10.30.0.0/24):
- Virtual Smoker Device: 10.30.0.40/24

### Tailscale Integration

All containers use Tailscale for secure networking:
- Mesh networking between containers
- Public access via Tailscale funnel (production)
- Internal access for development

See [Tailscale Configuration](../networking/tailscale.md) for details.

## Container Features

### Common Features

- **Nesting**: Enabled on all containers for Docker-in-Docker support
- **Unprivileged**: All containers run as unprivileged for security
- **Auto-start**: Containers start automatically on host boot

### Resource Pools

All infrastructure is organized in the `smart-smoker` resource pool for easier management.

## Backup and Recovery

### LXC Snapshots

**Automated Snapshots** (via Proxmox):
- Schedule: Daily at 01:00
- Retention: 7 daily, 4 weekly, 12 monthly
- Compression: ZSTD
- Storage: Local or backup storage

**Manual Snapshot**:
```bash
# On Proxmox host
vzdump 106 \
  --mode snapshot \
  --storage local \
  --compress zstd \
  --notes-template "Smart Smoker Production Cloud Backup"
```

### Container Backups

See [Backups](../database/backups.md) for MongoDB backup procedures.

## Monitoring

### Container Status

```bash
# Check container status
pct status 104  # Dev cloud
pct status 106  # Prod cloud

# View container resources
pct config 104
pct config 106
```

### Resource Usage

```bash
# View resource usage
pct exec 104 -- df -h
pct exec 104 -- free -h
pct exec 104 -- top -bn1
```

## Maintenance

### Container Updates

```bash
# Update container packages
pct exec 104 -- apt update && apt upgrade -y

# Or use Ansible
ansible-playbook playbooks/setup-dev-cloud.yml --tags common
```

### Container Restart

```bash
# Restart container
pct shutdown 104
pct start 104

# Or via Proxmox Web UI
```

### Container Rebuild

If a container needs to be rebuilt:

```bash
# Backup data first
vzdump 104 --mode snapshot

# Destroy and recreate via Terraform
cd infra/proxmox/terraform
terraform destroy -target=module.dev_cloud[0]
terraform apply -target=module.dev_cloud[0]
```

## Troubleshooting

### Container Won't Start

**Symptoms**: Container fails to start

**Solution**:
```bash
# Check container status
pct status 104

# View container logs
pct config 104

# Check Proxmox logs
journalctl -u pve-container@104
```

### Network Issues

**Symptoms**: Container cannot reach network

**Solution**:
```bash
# Check network configuration
pct config 104 | grep net

# Test network connectivity
pct exec 104 -- ping -c 3 8.8.8.8

# Check DNS
pct exec 104 -- nslookup google.com
```

### Resource Exhaustion

**Symptoms**: Container runs out of resources

**Solution**:
```bash
# Check resource usage
pct exec 104 -- df -h
pct exec 104 -- free -h

# Increase resources via Terraform
# Edit terraform.tfvars and apply
```

## Related Documentation

- [Terraform Configuration](terraform.md) - Infrastructure provisioning
- [Ansible Configuration](../configuration/ansible.md) - Container configuration
- [Environments](../deployment/environments.md) - Environment setup
- [Disaster Recovery](../operations/disaster-recovery.md) - Recovery procedures

---

**Last Updated**: 2025-12-07



