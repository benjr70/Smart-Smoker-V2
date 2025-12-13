output "vmid" {
  description = "VMID of the virtual smoker VM"
  value       = module.vm.vmid
}

output "name" {
  description = "Name of the virtual smoker VM"
  value       = module.vm.name
}

output "ipv4_address" {
  description = "IPv4 CIDR assigned to the virtual smoker VM"
  value       = module.vm.ipv4_address
}

output "ipv4_ip" {
  description = "IPv4 address without CIDR notation"
  value       = module.vm.ipv4_ip
}

output "gateway" {
  description = "IPv4 gateway"
  value       = module.vm.gateway
}

output "node_name" {
  description = "Proxmox node hosting the VM"
  value       = module.vm.node_name
}
