output "vmid" {
  description = "VMID of the production cloud container"
  value       = module.container.vmid
}

output "hostname" {
  description = "Hostname of the production cloud container"
  value       = module.container.hostname
}

output "ipv4_address" {
  description = "IPv4 address assigned to the production cloud container"
  value       = module.container.ipv4_address
}
