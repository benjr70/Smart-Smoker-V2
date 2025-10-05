variable "proxmox" {
  description = "Global Proxmox configuration and shared defaults"
  type = object({
    api_url          = string
    api_token_id     = string
    api_token_secret = string
    username         = optional(string)
    password         = optional(string)
    tls_insecure     = optional(bool)
    default_storage  = optional(string)
    default_bridge   = optional(string)
    ssh_public_keys  = optional(list(string))
    dns_servers      = optional(list(string))
    search_domain    = optional(string)
  })
}

variable "network_bridges" {
  description = "Map of Linux bridge definitions to be managed on Proxmox nodes"
  type = map(object({
    node_name  = string
    name       = string
    comment    = optional(string)
    autostart  = optional(bool)
    ports      = optional(list(string))
    mtu        = optional(number)
    vlan_aware = optional(bool)
  }))
  default = {}
}

variable "github_runner" {
  description = "Configuration for the GitHub Actions runner container"
  type = object({
    enabled          = bool
    target_node      = string
    vm_id            = optional(number)
    hostname         = string
    description      = optional(string)
    template         = string
    storage          = optional(string)
    disk_size        = number
    cpu_cores        = number
    memory_mb        = number
    swap_mb          = optional(number)
    network_bridge   = optional(string)
    ipv4_cidr        = string
    gateway          = string
    dns_servers      = optional(list(string))
    search_domain    = optional(string)
    ssh_public_keys  = optional(list(string))
    initial_password = string
    resource_pool    = optional(string)
    features = optional(object({
      nesting = optional(bool)
      fuse    = optional(bool)
      mount   = optional(list(string))
    }))
    tags               = optional(list(string))
    start_after_create = optional(bool)
  })
}

variable "dev_cloud" {
  description = "Configuration for the development cloud LXC container"
  type = object({
    enabled          = bool
    target_node      = string
    vm_id            = optional(number)
    hostname         = string
    description      = optional(string)
    template         = string
    storage          = optional(string)
    disk_size        = number
    cpu_cores        = number
    memory_mb        = number
    swap_mb          = optional(number)
    network_bridge   = optional(string)
    ipv4_cidr        = string
    gateway          = string
    dns_servers      = optional(list(string))
    search_domain    = optional(string)
    ssh_public_keys  = optional(list(string))
    initial_password = string
    resource_pool    = optional(string)
    features = optional(object({
      nesting = optional(bool)
      fuse    = optional(bool)
      mount   = optional(list(string))
    }))
    tags               = optional(list(string))
    start_after_create = optional(bool)
  })
}

variable "prod_cloud" {
  description = "Configuration for the production cloud LXC container"
  type = object({
    enabled          = bool
    target_node      = string
    vm_id            = optional(number)
    hostname         = string
    description      = optional(string)
    template         = string
    storage          = optional(string)
    disk_size        = number
    cpu_cores        = number
    memory_mb        = number
    swap_mb          = optional(number)
    network_bridge   = optional(string)
    ipv4_cidr        = string
    gateway          = string
    dns_servers      = optional(list(string))
    search_domain    = optional(string)
    ssh_public_keys  = optional(list(string))
    initial_password = string
    resource_pool    = optional(string)
    features = optional(object({
      nesting = optional(bool)
      fuse    = optional(bool)
      mount   = optional(list(string))
    }))
    tags               = optional(list(string))
    start_after_create = optional(bool)
  })
}

variable "virtual_smoker" {
  description = "Configuration for the virtual smoker VM"
  type = object({
    enabled             = bool
    target_node         = string
    vm_name             = string
    vm_id               = optional(number)
    description         = optional(string)
    resource_pool       = optional(string)
    storage             = optional(string)
    clone_template      = number
    cpu_architecture    = optional(string)
    cpu_cores           = number
    cpu_sockets         = optional(number)
    cpu_type            = optional(string)
    memory_mb           = number
    network_bridge      = optional(string)
    ipv4_cidr           = string
    gateway             = string
    dns_servers         = optional(list(string))
    search_domain       = optional(string)
    ssh_public_keys     = optional(list(string))
    cloud_init_user     = string
    cloud_init_password = string
    mac_address         = optional(string)
    vlan_tag            = optional(number)
    tags                = optional(list(string))
    full_clone          = optional(bool)
  })
}
