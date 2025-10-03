#!/usr/bin/env bash
set -euo pipefail

# Fix Proxmox repositories and install ARM64 firmware
# Run this script directly on the Proxmox host as root

log() { echo "[setup] $*"; }
die() { echo "[setup] ERROR: $*" >&2; exit 1; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
  die "This script must be run as root on the Proxmox host"
fi

log "Step 1: Fixing Proxmox repository configuration..."

# Disable enterprise repositories (requires subscription)
if [[ -f /etc/apt/sources.list.d/pve-enterprise.list ]]; then
  log "Disabling PVE enterprise repository..."
  mv /etc/apt/sources.list.d/pve-enterprise.list /etc/apt/sources.list.d/pve-enterprise.list.disabled 2>/dev/null || true
fi

if [[ -f /etc/apt/sources.list.d/ceph.list ]]; then
  log "Disabling Ceph enterprise repository..."
  mv /etc/apt/sources.list.d/ceph.list /etc/apt/sources.list.d/ceph.list.disabled 2>/dev/null || true
fi

# Add no-subscription repository if not already present
if ! grep -q "pve-no-subscription" /etc/apt/sources.list.d/*.list 2>/dev/null; then
  log "Adding PVE no-subscription repository..."
  echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" > /etc/apt/sources.list.d/pve-no-subscription.list
else
  log "PVE no-subscription repository already configured"
fi

log "Step 2: Updating package repositories..."
apt-get update

log "Step 3: Installing ARM64 emulation support and UEFI firmware..."
apt-get install -y \
  qemu-system-arm \
  qemu-efi-aarch64 \
  qemu-system-data

log "Step 4: Creating firmware symlinks for Proxmox compatibility..."
mkdir -p /usr/share/pve-edk2-firmware

if [[ -f /usr/share/qemu-efi-aarch64/QEMU_EFI.fd ]]; then
  ln -sf /usr/share/qemu-efi-aarch64/QEMU_EFI.fd /usr/share/pve-edk2-firmware/AAVMF_CODE.fd
  log "✓ Created symlink: /usr/share/pve-edk2-firmware/AAVMF_CODE.fd"
fi

if [[ -f /usr/share/qemu-efi-aarch64/QEMU_VARS.fd ]]; then
  ln -sf /usr/share/qemu-efi-aarch64/QEMU_VARS.fd /usr/share/pve-edk2-firmware/AAVMF_VARS.fd
  log "✓ Created symlink: /usr/share/pve-edk2-firmware/AAVMF_VARS.fd"
fi

log "Step 5: Verifying installation..."
if [[ -f /usr/share/pve-edk2-firmware/AAVMF_CODE.fd ]]; then
  log "✓ ARM64 firmware successfully installed"
  log "✓ File: $(ls -lh /usr/share/pve-edk2-firmware/AAVMF_CODE.fd)"
else
  die "ARM64 firmware installation failed"
fi

log ""
log "=========================================="
log "✓ Setup complete!"
log "✓ Repository configuration fixed"
log "✓ ARM64 emulation support installed"
log "✓ You can now start ARM64 VMs"
log "=========================================="
