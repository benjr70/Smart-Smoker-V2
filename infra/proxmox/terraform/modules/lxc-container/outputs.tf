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

output "ipv4_ip" {
  description = "IPv4 address without CIDR notation"
  value       = split("/", var.ipv4_cidr)[0]
}

output "gateway" {
  description = "IPv4 gateway"
  value       = var.gateway
}

output "node_name" {
  description = "Proxmox node hosting the container"
  value       = var.target_node
}
