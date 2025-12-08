# Infrastructure Testing & Verification Guide

This guide provides procedures for testing and verifying Smart Smoker infrastructure deployments.

## Overview

Infrastructure testing ensures that all Proxmox containers are properly configured, secured, and operational. These tests should be run after any infrastructure changes or deployments.

## Current Infrastructure

### LXC Containers

| Container | ID | Resources | IP Address | Purpose |
|-----------|----|-----------|-----------| --------|
| github-runner | 104 | 2 CPU, 4GB RAM, 50GB | 10.20.0.10 | Self-hosted GitHub Actions runner |
| smart-smoker-dev-cloud | 105 | 2 CPU, 4GB RAM, 20GB | 10.20.0.20 | Development cloud environment |
| smart-smoker-cloud-prod | 106 | 4 CPU, 8GB RAM, 40GB | 10.20.0.30 | Production cloud environment |

### Network Configuration

| Network | CIDR | Purpose |
|---------|------|---------|
| vmbr0 | 192.168.1.0/24 | External network |
| vmbr0 (secondary) | 10.20.0.0/24 | Container internal network |
| vmbr1 | 10.30.0.0/24 | Isolated network for virtual devices |

**Proxmox Host**: 192.168.1.151

## Quick Verification

### Automated Verification

The fastest way to verify infrastructure:

```bash
cd infra/proxmox/ansible
ansible-playbook playbooks/verify-all.yml
```

This playbook checks:
- Docker installation and status
- UFW firewall configuration
- fail2ban service status
- Docker and Node.js versions
- GitHub runner configuration (if applicable)
- Application directories

### Quick Connectivity Test

```bash
# Test SSH connectivity to all servers
cd infra/proxmox/ansible
ansible all -m ping
```

Expected: All servers return `pong` with SUCCESS status.

## Detailed Testing Procedures

### Test 1: Container Connectivity

#### SSH to Each Container

Test SSH jump host connectivity through Proxmox:

```bash
# Test github-runner
ssh -J root@192.168.1.151 root@10.20.0.10 'hostname && uptime'

# Test dev-cloud
ssh -J root@192.168.1.151 root@10.20.0.20 'hostname && uptime'

# Test prod-cloud
ssh -J root@192.168.1.151 root@10.20.0.30 'hostname && uptime'
```

**Expected**: All commands return hostname and uptime without errors.

#### Network Connectivity

```bash
# Test internet connectivity
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 8.8.8.8'

# Test DNS resolution
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 google.com'
```

**Expected**: 0% packet loss for both tests.

### Test 2: Docker Verification

#### Check Docker Installation

```bash
# Check all containers
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Testing Docker on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'docker --version && docker compose version'
done
```

**Expected**:
- Docker version 28.5.1 or newer
- Docker Compose version 2.x

#### Check Docker Service Status

```bash
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Testing $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'systemctl is-active docker'
done
```

**Expected**: Output is `active` for all containers.

#### Test Docker Functionality

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'docker run --rm hello-world'
```

**Expected**: "Hello from Docker!" message appears.

### Test 3: Node.js Verification

#### Check Node.js Installation

```bash
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Node.js on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'node --version && npm --version'
done
```

**Expected**:
- Node.js: v20.x.x
- npm: 10.x.x

#### Test Node.js Functionality

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'node -e "console.log(\"Node.js works!\")"'
```

**Expected**: Output is `Node.js works!`

### Test 4: Terraform Verification (GitHub Runner Only)

#### Check Terraform Installation

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'terraform version'
```

**Expected**: Terraform v1.13.3 or newer

#### Test Terraform Functionality

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'cd /tmp && terraform init'
```

**Expected**: Terraform initializes successfully.

### Test 5: GitHub Runner Verification

#### Check Runner Service Status

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'systemctl status actions.runner.* --no-pager | head -20'
```

**Expected**: Service is `active (running)`.

#### Check Runner Registration

```bash
gh api repos/benjr70/Smart-Smoker-V2/actions/runners \
  --jq '.runners[] | select(.name=="smart-smoker-runner-1") | {name, status, busy}'
```

**Expected**:
```json
{
  "name": "smart-smoker-runner-1",
  "status": "online",
  "busy": false
}
```

#### Check Runner Logs

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'journalctl -u actions.runner.* -n 50 --no-pager'
```

**Expected**: Recent activity with no errors.

### Test 6: Security Configuration

#### UFW Firewall Status

```bash
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Checking UFW on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'ufw status verbose | head -10'
done
```

**Expected**:
- Status: `active`
- SSH port 22: `ALLOW`
- Default incoming: `deny`
- Default outgoing: `allow`

#### fail2ban Status

```bash
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Checking fail2ban on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'systemctl is-active fail2ban'
done
```

**Expected**: Output is `active` for all containers.

#### SSH Configuration

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'grep "^PasswordAuthentication" /etc/ssh/sshd_config'
```

**Expected**: `PasswordAuthentication no`

### Test 7: Application Environment

#### Dev Cloud Directories

```bash
ssh -J root@192.168.1.151 root@10.20.0.20 'ls -la /opt/smart-smoker-dev'
```

**Expected**: Directory exists with subdirectories: `data`, `logs`, `backups`, `config`

#### Prod Cloud Directories

```bash
ssh -J root@192.168.1.151 root@10.20.0.30 'ls -la /opt/smart-smoker-prod'
```

**Expected**: Directory exists with subdirectories: `data`, `logs`, `backups`, `config`

#### MongoDB Data Directories

```bash
# Dev
ssh -J root@192.168.1.151 root@10.20.0.20 'ls -la /opt/smart-smoker-dev/data/mongodb'

