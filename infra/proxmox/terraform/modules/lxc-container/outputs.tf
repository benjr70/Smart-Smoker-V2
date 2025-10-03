output "id" {
  description = "Internal resource ID of the container"
  value       = proxmox_virtual_environment_container.this.id
}

output "vmid" {
  description = "VMID assigned to the container"
  value       = proxmox_virtual_environment_container.this.vm_id
}

output "hostname" {
  description = "Container hostname"
  value       = var.hostname
}

output "ipv4_address" {
  description = "Primary IPv4 CIDR assigned to veth0"
  value       = var.ipv4_cidr
}
