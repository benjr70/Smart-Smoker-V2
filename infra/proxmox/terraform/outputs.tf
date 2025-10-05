output "github_runner" {
  description = "GitHub runner container details"
  value = var.github_runner.enabled ? {
    vmid      = module.github_runner[0].vmid
    hostname  = module.github_runner[0].hostname
    ipv4_ip   = module.github_runner[0].ipv4_ip
    ipv4_cidr = module.github_runner[0].ipv4_address
    gateway   = module.github_runner[0].gateway
    node      = module.github_runner[0].node_name
  } : null
}

output "dev_cloud" {
  description = "Development cloud container details"
  value = var.dev_cloud.enabled ? {
    vmid      = module.dev_cloud[0].vmid
    hostname  = module.dev_cloud[0].hostname
    ipv4_ip   = module.dev_cloud[0].ipv4_ip
    ipv4_cidr = module.dev_cloud[0].ipv4_address
    gateway   = module.dev_cloud[0].gateway
    node      = module.dev_cloud[0].node_name
  } : null
}

output "prod_cloud" {
  description = "Production cloud container details"
  value = var.prod_cloud.enabled ? {
    vmid      = module.prod_cloud[0].vmid
    hostname  = module.prod_cloud[0].hostname
    ipv4_ip   = module.prod_cloud[0].ipv4_ip
    ipv4_cidr = module.prod_cloud[0].ipv4_address
    gateway   = module.prod_cloud[0].gateway
    node      = module.prod_cloud[0].node_name
  } : null
}

output "virtual_smoker" {
  description = "Virtual smoker VM details"
  value = var.virtual_smoker.enabled ? {
    vmid      = module.virtual_smoker[0].vmid
    name      = module.virtual_smoker[0].name
    ipv4_ip   = module.virtual_smoker[0].ipv4_ip
    ipv4_cidr = module.virtual_smoker[0].ipv4_address
    gateway   = module.virtual_smoker[0].gateway
    node      = module.virtual_smoker[0].node_name
  } : null
}
