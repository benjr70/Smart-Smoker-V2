# System Setup

## Overview

Base system configuration for all infrastructure containers, including SSH hardening, firewall configuration, and security measures.

## Common Role

The `common` Ansible role provides base system configuration for all containers.

### Features

1. **SSH Hardening**
   - Key-only authentication (password auth disabled)
   - Secure SSH configuration
   - Authorized keys management

2. **UFW Firewall**
   - Default incoming: DENY
   - Default outgoing: ALLOW
   - Allowed ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
   - MongoDB port: Restricted to internal network only

3. **fail2ban**
   - Brute force protection
   - SSH protection
   - Configurable ban times

4. **Base Packages**
   - Essential system packages
   - Security updates
   - System utilities

## SSH Configuration

### Key-Only Authentication

**Configuration** (`infra/proxmox/ansible/roles/common/templates/sshd_config.j2`):

```
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

### SSH Key Management

**Current Status**: SSH public keys configured in `inventory/group_vars/all.yml`

**Recommendations**:
- Keep personal SSH keys out of repository
- Use environment variables or external files for team keys
- Rotate SSH keys regularly

## Firewall Configuration

### UFW Rules

**Default Rules**:
```bash
# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# MongoDB (internal only)
ufw allow from 10.20.0.0/24 to any port 27017
```

### Firewall Management

```bash
# Check firewall status
ufw status

# Enable firewall
ufw enable

# Disable firewall (not recommended)
ufw disable

# View firewall rules
ufw status verbose
```

## fail2ban Configuration

### Protection

**Enabled on**: All servers  
**Protected services**: SSH  
**Default ban time**: Based on Debian defaults

### Configuration

**Template** (`infra/proxmox/ansible/roles/common/templates/jail.local.j2`):

```
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
```

### Management

```bash
# Check fail2ban status
systemctl status fail2ban

# View banned IPs
fail2ban-client status sshd

# Unban IP
fail2ban-client set sshd unbanip <IP_ADDRESS>
```

## Base Packages

### Installed Packages

- `curl` - HTTP client
- `wget` - File downloader
- `git` - Version control
- `vim` - Text editor
- `htop` - Process monitor
- `jq` - JSON processor
- `unzip` - Archive utility

### Package Updates

```bash
# Update package lists
apt update

# Upgrade packages
apt upgrade -y

# Or via Ansible
ansible all -m apt -a "update_cache=yes upgrade=dist" --become
```

## Security Best Practices

### SSH Security

1. **Use Strong Keys**: 4096-bit RSA or Ed25519 keys
2. **Disable Root Login**: Use sudo instead
3. **Limit Access**: Restrict SSH to specific IPs if possible
4. **Regular Rotation**: Rotate SSH keys periodically

### Firewall Security

1. **Minimal Ports**: Only open necessary ports
2. **Internal Restrictions**: Restrict sensitive ports to internal network
3. **Regular Review**: Review firewall rules periodically

### System Security

1. **Regular Updates**: Keep system packages updated
2. **Monitor Logs**: Review system logs regularly
3. **Fail2ban**: Monitor and adjust fail2ban settings
4. **Audit**: Regular security audits

## Troubleshooting

### SSH Connection Issues

**Symptoms**: Cannot connect via SSH

**Solution**:
```bash
# Check SSH service
systemctl status sshd

# Check firewall
ufw status

# Check SSH configuration
cat /etc/ssh/sshd_config | grep -E "PasswordAuthentication|PubkeyAuthentication"

# Test SSH connection
ssh -v user@host
```

### Firewall Blocking Services

**Symptoms**: Services not accessible

**Solution**:
```bash
# Check firewall rules
ufw status verbose

# Check if service is listening
netstat -tulpn | grep <PORT>

# Add firewall rule if needed
ufw allow <PORT>/tcp
```

### fail2ban Issues

**Symptoms**: Legitimate users blocked

**Solution**:
```bash
# Check banned IPs
fail2ban-client status sshd

# Unban IP
fail2ban-client set sshd unbanip <IP_ADDRESS>

# Adjust fail2ban configuration
# Edit /etc/fail2ban/jail.local
```

## Related Documentation

- [Ansible Configuration](ansible.md) - Ansible role management
- [Authentication](../security/authentication.md) - Authentication details
- [Terraform Configuration](../infrastructure/terraform.md) - Infrastructure setup

---

**Last Updated**: 2025-12-07



