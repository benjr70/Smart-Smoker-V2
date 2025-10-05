variable "target_node" {
  description = "Proxmox node for the virtual smoker VM"
  type        = string
}

variable "vm_name" {
  description = "VM name"
  type        = string
}

variable "vm_id" {
  description = "Optional static VMID"
  type        = number
  default     = null
}

variable "description" {
  description = "VM description"
  type        = string
  default     = ""
}

variable "resource_pool" {
  description = "Resource pool"
  type        = string
  default     = ""
}

variable "clone_template" {
  description = "VMID of the template to clone"
  type        = number
}

variable "storage" {
  description = "Storage identifier"
  type        = string
}

variable "cpu_cores" {
  description = "CPU cores"
  type        = number
}

variable "cpu_sockets" {
  description = "CPU sockets"
  type        = number
  default     = 1
}

variable "cpu_architecture" {
  description = "CPU architecture (x86_64 or aarch64)"
  type        = string
  default     = "x86_64"
}

variable "cpu_type" {
  description = "CPU type"
  type        = string
  default     = "host"
}

variable "memory_mb" {
  description = "Memory in MB"
  type        = number
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

variable "cloud_init_user" {
  description = "Cloud-init username"
  type        = string
}

variable "cloud_init_password" {
  description = "Cloud-init password"
  type        = string
  sensitive   = true
}

variable "mac_address" {
  description = "MAC address"
  type        = string
  default     = ""
}

variable "vlan_tag" {
  description = "VLAN tag"
  type        = number
  default     = 0
}

variable "tags" {
  description = "VM tags"
  type        = list(string)
  default     = []
}

variable "full_clone" {
  description = "Perform a full clone"
  type        = bool
  default     = true
}

