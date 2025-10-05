locals {
  proxmox_api_token = length(trimspace(var.proxmox.api_token_id)) > 0 && length(trimspace(var.proxmox.api_token_secret)) > 0 ? format("%s=%s", trimspace(var.proxmox.api_token_id), trimspace(var.proxmox.api_token_secret)) : ""
  proxmox_username  = trimspace(try(var.proxmox.username, ""))
  proxmox_password  = try(var.proxmox.password, "")
  proxmox_use_token = local.proxmox_api_token != "" && local.proxmox_username == ""
}

provider "proxmox" {
  endpoint = var.proxmox.api_url
  insecure = try(var.proxmox.tls_insecure, false)

  api_token = local.proxmox_use_token ? local.proxmox_api_token : null
  username  = local.proxmox_use_token ? null : (local.proxmox_username != "" ? local.proxmox_username : null)
  password  = local.proxmox_use_token ? null : (local.proxmox_username != "" ? local.proxmox_password : null)
}
