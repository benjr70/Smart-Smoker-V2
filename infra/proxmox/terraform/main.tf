locals {
  default_storage       = try(var.proxmox.default_storage, "")
  default_bridge        = try(var.proxmox.default_bridge, "vmbr0")
  default_dns_servers   = try(var.proxmox.dns_servers, [])
  default_search_domain = try(var.proxmox.search_domain, "")
  default_ssh_keys      = try(var.proxmox.ssh_public_keys, [])
}

module "networking" {
  source  = "./modules/networking"
  bridges = var.network_bridges
}

module "github_runner" {
  count  = var.github_runner.enabled ? 1 : 0
  source = "./environments/github-runner"

  target_node        = var.github_runner.target_node
  hostname           = var.github_runner.hostname
  description        = try(var.github_runner.description, "")
  template           = var.github_runner.template
  storage            = length(try(var.github_runner.storage, "")) > 0 ? var.github_runner.storage : local.default_storage
  disk_size          = var.github_runner.disk_size
  cpu_cores          = var.github_runner.cpu_cores
  memory_mb          = var.github_runner.memory_mb
  swap_mb            = try(var.github_runner.swap_mb, 512)
  network_bridge     = length(try(var.github_runner.network_bridge, "")) > 0 ? var.github_runner.network_bridge : local.default_bridge
  ipv4_cidr          = var.github_runner.ipv4_cidr
  gateway            = var.github_runner.gateway
  dns_servers        = length(try(var.github_runner.dns_servers, [])) > 0 ? var.github_runner.dns_servers : local.default_dns_servers
  search_domain      = length(trimspace(try(var.github_runner.search_domain, ""))) > 0 ? var.github_runner.search_domain : local.default_search_domain
  ssh_public_keys    = length(try(var.github_runner.ssh_public_keys, [])) > 0 ? var.github_runner.ssh_public_keys : local.default_ssh_keys
  initial_password   = var.github_runner.initial_password
  resource_pool      = try(var.github_runner.resource_pool, "")
  features           = try(var.github_runner.features, null)
  tags               = try(var.github_runner.tags, [])
  start_after_create = try(var.github_runner.start_after_create, true)
}

module "dev_cloud" {
  count  = var.dev_cloud.enabled ? 1 : 0
  source = "./environments/dev-cloud"

  target_node        = var.dev_cloud.target_node
  hostname           = var.dev_cloud.hostname
  description        = try(var.dev_cloud.description, "")
  template           = var.dev_cloud.template
  storage            = length(try(var.dev_cloud.storage, "")) > 0 ? var.dev_cloud.storage : local.default_storage
  disk_size          = var.dev_cloud.disk_size
  cpu_cores          = var.dev_cloud.cpu_cores
  memory_mb          = var.dev_cloud.memory_mb
  swap_mb            = try(var.dev_cloud.swap_mb, 512)
  network_bridge     = length(try(var.dev_cloud.network_bridge, "")) > 0 ? var.dev_cloud.network_bridge : local.default_bridge
  ipv4_cidr          = var.dev_cloud.ipv4_cidr
  gateway            = var.dev_cloud.gateway
  dns_servers        = length(try(var.dev_cloud.dns_servers, [])) > 0 ? var.dev_cloud.dns_servers : local.default_dns_servers
  search_domain      = length(trimspace(try(var.dev_cloud.search_domain, ""))) > 0 ? var.dev_cloud.search_domain : local.default_search_domain
  ssh_public_keys    = length(try(var.dev_cloud.ssh_public_keys, [])) > 0 ? var.dev_cloud.ssh_public_keys : local.default_ssh_keys
  initial_password   = var.dev_cloud.initial_password
  resource_pool      = try(var.dev_cloud.resource_pool, "")
  features           = try(var.dev_cloud.features, null)
  tags               = try(var.dev_cloud.tags, [])
  start_after_create = try(var.dev_cloud.start_after_create, true)
}

module "prod_cloud" {
  count  = var.prod_cloud.enabled ? 1 : 0
  source = "./environments/prod-cloud"