# Prod
ssh -J root@192.168.1.151 root@10.20.0.30 'ls -la /opt/smart-smoker-prod/data/mongodb'
```

**Expected**: Directories exist with proper permissions (owned by `smoker` user).

### Test 8: Container Resource Usage

#### Check CPU and Memory

```bash
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Resources on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'free -h && df -h /'
done
```

**Expected**:
- Memory usage < 80% under normal load
- Disk usage has adequate free space
- No swap usage under normal conditions

### Test 9: Inter-Container Communication

#### Container-to-Container Connectivity

```bash
# From github-runner, ping dev-cloud
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 10.20.0.20'

# From github-runner, ping prod-cloud
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 10.20.0.30'
```

**Expected**: 0% packet loss between containers.

### Test 10: Proxmox Network Configuration

#### Verify Bridge Configuration

```bash
ssh root@192.168.1.151 'ip addr show vmbr0 | grep "inet "'
```

**Expected**: Shows both:
- `inet 192.168.1.151/24` (external network)
- `inet 10.20.0.1/24` (container network)

#### Verify NAT Configuration

```bash
ssh root@192.168.1.151 'iptables -t nat -L POSTROUTING -n -v | grep 10.20.0.0'
```

**Expected**: MASQUERADE rule for 10.20.0.0/24 network.

#### Verify IP Forwarding

```bash
ssh root@192.168.1.151 'sysctl net.ipv4.ip_forward'
```

**Expected**: `net.ipv4.ip_forward = 1`

## Troubleshooting

### SSH Connection Failures

**Problem**: Cannot connect to container via SSH jump host

**Solutions**:

```bash
# Check container is running
ssh root@192.168.1.151 'pct list | grep -E "104|105|106"'

# Check network interface
ssh root@192.168.1.151 'pct exec 104 -- ip addr show'

# Restart container if needed
ssh root@192.168.1.151 'pct reboot 104'
```

### Docker Service Not Running

**Problem**: Docker service is inactive

**Solution**:

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'systemctl restart docker && systemctl status docker'
```

### GitHub Runner Offline

**Problem**: Runner shows as offline in GitHub

**Solutions**:

```bash
# Restart runner service
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'systemctl restart actions.runner.*'

# Check service status
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'systemctl status actions.runner.* --no-pager'

# View recent logs
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'journalctl -u actions.runner.* -n 100'
```

### Network Connectivity Issues

**Problem**: Containers cannot reach internet

**Solutions**:

```bash
# Check Proxmox gateway
ssh root@192.168.1.151 'ip addr show vmbr0 | grep 10.20.0.1'

# Check NAT rules
ssh root@192.168.1.151 'iptables -t nat -L POSTROUTING -n'

# Verify IP forwarding
ssh root@192.168.1.151 'sysctl net.ipv4.ip_forward'

# Restart container networking
ssh root@192.168.1.151 'pct reboot 104'
```

### UFW Blocks Required Ports

**Problem**: Firewall blocking necessary connections

**Solutions**:

```bash
# Check current UFW rules
ssh -J root@192.168.1.151 root@10.20.0.10 'ufw status verbose'

# Allow specific port
ssh -J root@192.168.1.151 root@10.20.0.10 'ufw allow 8080/tcp'

# Reload firewall
ssh -J root@192.168.1.151 root@10.20.0.10 'ufw reload'
```

## Testing Checklist

Use this checklist after infrastructure changes:

- [ ] SSH connectivity to all containers works
- [ ] Docker installed and functional on all containers
- [ ] Node.js installed and functional on all containers
- [ ] Terraform installed on github-runner
- [ ] GitHub runner is online and registered
- [ ] UFW firewall active on all containers
- [ ] fail2ban running on all containers
- [ ] SSH hardened (password auth disabled)
- [ ] Application directories exist with proper structure
- [ ] Ansible verification playbook passes
- [ ] Container resources are healthy (CPU, memory, disk)
- [ ] Containers can communicate with each other
- [ ] Proxmox network configuration is correct
- [ ] NAT and IP forwarding configured

## Automated Testing

### CI/CD Workflows

The following GitHub Actions workflows provide automated testing:

- **ansible-lint.yml**: Validates Ansible syntax and best practices
- **terraform-validate.yml**: Validates Terraform configuration
- **runner-test.yml**: Tests self-hosted runner capabilities

### Ansible Verification Playbook

The `verify-all.yml` playbook provides automated verification:

```bash
cd infra/proxmox/ansible
ansible-playbook playbooks/verify-all.yml
```

This checks:
- Docker installation and status
- UFW and fail2ban services
- Docker and Node.js versions
- Application directories
- GitHub runner configuration

## Performance Monitoring

### Resource Usage

```bash
# Monitor real-time resource usage
ssh -J root@192.168.1.151 root@10.20.0.10 'top -bn1 | head -20'

# Check system load
ssh -J root@192.168.1.151 root@10.20.0.10 'uptime'

# Check disk I/O
ssh -J root@192.168.1.151 root@10.20.0.10 'iostat -x 1 5'
```

### Network Performance

```bash
# Test network throughput between containers
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'ping -c 10 -i 0.2 10.20.0.20 | tail -1'
```

## References

- [Ansible Configuration](../configuration/ansible.md)
- [Terraform Configuration](../infrastructure/terraform.md)
- [Disaster Recovery Guide](./disaster-recovery-guide.md)
- [Secrets Management Guide](./secrets-management-guide.md)
