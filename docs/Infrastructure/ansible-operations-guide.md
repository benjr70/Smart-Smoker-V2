# Ansible Operations Guide

This guide provides operational procedures for managing Smart Smoker infrastructure using Ansible.

## Overview

Ansible is used to configure and maintain all Proxmox LXC containers with Infrastructure as Code principles. All infrastructure changes should be made through Ansible playbooks rather than manual SSH configuration.

## Infrastructure Components

### Ansible Roles

The infrastructure is managed through 7 specialized Ansible roles:

1. **common** - Base system configuration
   - SSH hardening (key-only authentication)
   - UFW firewall configuration
   - fail2ban for brute force protection
   - Base package installation

2. **docker** - Container runtime
   - Docker Engine installation
   - Docker Compose plugin
   - User permissions and daemon configuration

3. **terraform** - Infrastructure tool (GitHub runner only)
   - Terraform CLI from HashiCorp repository
   - Latest stable version

4. **nodejs** - Application runtime
   - Node.js 20 LTS from NodeSource
   - npm package manager

5. **github-runner** - CI/CD runner
   - GitHub Actions runner download & setup
   - Service configuration and registration

6. **cloud-app** - Cloud application environment
   - Application directories (`/opt/smart-smoker-{dev,prod}`)
   - MongoDB data directories
   - User/group setup

7. **virtual-device** - Virtual smoker device
   - Device directories
   - Python tools for simulation
   - Hardware mocking tools

### Inventory Structure

Servers are organized into logical groups:

- **runners**: GitHub Actions self-hosted runners
- **cloud_servers**: Dev and production cloud servers
- **devices**: Virtual smoker device for testing

See `infra/proxmox/ansible/inventory/hosts.yml` for current inventory.

## Running Ansible Playbooks

### Prerequisites

```bash
# Install Ansible
pip3 install ansible

# Install required collections
ansible-galaxy collection install community.general
ansible-galaxy collection install ansible.posix
```

### Available Playbooks

#### Master Playbook (Configure Everything)

```bash
cd infra/proxmox/ansible

# Configure all infrastructure
ansible-playbook playbooks/site.yml --extra-vars "github_runner_token=YOUR_TOKEN"
```

#### Individual Server Playbooks

```bash
# GitHub runner only
ansible-playbook playbooks/setup-github-runner.yml \
  --extra-vars "github_runner_token=YOUR_TOKEN"

# Development cloud server
ansible-playbook playbooks/setup-dev-cloud.yml

# Production cloud server
ansible-playbook playbooks/setup-prod-cloud.yml

# Virtual smoker device
ansible-playbook playbooks/setup-virtual-smoker.yml
```

#### Verification Playbook

```bash
# Verify all infrastructure is correctly configured
ansible-playbook playbooks/verify-all.yml
```

### Testing Connectivity

```bash
# Test SSH connectivity to all servers
ansible all -m ping

# Test connectivity to specific group
ansible cloud_servers -m ping
ansible runners -m ping
```

## Common Operations

### Update System Packages

```bash
# Update all servers
ansible all -m apt -a "update_cache=yes upgrade=dist" --become
```

### Restart Docker Service

```bash
# Restart Docker on all servers
ansible all -m systemd -a "name=docker state=restarted" --become
```

### Check Service Status

```bash
# Check Docker status on all servers
ansible all -m systemd -a "name=docker" --become

# Check GitHub runner status
ansible runners -m systemd -a "name=actions.runner.*" --become
```

### Run Ad-hoc Commands

```bash
# Check disk space
ansible all -m shell -a "df -h /"

# Check memory usage
ansible all -m shell -a "free -h"
```

## GitHub Runner Management

### Registering a New Runner

1. Generate a runner token from GitHub:
   - Navigate to: https://github.com/benjr70/Smart-Smoker-V2/settings/actions/runners/new
   - Click "New self-hosted runner"
   - Copy the registration token (valid for 1 hour)

2. Run the GitHub runner playbook:

```bash
ansible-playbook playbooks/setup-github-runner.yml \
  --extra-vars "github_runner_token=YOUR_NEW_TOKEN"
```

### Checking Runner Status

```bash
# Check runner service status
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'systemctl status actions.runner.* --no-pager'

# Check runner logs
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'journalctl -u actions.runner.* -n 50'

# Check runner status via GitHub API
gh api repos/benjr70/Smart-Smoker-V2/actions/runners \
  --jq '.runners[] | select(.name=="smart-smoker-runner-1")'
```

