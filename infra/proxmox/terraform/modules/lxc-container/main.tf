terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

locals {
  dns_servers  = var.dns_servers
  tags         = var.tags
  pool_id      = trimspace(var.resource_pool) == "" ? null : var.resource_pool
  mac_address  = trimspace(var.mac_address) == "" ? null : var.mac_address
  ipv4_address = var.ipv4_cidr
  ipv4_gateway = var.gateway
  ssh_keys     = var.ssh_public_keys
}

resource "proxmox_virtual_environment_container" "this" {
  timeout_create = var.timeout_create
  timeout_update = var.timeout_update
  timeout_delete = var.timeout_delete

  node_name     = var.target_node
  vm_id         = var.vm_id
  description   = var.description
  pool_id       = local.pool_id
  start_on_boot = var.onboot
  started       = var.start_after_create
  unprivileged  = var.unprivileged
  tags          = local.tags

  dynamic "features" {
    for_each = var.features == null ? [] : [var.features]
    content {
      nesting = try(features.value.nesting, null)
      fuse    = try(features.value.fuse, null)
      mount   = try(features.value.mount, null)
    }
  }

  cpu {
    cores = var.cpu_cores
  }

  memory {
    dedicated = var.memory_mb
    swap      = var.swap_mb
  }

  disk {
    datastore_id = var.storage
    size         = var.disk_size
  }

  operating_system {
    template_file_id = var.template
    type             = var.os_type
  }

  network_interface {
    name        = "veth0"
    bridge      = var.network_bridge
    firewall    = var.enable_firewall
    mac_address = local.mac_address
  }

  initialization {
    hostname = var.hostname

    dns {
      domain  = trimspace(var.search_domain) == "" ? null : var.search_domain
      servers = local.dns_servers
    }

    ip_config {
      ipv4 {
        address = local.ipv4_address
        gateway = local.ipv4_gateway
      }
    }

    user_account {
      password = var.initial_password
      keys     = local.ssh_keys
    }
  }
}
