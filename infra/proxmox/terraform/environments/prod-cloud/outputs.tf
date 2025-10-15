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

output "ipv4_ip" {
  description = "IPv4 address without CIDR notation"
  value       = module.container.ipv4_ip
}

output "gateway" {
  description = "IPv4 gateway"
  value       = module.container.gateway
}

output "node_name" {
  description = "Proxmox node hosting the container"
  value       = module.container.node_name
}
