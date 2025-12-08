# Network Configuration

## Overview

Network configuration for Smart Smoker V2 infrastructure, including network bridges, IP addressing, DNS, and connectivity.

## Network Bridges

### vmbr0 (Primary Network)

**Network**: 10.20.0.0/24  
**Purpose**: Primary network for all infrastructure containers

**IP Assignments**:
- GitHub Runner: 10.20.0.10/24
- Dev Cloud: 10.20.0.20/24
- Prod Cloud: 10.20.0.30/24

### vmbr1 (Isolated Network)

**Network**: 10.30.0.0/24  
**Purpose**: Isolated network for virtual device testing

**IP Assignments**:
- Virtual Smoker Device: 10.30.0.40/24

## IP Addressing

### Static IP Configuration

All containers use static IP addresses configured via Terraform:

```hcl
network {
  name   = "eth0"
  bridge = "vmbr0"
  ip     = "10.20.0.20/24"
  gw     = "10.20.0.1"
}
```

### DNS Configuration

**DNS Servers**: Configured via Terraform or Ansible

```yaml
dns_servers:
  - 10.0.0.1
  - 10.0.0.2
search_domain: smoker.local
```

## Network Connectivity

### Internal Network

All containers can communicate via:
- **Proxmox Bridge**: Direct container-to-container communication
- **Tailscale Mesh**: Secure mesh networking

### External Access

- **Development**: Internal Tailscale access only
- **Production**: Public access via Tailscale funnel

## Network Troubleshooting

### Connectivity Issues

```bash
# Test network connectivity
ping -c 3 8.8.8.8

# Test DNS
nslookup google.com

# Check network interface
ip addr show

# Check routing
ip route show
```

### Container Network

```bash
# Check container network config
pct config 104 | grep net

# Test container connectivity
pct exec 104 -- ping -c 3 10.20.0.1

# Check container DNS
pct exec 104 -- nslookup google.com
```

### Bridge Configuration

```bash
# Check bridge status
ip link show vmbr0

# Check bridge members
bridge link show

# View bridge configuration
cat /etc/network/interfaces
```

## Related Documentation

- [Tailscale Configuration](tailscale.md) - Tailscale networking
- [Terraform Configuration](../infrastructure/terraform.md) - Network setup
- [Proxmox Configuration](../infrastructure/proxmox.md) - Container networking

---

**Last Updated**: 2025-12-07



