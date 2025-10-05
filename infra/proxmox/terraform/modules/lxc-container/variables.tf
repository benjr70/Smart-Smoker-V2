variable "target_node" {
  description = "Proxmox node name where the container should run"
  type        = string
}

variable "hostname" {
  description = "Container hostname"
  type        = string
}

variable "description" {
  description = "Optional description for the container"
  type        = string
  default     = ""
}

variable "template" {
  description = "Storage path of the LXC template"
  type        = string
}

variable "vm_id" {
  description = "Optional static VMID for the container"
  type        = number
  default     = null
}

variable "initial_password" {
  description = "Initial root password for the container"
  type        = string
  sensitive   = true
}

variable "unprivileged" {
  description = "Whether to create the container as unprivileged"
  type        = bool
  default     = true
}

variable "onboot" {
  description = "Start container when Proxmox node boots"
  type        = bool
  default     = true
}

variable "resource_pool" {
  description = "Optional resource pool name"
  type        = string
  default     = ""
}

variable "cpu_cores" {
  description = "Number of CPU cores assigned to the container"
  type        = number
}

variable "memory_mb" {
  description = "Memory allocation in MB"
  type        = number
}

variable "swap_mb" {
  description = "Swap allocation in MB"
  type        = number
  default     = 512
}

variable "storage" {
  description = "Proxmox storage identifier for the container rootfs"
  type        = string
}

variable "disk_size" {
  description = "Size of the root filesystem in GiB"
  type        = number
}

variable "network_bridge" {
  description = "Bridge interface to attach the container to"
  type        = string
  default     = "vmbr0"
}

variable "ipv4_cidr" {
  description = "IPv4 address with CIDR notation (e.g. 10.10.10.10/24)"
  type        = string
}

variable "gateway" {
  description = "IPv4 gateway"
  type        = string
}

variable "mac_address" {
  description = "Optional static MAC address"
  type        = string
  default     = ""
}

variable "enable_firewall" {
  description = "Enable Proxmox firewall on the network interface"
  type        = bool
  default     = false
}

variable "ssh_public_keys" {
  description = "SSH public keys to install for root access"
  type        = list(string)
  default     = []
}

variable "dns_servers" {
  description = "Optional DNS servers for the container"
  type        = list(string)
  default     = []
}

variable "search_domain" {
  description = "Optional DNS search domain"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Optional Proxmox tags applied to the container"
  type        = list(string)
  default     = []
}

variable "timeout_delete" {
  description = "Timeout (seconds) allowed for container deletion"
  type        = number
  default     = 360
}

variable "features" {
  description = "Optional container features"
  type = object({
    nesting = optional(bool)
    fuse    = optional(bool)
    mount   = optional(list(string))
  })
  default = null
}

variable "start_after_create" {
  description = "Start the container after Terraform creates it"
  type        = bool
  default     = true
}

variable "timeout_create" {
  description = "Timeout (seconds) allowed for container creation"
  type        = number
  default     = 600
}

variable "timeout_update" {
  description = "Timeout (seconds) allowed for container updates"
  type        = number
  default     = 600
}
