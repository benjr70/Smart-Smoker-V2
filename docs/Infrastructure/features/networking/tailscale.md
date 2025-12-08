# Proxmox LXC Tailscale Fix

**Status**: ✅ RESOLVED (November 25, 2025)
**Phase 2 Story 3 Completion**: Tailscale mesh network operational

## Problem Identified

The Tailscale implementation failed on Proxmox LXC containers because they were missing the `/dev/net/tun` device required for Tailscale's WireGuard VPN.

### Root Cause
- Tailscale requires `/dev/net/tun` to create VPN tunnels
- Proxmox LXC containers don't have this device by default
- The Ansible role didn't account for this Proxmox-specific requirement

### Error Symptoms
```
tailscaled: /dev/net/tun does not exist
tailscaled: tun module not loaded nor found on disk
tailscaled: CreateTUN("tailscale0") failed
```

## Fix Applied

### 1. LXC Container Configuration (✅ COMPLETED)

Added TUN device support to all containers by modifying their Proxmox configuration files:

```bash
# Added to /etc/pve/lxc/104.conf, 105.conf, 106.conf
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir 0 0
```

**Containers affected:**
- 104 (github-runner)
- 105 (smart-smoker-dev-cloud)
- 106 (smart-smoker-cloud-prod)

### 2. SSH Keys Re-applied (✅ COMPLETED)

SSH keys were re-added to all containers after the restarts.

## Resolution Steps Taken

### Step 1: Re-run Ansible Playbooks with Tailscale Auth Key

The TUN devices were configured, and playbooks were executed:

```bash
cd /home/benjr70/Dev/Smart-Smoker-V2/infra/proxmox/ansible

# Get your Tailscale auth key from: https://login.tailscale.com/admin/settings/keys

# Option 1: Configure all infrastructure at once
ansible-playbook playbooks/site.yml \
  --extra-vars "tailscale_auth_key=YOUR_TAILSCALE_KEY_HERE"

# Option 2: Configure each server individually
ansible-playbook playbooks/setup-github-runner.yml \
  --extra-vars "tailscale_auth_key=YOUR_KEY"

ansible-playbook playbooks/setup-dev-cloud.yml \
  --extra-vars "tailscale_auth_key=YOUR_KEY"

ansible-playbook playbooks/setup-prod-cloud.yml \
  --extra-vars "tailscale_auth_key=YOUR_KEY"
```

### Step 2: Verify Tailscale is Running

```bash
# Check all containers
ssh root@192.168.1.151 'for ct in 104 105 106; do echo "=== Container $ct ==="; pct exec $ct -- tailscale status; echo ""; done'

# Or use the verification playbook
ansible-playbook playbooks/verify-tailscale.yml
```

### Step 3: Check Your Tailscale Admin Console

Visit https://login.tailscale.com/admin/machines

You should now see these machines:
- ✅ `smoker-runner` (github-runner)
- ✅ `smoker-dev-cloud` (dev environment)
- ✅ `smokecloud` (production environment)

## Important Notes

### Hostname Clarification
- **`smokecloud`** is configured as the hostname for the **NEW** production container (smart-smoker-cloud-prod)
- If you have an OLD machine also called `smokecloud`, you should:
  1. Rename the old machine in Tailscale admin, OR
  2. Change the new hostname in the Ansible configuration

To change the new production hostname:
```bash
# Edit this file
vim infra/proxmox/ansible/inventory/host_vars/smart-smoker-cloud-prod.yml

# Change this line:
tailscale_hostname: "smokecloud"

# To something like:
tailscale_hostname: "smokecloud-new"
```

### Virtual Smoker Device (10.30.0.40)
The virtual smoker device at 10.30.0.40 is currently **unreachable via SSH**. You'll need to:
1. Check if the VM is running
2. Verify network configuration
3. Configure it separately once it's accessible

## Terraform Integration (Future Enhancement)

To prevent this issue in future deployments, the Terraform configuration should be updated to automatically configure TUN devices when creating LXC containers.

**Recommended addition to Terraform LXC module:**

```hcl
# In infra/proxmox/terraform/modules/lxc-container/main.tf
resource "proxmox_lxc" "container" {
  # ... existing configuration ...

  # Enable TUN device for Tailscale support
  features {
    nesting = true
  }

  # Note: TUN device config must be added manually via Proxmox API
  # or post-provisioning script as Terraform provider doesn't support
  # lxc.cgroup2.devices.allow and lxc.mount.entry parameters
}
```

**Post-provisioning script approach** (recommended):

Create `infra/proxmox/scripts/configure-lxc-for-tailscale.sh`:

```bash
#!/bin/bash
# Configure Proxmox LXC container for Tailscale support
# Usage: ./configure-lxc-for-tailscale.sh <container_id>

CT_ID=$1

if [ -z "$CT_ID" ]; then
    echo "Usage: $0 <container_id>"
    exit 1
fi

echo "Configuring container $CT_ID for Tailscale..."

# Add TUN device configuration
if ! grep -q "lxc.cgroup2.devices.allow.*10:200" /etc/pve/lxc/$CT_ID.conf 2>/dev/null; then
    echo "lxc.cgroup2.devices.allow: c 10:200 rwm" >> /etc/pve/lxc/$CT_ID.conf
    echo "lxc.mount.entry: /dev/net dev/net none bind,create=dir 0 0" >> /etc/pve/lxc/$CT_ID.conf
    echo "✅ TUN device configured for container $CT_ID"
else
    echo "ℹ️ Container $CT_ID already configured for TUN"
fi
```

Then call this from Terraform using a `local-exec` provisioner or Ansible.

## Testing

After re-running the Ansible playbooks, test connectivity:

```bash
# Run comprehensive test suite
bash infra/proxmox/scripts/test-tailscale-mesh.sh

# Or manually test
ssh root@10.20.0.10  # github-runner
tailscale status
ping -c 3 smoker-dev-cloud
ping -c 3 smokecloud

# Test public access (production funnel)
curl https://smokecloud.tail74646.ts.net
```

## Status

- [x] Identified root cause (missing /dev/net/tun)
- [x] Fixed LXC container configurations
- [x] Re-applied SSH keys
- [x] Re-ran Ansible playbooks with Tailscale auth key
- [x] Verified all machines appear in Tailscale admin (3 containers connected)
- [x] Tested mesh network connectivity
- [ ] Test production funnel (public HTTPS access) - Future work

## References

- Proxmox LXC TUN devices: https://pve.proxmox.com/wiki/Linux_Container#pct_options
- Tailscale on LXC: https://tailscale.com/kb/1130/lxc-unprivileged
- Terraform Proxmox provider: https://registry.terraform.io/providers/Telmate/proxmox/latest/docs
