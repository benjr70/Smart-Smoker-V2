variable "proxmox_password" {
  description = "Proxmox root password"
  type        = string
}

variable "env_name" {
  description = "Environment name (e.g., dev, stag, prod)"
  type        = string
}
