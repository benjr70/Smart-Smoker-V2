#!/usr/bin/env bash
set -euo pipefail

# Creates an Ubuntu 22.04 cloud-init template suitable for cloning with Terraform.
# Run on a Proxmox VE host (root or sudo). Override defaults via environment vars.

# --- configuration -----------------------------------------------------------
: "${TEMPLATE_NAME:=ubuntu-22.04-arm64-template}" # Name shown in Proxmox UI
: "${VMID:=9000}"                                 # Unique VMID reserved for template
: "${IMAGE_URL:=https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img}"
: "${IMAGE_DIR:=/var/lib/vz/template/iso}"       # Download location on Proxmox host
: "${STORAGE:=local-lvm}"                        # Target storage for disk + cloud-init
: "${BRIDGE:=vmbr0}"                             # Default bridge for template NIC
: "${CI_USER:=smoker}"                           # Default cloud-init user
: "${CI_PASSWORD:=ChangeMeNow!}"                 # Default cloud-init password (rotate!)

# --- helper functions --------------------------------------------------------
log() { echo "[template] $*"; }

die() {
  echo "[template] ERROR: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || die "Required command '$1' not found"
}

# --- pre-flight checks -------------------------------------------------------
require wget
require qm

if [[ $EUID -ne 0 ]]; then
  die "Run as root or via sudo on the Proxmox host"
fi

if qm status "$VMID" >/dev/null 2>&1; then
  die "VMID $VMID already exists. Pick a different VMID or remove the old VM"
fi

mkdir -p "$IMAGE_DIR"
IMAGE_PATH="$IMAGE_DIR/$(basename "$IMAGE_URL")"

# --- download image ----------------------------------------------------------
if [[ -f "$IMAGE_PATH" ]]; then
  log "Image already present at $IMAGE_PATH"
else
  log "Downloading Ubuntu cloud image"
  wget -O "$IMAGE_PATH" "$IMAGE_URL"
fi

# --- create base VM ----------------------------------------------------------
log "Creating base VM $VMID ($TEMPLATE_NAME)"
qm create "$VMID" \
  --name "$TEMPLATE_NAME" \
  --memory 2048 \
  --cores 2 \
  --sockets 1 \
  --cpu host \
  --net0 "virtio,bridge=$BRIDGE" \
  --scsihw virtio-scsi-pci \
  --serial0 socket \
  --vga serial0 \
  --agent enabled=1 \
  --bios ovmf \
  --machine q35 \
  --ciuser "$CI_USER" \
  --cipassword "$CI_PASSWORD" \
  --ipconfig0 "ip=dhcp"

log "Importing cloud image into $STORAGE"
qm importdisk "$VMID" "$IMAGE_PATH" "$STORAGE" --format qcow2

log "Attaching disks"
qm set "$VMID" --scsi0 "$STORAGE:vm-$VMID-disk-0,ssd=1,discard=on"
qm set "$VMID" --ide2 "$STORAGE:cloudinit"
qm set "$VMID" --efidisk0 "$STORAGE:0,pre-enrolled-keys=1"
qm set "$VMID" --boot order=scsi0

log "Converting VM $VMID into template"
qm template "$VMID"

log "Template ready: $TEMPLATE_NAME (VMID $VMID)"
log "Update terraform.tfvars with clone_template = \"$VMID\""

