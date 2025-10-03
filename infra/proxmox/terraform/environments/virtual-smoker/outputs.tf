output "vmid" {
  description = "VMID of the virtual smoker VM"
  value       = module.vm.vmid
}

output "name" {
  description = "Name of the virtual smoker VM"
  value       = module.vm.name
}

output "ipv4_address" {
  description = "IPv4 address assigned to the virtual smoker VM"
  value       = module.vm.ipv4_address
}
