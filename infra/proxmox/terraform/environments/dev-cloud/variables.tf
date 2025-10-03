variable "target_node" {
  description = "Proxmox node for the development cloud container"
  type        = string
}

variable "vm_id" {
  description = "Optional static VMID"
  type        = number
  default     = null
}

variable "hostname" {
  description = "Container hostname"
  type        = string
}

variable "description" {
  description = "Container description"
  type        = string
  default     = ""
}

variable "template" {
  description = "LXC template path"
  type        = string
}

variable "storage" {
  description = "Storage identifier"
  type        = string
}

variable "disk_size" {
  description = "Root disk size in GiB"
  type        = number
}

variable "cpu_cores" {
  description = "CPU cores"
  type        = number
}

variable "memory_mb" {
  description = "Memory in MB"
  type        = number
}

variable "swap_mb" {
  description = "Swap in MB"
  type        = number
  default     = 512
}

variable "network_bridge" {
  description = "Network bridge"
  type        = string
}

variable "ipv4_cidr" {
  description = "IPv4 CIDR"
  type        = string
}

variable "gateway" {
  description = "Gateway"
  type        = string
}

variable "dns_servers" {
  description = "DNS servers"
  type        = list(string)
  default     = []
}

variable "search_domain" {
  description = "Search domain"
  type        = string
  default     = ""
}

variable "ssh_public_keys" {
  description = "SSH keys"
  type        = list(string)
  default     = []
}

variable "initial_password" {
  description = "Initial root password"
  type        = string
  sensitive   = true
}

variable "resource_pool" {
  description = "Resource pool"
  type        = string
  default     = ""
}

variable "features" {
  description = "Container features"
  type = object({
    nesting = optional(bool)
    fuse    = optional(bool)
    mount   = optional(list(string))
  })
  default = null
}

variable "tags" {
  description = "Container tags"
  type        = list(string)
  default     = []
}

variable "enable_firewall" {
  description = "Enable Proxmox firewall"
  type        = bool
  default     = true
}

variable "start_after_create" {
  description = "Start the container after creation"
  type        = bool
  default     = true
}
