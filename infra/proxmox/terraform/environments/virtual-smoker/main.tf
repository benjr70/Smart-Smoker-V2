module "vm" {
  source = "../../modules/arm64-vm"

  target_node         = var.target_node
  vm_name             = var.vm_name
  vm_id               = var.vm_id
  description         = var.description
  resource_pool       = var.resource_pool
  clone_template      = var.clone_template
  storage             = var.storage
  cpu_architecture    = var.cpu_architecture
  cpu_cores           = var.cpu_cores
  cpu_sockets         = var.cpu_sockets
  cpu_type            = var.cpu_type
  memory_mb           = var.memory_mb
  network_bridge      = var.network_bridge
  ipv4_cidr           = var.ipv4_cidr
  gateway             = var.gateway
  dns_servers         = var.dns_servers
  search_domain       = var.search_domain
  ssh_public_keys     = var.ssh_public_keys
  cloud_init_user     = var.cloud_init_user
  cloud_init_password = var.cloud_init_password
  mac_address         = var.mac_address
  vlan_tag            = var.vlan_tag
  tags                = var.tags
  full_clone          = var.full_clone
}
