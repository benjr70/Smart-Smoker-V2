output "bridges" {
  description = "Details for configured Linux bridges"
  value = {
    for name, bridge in proxmox_virtual_environment_network_linux_bridge.bridge :
    name => {
      node_name = bridge.node_name
      name      = bridge.name
      id        = bridge.id
    }
  }
}
