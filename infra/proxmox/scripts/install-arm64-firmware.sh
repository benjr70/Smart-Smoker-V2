#!/usr/bin/env bash
set -euo pipefail

# Install ARM64 firmware and QEMU support on Proxmox VE host
# Run this script directly on the Proxmox host as root

log() { echo "[arm64-setup] $*"; }
die() { echo "[arm64-setup] ERROR: $*" >&2; exit 1; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
  die "This script must be run as root on the Proxmox host"
fi

log "Installing ARM64 emulation support and UEFI firmware..."

# Update package list
log "Updating package repositories..."
apt-get update

# Install QEMU ARM64 emulation support
log "Installing QEMU ARM64 packages..."
apt-get install -y \
  qemu-system-arm \
  qemu-efi-aarch64 \
  qemu-system-data

log "Checking installed firmware files..."
if [[ -f /usr/share/qemu-efi-aarch64/QEMU_EFI.fd ]]; then
  log "✓ ARM64 UEFI firmware found at /usr/share/qemu-efi-aarch64/QEMU_EFI.fd"
else
  log "⚠ ARM64 UEFI firmware not found at expected location"
fi

# Create symlink if needed for pve-edk2-firmware location
log "Creating firmware symlinks for Proxmox compatibility..."
mkdir -p /usr/share/pve-edk2-firmware

if [[ -f /usr/share/qemu-efi-aarch64/QEMU_EFI.fd ]]; then
  ln -sf /usr/share/qemu-efi-aarch64/QEMU_EFI.fd /usr/share/pve-edk2-firmware/AAVMF_CODE.fd
  log "✓ Created symlink: /usr/share/pve-edk2-firmware/AAVMF_CODE.fd"
fi

if [[ -f /usr/share/qemu-efi-aarch64/QEMU_VARS.fd ]]; then
  ln -sf /usr/share/qemu-efi-aarch64/QEMU_VARS.fd /usr/share/pve-edk2-firmware/AAVMF_VARS.fd
  log "✓ Created symlink: /usr/share/pve-edk2-firmware/AAVMF_VARS.fd"
fi

log "Verifying installation..."
if [[ -f /usr/share/pve-edk2-firmware/AAVMF_CODE.fd ]]; then
  log "✓ ARM64 firmware successfully installed"
  log "✓ File: $(ls -lh /usr/share/pve-edk2-firmware/AAVMF_CODE.fd)"
else
  die "ARM64 firmware installation failed"
fi

log "ARM64 emulation support installed successfully!"
log "You can now start ARM64 VMs on this Proxmox host"
