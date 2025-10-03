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
  description = "Optional description"
  type        = string
  default     = ""
}

variable "target_node" {
  description = "Proxmox node to run the VM"
  type        = string
}

variable "resource_pool" {
  description = "Optional resource pool"
  type        = string
  default     = ""
}

variable "clone_template" {
  description = "Identifier of the template VM to clone"
  type        = number
}

variable "full_clone" {
  description = "Perform a full clone instead of linked clone"
  type        = bool
  default     = true
}

variable "onboot" {
  description = "Start VM on host boot"
  type        = bool
  default     = true
}

variable "enable_qemu_agent" {
  description = "Enable QEMU guest agent"
  type        = bool
  default     = true
}

variable "cpu_sockets" {
  description = "Number of CPU sockets"
  type        = number
  default     = 1
}

variable "cpu_cores" {
  description = "Number of cores"
  type        = number
}

variable "cpu_architecture" {
  description = "CPU architecture (x86_64 or aarch64)"
  type        = string
  default     = "x86_64"
}

variable "cpu_type" {
  description = "CPU type definition"
  type        = string
  default     = "host"
}

variable "memory_mb" {
  description = "Memory allocation in MB"
  type        = number
}

variable "machine_type" {
  description = "QEMU machine type"
  type        = string
  default     = "q35"
}

variable "bios" {
  description = "VM BIOS type"
  type        = string
  default     = "ovmf"
}

variable "storage" {
  description = "Primary datastore id"
  type        = string
}

variable "network_bridge" {
  description = "Network bridge"
  type        = string
  default     = "vmbr0"
}

variable "enable_firewall" {
  description = "Enable firewall for NIC"
  type        = bool
  default     = false
}

variable "vlan_tag" {
  description = "Optional VLAN tag"
  type        = number
  default     = 0
}

variable "mac_address" {
  description = "Optional MAC address"
  type        = string
  default     = ""
}

variable "vga_type" {
  description = "VGA type"
  type        = string
  default     = "std"
}

variable "os_type" {
  description = "Guest OS type"
  type        = string
  default     = "l26"
}

variable "cloud_init_user" {
  description = "Default cloud-init user"
  type        = string
}

variable "cloud_init_password" {
  description = "Cloud-init password"
  type        = string
  sensitive   = true
}

variable "ssh_public_keys" {
  description = "SSH public keys"
  type        = list(string)
  default     = []
}

variable "ipv4_cidr" {
  description = "VM IPv4 CIDR"
  type        = string
}

variable "gateway" {
  description = "Default gateway"
  type        = string
}

variable "dns_servers" {
  description = "DNS servers"
  type        = list(string)
  default     = []
}

variable "search_domain" {
  description = "DNS search domain"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Optional Proxmox tags"
  type        = list(string)
  default     = []
}
