output "container_ip" {
  description = "The IP address of the created LXC container"
  value       = proxmox_lxc.container.network[0].ip
}

output "container_hostname" {
  description = "The hostname of the created LXC container"
  value       = proxmox_lxc.container.hostname
}
