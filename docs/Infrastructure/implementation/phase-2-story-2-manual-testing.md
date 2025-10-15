# Phase 2 Story 2 - Manual Testing Guide

This guide will help you manually verify that all Phase 2 Story 2 components are working correctly.

## Prerequisites

- SSH access to Proxmox host (192.168.1.151)
- Your SSH key configured for jump host access
- GitHub access to repository settings

---

## Test 1: Container Connectivity

### 1.1 Test SSH to Each Container

From your local machine:

```bash
# Test github-runner
ssh -J root@192.168.1.151 root@10.20.0.10 'hostname && uptime'

# Test dev-cloud
ssh -J root@192.168.1.151 root@10.20.0.20 'hostname && uptime'

# Test prod-cloud
ssh -J root@192.168.1.151 root@10.20.0.30 'hostname && uptime'
```

**Expected:** All three commands should return the hostname and uptime without errors.

### 1.2 Test Network Connectivity

```bash
# Test internet connectivity from github-runner
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 8.8.8.8'

# Test DNS resolution
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 google.com'
```

**Expected:** Both commands should show 0% packet loss.

---

## Test 2: Docker Verification

### 2.1 Check Docker Installation

```bash
# On github-runner
ssh -J root@192.168.1.151 root@10.20.0.10 'docker --version && docker compose version'

# On dev-cloud
ssh -J root@192.168.1.151 root@10.20.0.20 'docker --version && docker compose version'

# On prod-cloud
ssh -J root@192.168.1.151 root@10.20.0.30 'docker --version && docker compose version'
```

**Expected:**
- Docker version 28.5.1 or newer
- Docker Compose version 2.x

### 2.2 Check Docker Service Status

```bash
# Check all three containers
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Testing $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'systemctl is-active docker'
done
```

**Expected:** Output should be `active` for all three containers.

### 2.3 Test Docker Functionality

```bash
# Run a test container
ssh -J root@192.168.1.151 root@10.20.0.10 'docker run --rm hello-world'
```

**Expected:** Should see "Hello from Docker!" message.

---

## Test 3: Node.js Verification

### 3.1 Check Node.js Installation

```bash
# On github-runner
ssh -J root@192.168.1.151 root@10.20.0.10 'node --version && npm --version'

# On dev-cloud
ssh -J root@192.168.1.151 root@10.20.0.20 'node --version && npm --version'

# On prod-cloud
ssh -J root@192.168.1.151 root@10.20.0.30 'node --version && npm --version'
```

**Expected:**
- Node.js: v20.x.x
- npm: 10.x.x

### 3.2 Test Node.js Functionality

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'node -e "console.log(\"Node.js works!\")"'
```

**Expected:** Output should be `Node.js works!`

---

## Test 4: Terraform Verification (GitHub Runner Only)

### 4.1 Check Terraform Installation

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'terraform version'
```

**Expected:** Terraform v1.13.3 or newer

### 4.2 Test Terraform Functionality

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'cd /tmp && terraform init && terraform version'
```

**Expected:** Terraform should initialize successfully.

---

## Test 5: GitHub Runner Verification

### 5.1 Check Runner Service Status

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'systemctl status actions.runner.* --no-pager | head -20'
```

**Expected:** Service should be active and running.

### 5.2 Check Runner Registration

From your local machine:

```bash
gh api repos/benjr70/Smart-Smoker-V2/actions/runners --jq '.runners[] | select(.name=="smart-smoker-runner-1") | {name: .name, status: .status, busy: .busy}'
```

**Expected:**
```json
{
  "name": "smart-smoker-runner-1",
  "status": "online",
  "busy": false
}
```

### 5.3 Check Runner Logs

```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'journalctl -u actions.runner.* -n 50 --no-pager'
```

**Expected:** Should show recent runner activity with no errors.

---

## Test 6: Security Configuration

### 6.1 Check UFW Firewall Status

```bash
# Check all containers
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Checking UFW on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'ufw status verbose | head -10'
done
```

**Expected:**
- Status: active
- SSH port 22 should be allowed
- Default incoming: deny

### 6.2 Check fail2ban Status

```bash
# Check all containers
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Checking fail2ban on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'systemctl is-active fail2ban'
done
```

**Expected:** Output should be `active` for all three containers.

### 6.3 Check SSH Configuration

```bash
# Verify password authentication is disabled
ssh -J root@192.168.1.151 root@10.20.0.10 'grep "^PasswordAuthentication" /etc/ssh/sshd_config'
```

**Expected:** Should show `PasswordAuthentication no`

---

## Test 7: Application Environment

### 7.1 Check Application Directories (Dev Cloud)

```bash
ssh -J root@192.168.1.151 root@10.20.0.20 'ls -la /opt/smart-smoker-dev'
```

**Expected:** Directory should exist with subdirectories: data, logs, backups, config

### 7.2 Check Application Directories (Prod Cloud)

```bash
ssh -J root@192.168.1.151 root@10.20.0.30 'ls -la /opt/smart-smoker-prod'
```

**Expected:** Directory should exist with subdirectories: data, logs, backups, config

### 7.3 Check MongoDB Data Directories

```bash
# Dev
ssh -J root@192.168.1.151 root@10.20.0.20 'ls -la /opt/smart-smoker-dev/data/mongodb'

# Prod
ssh -J root@192.168.1.151 root@10.20.0.30 'ls -la /opt/smart-smoker-prod/data/mongodb'
```

**Expected:** Directories should exist with proper permissions (owned by smoker user).

---