### Removing a Runner

```bash
# Stop the runner service
ansible runners -m systemd -a "name=actions.runner.* state=stopped" --become

# Remove runner from GitHub (via web UI or API)
gh api -X DELETE repos/benjr70/Smart-Smoker-V2/actions/runners/RUNNER_ID
```

## Security Best Practices

### SSH Key Management

**Current Status**: SSH public keys are configured in `inventory/group_vars/all.yml`

**Recommendations**:
- Keep personal SSH keys out of the repository
- Use environment variables or external files for team keys
- Rotate SSH keys regularly

### Secrets Management

- Never commit sensitive values to the repository
- Use `--extra-vars` for sensitive data like GitHub tokens
- Consider using Ansible Vault for encrypted variables

### Firewall Rules

Default UFW configuration:
- **Default incoming**: DENY
- **Default outgoing**: ALLOW
- **Allowed ports**: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **MongoDB port**: Restricted to internal network only

### fail2ban Configuration

- **Enabled on**: All servers
- **Protected services**: SSH
- **Default ban time**: Based on Debian defaults
- **Recommendation**: Consider stricter settings for production

## Troubleshooting

### SSH Connection Issues

```bash
# Test SSH connectivity
ansible all -m ping -vvv

# Manually test SSH
ssh -J root@192.168.1.151 root@10.20.0.10

# Check SSH service status
ansible all -m systemd -a "name=sshd" --become
```

### Ansible Playbook Failures

```bash
# Run playbook in check mode (dry run)
ansible-playbook playbooks/site.yml --check

# Run with verbose output
ansible-playbook playbooks/site.yml -vvv

# Run specific tasks with tags
ansible-playbook playbooks/site.yml --tags "docker"
```

### GitHub Runner Issues

```bash
# Check runner service status
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'systemctl restart actions.runner.* && systemctl status actions.runner.*'

# View runner logs
ssh -J root@192.168.1.151 root@10.20.0.10 \
  'journalctl -u actions.runner.* -n 100'
```

### Docker Issues

```bash
# Restart Docker on all servers
ansible all -m systemd -a "name=docker state=restarted" --become

# Check Docker status
ansible all -m shell -a "docker ps"
```

## CI/CD Integration

### Automated Ansible Validation

All Ansible code is validated in CI/CD via `.github/workflows/ansible-lint.yml`:
- ansible-lint on all playbooks and roles
- Syntax validation
- Inventory verification

### Future: Automated Ansible Execution

After bootstrap, Ansible can be executed automatically via GitHub Actions on infrastructure changes. This requires:
1. Dedicated automation SSH key
2. GitHub Actions workflow for Ansible execution
3. Secure secrets management in GitHub

## Best Practices

1. **Idempotency**: All playbooks are designed to be run multiple times safely
2. **Check Mode**: Test changes with `--check` before applying
3. **Verification**: Always run `verify-all.yml` after infrastructure changes
4. **Version Control**: Commit all Ansible changes to git
5. **Documentation**: Update this guide when adding new roles or playbooks

## Directory Structure

```
infra/proxmox/ansible/
├── ansible.cfg                    # Ansible configuration
├── inventory/
│   ├── hosts.yml                  # Server inventory
│   ├── group_vars/                # Group variables
│   │   ├── all.yml                # Common variables
│   │   ├── runners.yml            # Runner-specific vars
│   │   ├── cloud_servers.yml      # Cloud server vars
│   │   └── devices.yml            # Device vars
│   └── host_vars/                 # Host-specific variables
├── roles/                         # Ansible roles (7 total)
│   ├── common/
│   ├── docker/
│   ├── terraform/
│   ├── nodejs/
│   ├── github-runner/
│   ├── cloud-app/
│   └── virtual-device/
├── playbooks/                     # Ansible playbooks
│   ├── site.yml                   # Master playbook
│   ├── setup-github-runner.yml
│   ├── setup-dev-cloud.yml
│   ├── setup-prod-cloud.yml
│   ├── setup-virtual-smoker.yml
│   └── verify-all.yml             # Verification playbook
└── README.md                      # Quick reference
```

## References

- [Ansible Best Practices](https://docs.ansible.com/ansible/latest/user_guide/playbooks_best_practices.html)
- [Infrastructure Testing Guide](./infrastructure-testing-guide.md)
- [Terraform Setup Guide](./terraform-setup-guide.md)
- [Secrets Management Guide](./secrets-management-guide.md)
