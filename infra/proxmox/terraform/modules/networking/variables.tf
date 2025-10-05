variable "bridges" {
  description = "Map of Linux bridge definitions keyed by identifier"
  type = map(object({
    node_name  = string
    name       = string
    comment    = optional(string)
    autostart  = optional(bool)
    ports      = optional(list(string))
    mtu        = optional(number)
    vlan_aware = optional(bool)
  }))
}