## Test 8: Ansible Verification

### 8.1 Run Ansible Ping

From the ansible directory:

```bash
cd /home/benjr70/Dev/Smart-Smoker-V2/infra/proxmox/ansible
ansible all -m ping
```

**Expected:** All containers should return `pong` (SUCCESS).

### 8.2 Run Verification Playbook

```bash
cd /home/benjr70/Dev/Smart-Smoker-V2/infra/proxmox/ansible
ansible-playbook playbooks/verify-all.yml
```

**Expected:** All tasks should pass with no failures.

---

## Test 9: GitHub Actions Self-Hosted Runner Test

### 9.1 Trigger Runner Test Workflow

From your local machine:

```bash
# Trigger the workflow manually
gh workflow run runner-test.yml

# Wait a few seconds, then check status
gh run list --workflow=runner-test.yml --limit 1
```

**Expected:** Workflow should complete successfully.

### 9.2 View Workflow Results

```bash
# Get the run ID from the previous command
gh run view <RUN_ID>
```

**Expected:** All steps should pass:
- ✅ Verify runner environment
- ✅ Verify Docker installation
- ✅ Verify Terraform installation
- ✅ Verify Node.js installation
- ✅ Test Terraform - Initialize
- ✅ Test Terraform - Validate
- ✅ Test Terraform - Plan (dry-run)
- ✅ Report success

---

## Test 10: Container Resource Usage

### 10.1 Check CPU and Memory Usage

```bash
# On github-runner
ssh -J root@192.168.1.151 root@10.20.0.10 'top -bn1 | head -20'

# Quick resource check on all containers
for ip in 10.20.0.10 10.20.0.20 10.20.0.30; do
  echo "=== Resources on $ip ==="
  ssh -J root@192.168.1.151 root@$ip 'free -h && df -h /'
done
```

**Expected:**
- Memory usage should be reasonable (< 80% used)
- Disk usage should have plenty of free space

---

## Test 11: Inter-Container Communication

### 11.1 Test Container-to-Container Connectivity

```bash
# From github-runner, ping dev-cloud
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 10.20.0.20'

# From github-runner, ping prod-cloud
ssh -J root@192.168.1.151 root@10.20.0.10 'ping -c 3 10.20.0.30'
```

**Expected:** 0% packet loss between containers.

---

## Test 12: Proxmox Network Configuration

### 12.1 Verify Bridge Configuration

```bash
ssh root@192.168.1.151 'ip addr show vmbr0 | grep "inet "'
```

**Expected:** Should show both:
- `inet 192.168.1.151/24` (external network)
- `inet 10.20.0.1/24` (container network)

### 12.2 Verify NAT Configuration

```bash
ssh root@192.168.1.151 'iptables -t nat -L POSTROUTING -n -v | grep 10.20.0.0'
```

**Expected:** Should show MASQUERADE rule for 10.20.0.0/24 network.

### 12.3 Verify IP Forwarding

```bash
ssh root@192.168.1.151 'sysctl net.ipv4.ip_forward'
```

**Expected:** `net.ipv4.ip_forward = 1`

---

## Summary Checklist

Use this checklist to track your testing progress:

- [ ] **Test 1**: SSH connectivity to all containers works
- [ ] **Test 2**: Docker installed and functional on all containers
- [ ] **Test 3**: Node.js installed and functional on all containers
- [ ] **Test 4**: Terraform installed on github-runner
- [ ] **Test 5**: GitHub runner is online and registered
- [ ] **Test 6**: UFW firewall active, fail2ban running, SSH secured
- [ ] **Test 7**: Application directories exist with proper structure
- [ ] **Test 8**: Ansible can ping and verify all containers
- [ ] **Test 9**: Self-hosted runner workflow executes successfully
- [ ] **Test 10**: Container resources are healthy
- [ ] **Test 11**: Containers can communicate with each other
- [ ] **Test 12**: Proxmox network configuration is correct

---

## Troubleshooting

### If SSH fails:
```bash
# Check container is running
ssh root@192.168.1.151 'pct list | grep -E "104|105|106"'

# Check network interface
ssh root@192.168.1.151 'pct exec 104 -- ip addr show veth0'
```

### If Docker isn't running:
```bash
ssh -J root@192.168.1.151 root@10.20.0.10 'systemctl restart docker && systemctl status docker'
```

### If GitHub runner is offline:
```bash
# Check service
ssh -J root@192.168.1.151 root@10.20.0.10 'systemctl restart actions.runner.* && systemctl status actions.runner.*'

# Check logs
ssh -J root@192.168.1.151 root@10.20.0.10 'journalctl -u actions.runner.* -n 100'
```

### If network connectivity fails:
```bash
# Check Proxmox gateway
ssh root@192.168.1.151 'ip addr show vmbr0 | grep 10.20.0.1'

# Check NAT
ssh root@192.168.1.151 'iptables -t nat -L POSTROUTING -n'

# Restart container networking
ssh root@192.168.1.151 'pct reboot 104'
```

---

## Expected Results

If all tests pass, you should see:

✅ **Infrastructure**: All 3 containers running and accessible
✅ **Software**: Docker 28.5.1, Node.js 20.x, Terraform 1.13.3
✅ **Security**: UFW active, fail2ban running, SSH hardened
✅ **GitHub Runner**: Online and accepting jobs
✅ **Network**: Full IPv4/IPv6 connectivity, inter-container communication
✅ **Environment**: Application directories ready for deployment

**Phase 2 Story 2 Status**: ✅ COMPLETE
