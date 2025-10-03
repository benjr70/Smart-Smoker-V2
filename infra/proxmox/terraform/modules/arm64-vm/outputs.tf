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
