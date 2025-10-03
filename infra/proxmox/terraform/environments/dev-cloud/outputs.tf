output "vmid" {
  description = "VMID of the development cloud container"
  value       = module.container.vmid
}

output "hostname" {
  description = "Hostname of the development cloud container"
  value       = module.container.hostname
}

output "ipv4_address" {
  description = "IPv4 address assigned to the development cloud container"
  value       = module.container.ipv4_address
}
