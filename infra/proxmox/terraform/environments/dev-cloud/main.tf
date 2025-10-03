module "container" {
  source = "../../modules/lxc-container"

  target_node        = var.target_node
  vm_id              = var.vm_id
  hostname           = var.hostname
  description        = var.description
  template           = var.template
  storage            = var.storage
  disk_size          = var.disk_size
  cpu_cores          = var.cpu_cores
  memory_mb          = var.memory_mb
  swap_mb            = var.swap_mb
  network_bridge     = var.network_bridge
  ipv4_cidr          = var.ipv4_cidr
  gateway            = var.gateway
  dns_servers        = var.dns_servers
  search_domain      = var.search_domain
  ssh_public_keys    = var.ssh_public_keys
  initial_password   = var.initial_password
  resource_pool      = var.resource_pool
  features           = var.features
  tags               = var.tags
  enable_firewall    = var.enable_firewall
  start_after_create = var.start_after_create
}