  target_node        = var.prod_cloud.target_node
  hostname           = var.prod_cloud.hostname
  description        = try(var.prod_cloud.description, "")
  template           = var.prod_cloud.template
  storage            = length(try(var.prod_cloud.storage, "")) > 0 ? var.prod_cloud.storage : local.default_storage
  disk_size          = var.prod_cloud.disk_size
  cpu_cores          = var.prod_cloud.cpu_cores
  memory_mb          = var.prod_cloud.memory_mb
  swap_mb            = try(var.prod_cloud.swap_mb, 512)
  network_bridge     = length(try(var.prod_cloud.network_bridge, "")) > 0 ? var.prod_cloud.network_bridge : local.default_bridge
  ipv4_cidr          = var.prod_cloud.ipv4_cidr
  gateway            = var.prod_cloud.gateway
  dns_servers        = length(try(var.prod_cloud.dns_servers, [])) > 0 ? var.prod_cloud.dns_servers : local.default_dns_servers
  search_domain      = length(trimspace(try(var.prod_cloud.search_domain, ""))) > 0 ? var.prod_cloud.search_domain : local.default_search_domain
  ssh_public_keys    = length(try(var.prod_cloud.ssh_public_keys, [])) > 0 ? var.prod_cloud.ssh_public_keys : local.default_ssh_keys
  initial_password   = var.prod_cloud.initial_password
  resource_pool      = try(var.prod_cloud.resource_pool, "")
  features           = try(var.prod_cloud.features, null)
  tags               = try(var.prod_cloud.tags, [])
  start_after_create = try(var.prod_cloud.start_after_create, true)
}

module "virtual_smoker" {
  count      = var.virtual_smoker.enabled ? 1 : 0
  source     = "./environments/virtual-smoker"
  depends_on = [module.networking]

  target_node         = var.virtual_smoker.target_node
  vm_name             = var.virtual_smoker.vm_name
  vm_id               = try(var.virtual_smoker.vm_id, null)
  description         = try(var.virtual_smoker.description, "")
  resource_pool       = try(var.virtual_smoker.resource_pool, "")
  storage             = length(try(var.virtual_smoker.storage, "")) > 0 ? var.virtual_smoker.storage : local.default_storage
  clone_template      = var.virtual_smoker.clone_template
  cpu_architecture    = try(var.virtual_smoker.cpu_architecture, "x86_64")
  cpu_cores           = var.virtual_smoker.cpu_cores
  cpu_sockets         = try(var.virtual_smoker.cpu_sockets, 1)
  cpu_type            = try(var.virtual_smoker.cpu_type, "host")
  memory_mb           = var.virtual_smoker.memory_mb
  network_bridge      = length(try(var.virtual_smoker.network_bridge, "")) > 0 ? var.virtual_smoker.network_bridge : local.default_bridge
  ipv4_cidr           = var.virtual_smoker.ipv4_cidr
  gateway             = var.virtual_smoker.gateway
  dns_servers         = length(try(var.virtual_smoker.dns_servers, [])) > 0 ? var.virtual_smoker.dns_servers : local.default_dns_servers
  search_domain       = length(trimspace(try(var.virtual_smoker.search_domain, ""))) > 0 ? var.virtual_smoker.search_domain : local.default_search_domain
  ssh_public_keys     = length(try(var.virtual_smoker.ssh_public_keys, [])) > 0 ? var.virtual_smoker.ssh_public_keys : local.default_ssh_keys
  cloud_init_user     = var.virtual_smoker.cloud_init_user
  cloud_init_password = var.virtual_smoker.cloud_init_password
  mac_address         = try(var.virtual_smoker.mac_address, "")
  vlan_tag            = try(var.virtual_smoker.vlan_tag, 0)
  tags                = try(var.virtual_smoker.tags, [])
  full_clone          = try(var.virtual_smoker.full_clone, true)
}

moved {
  from = module.github_runner[0].module.container.proxmox_lxc.this
  to   = module.github_runner[0].module.container.proxmox_virtual_environment_container.this
}

moved {
  from = module.dev_cloud[0].module.container.proxmox_lxc.this
  to   = module.dev_cloud[0].module.container.proxmox_virtual_environment_container.this
}

moved {
  from = module.prod_cloud[0].module.container.proxmox_lxc.this
  to   = module.prod_cloud[0].module.container.proxmox_virtual_environment_container.this
}

moved {
  from = module.virtual_smoker[0].module.vm.proxmox_vm_qemu.this
  to   = module.virtual_smoker[0].module.vm.proxmox_virtual_environment_vm.this
}
