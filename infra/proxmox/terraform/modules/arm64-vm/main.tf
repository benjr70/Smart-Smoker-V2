terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

locals {
  pool_id     = trimspace(var.resource_pool) == "" ? null : var.resource_pool
  tags        = var.tags
  dns_servers = var.dns_servers
  dns_domain  = trimspace(var.search_domain) == "" ? null : var.search_domain
  mac_address = trimspace(var.mac_address) == "" ? null : var.mac_address
  vlan_id     = var.vlan_tag > 0 ? var.vlan_tag : null
  ssh_keys    = var.ssh_public_keys
}

resource "proxmox_virtual_environment_vm" "this" {
  node_name   = var.target_node
  vm_id       = var.vm_id
  name        = var.vm_name
  description = var.description
  pool_id     = local.pool_id
  tags        = local.tags

  bios    = var.bios
  machine = var.machine_type

  clone {
    vm_id        = var.clone_template
    full         = var.full_clone
    datastore_id = var.storage
  }

  agent {
    enabled = var.enable_qemu_agent
  }

  cpu {
    architecture = var.cpu_architecture
    cores        = var.cpu_cores
    sockets      = var.cpu_sockets
    type         = var.cpu_type
  }

  memory {
    dedicated = var.memory_mb
  }

  network_device {
    bridge      = var.network_bridge
    firewall    = var.enable_firewall
    mac_address = local.mac_address
    vlan_id     = local.vlan_id
  }

  operating_system {
    type = var.os_type
  }

  initialization {
    ip_config {
      ipv4 {
        address = var.ipv4_cidr
        gateway = var.gateway
      }
    }

    dns {
      domain  = local.dns_domain
      servers = local.dns_servers
    }

    user_account {
      username = var.cloud_init_user
      password = var.cloud_init_password
      keys     = local.ssh_keys
    }
  }

  serial_device {}

  vga {
    type = var.vga_type
  }
}
