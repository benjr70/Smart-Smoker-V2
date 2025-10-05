output "name" {
  description = "VM name"
  value       = proxmox_virtual_environment_vm.this.name
}

output "vmid" {
  description = "VMID assigned to the VM"
  value       = proxmox_virtual_environment_vm.this.vm_id
}

output "ipv4_address" {
  description = "Static IPv4 CIDR"
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
  description = "Proxmox node hosting the VM"
  value       = var.target_node
}
