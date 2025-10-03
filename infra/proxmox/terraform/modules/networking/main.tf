terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

locals {
  bridge_defaults = {
    autostart  = true
    ports      = []
    mtu        = null
    vlan_aware = false
    comment    = null
  }
}

resource "proxmox_virtual_environment_network_linux_bridge" "bridge" {
  for_each = var.bridges

  node_name  = each.value.node_name
  name       = each.value.name
  autostart  = try(each.value.autostart, local.bridge_defaults.autostart)
  vlan_aware = try(each.value.vlan_aware, local.bridge_defaults.vlan_aware)
  comment    = trimspace(try(each.value.comment, "")) == "" ? local.bridge_defaults.comment : trimspace(each.value.comment)
  mtu        = try(each.value.mtu, local.bridge_defaults.mtu)
  ports      = length(try(each.value.ports, local.bridge_defaults.ports)) > 0 ? each.value.ports : local.bridge_defaults.ports
}
