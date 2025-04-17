provider "proxmox" {
  pm_api_url      = "https://your-proxmox-server:8006/api2/json"
  pm_user         = "root@pam"
  pm_password     = var.proxmox_password
  pm_tls_insecure = true
}

resource "proxmox_lxc" "container" {
  hostname       = "smart-smoker-${var.env_name}"
  node           = "proxmox-node-name"
  ostemplate     = "local:vztmpl/debian-11-standard_11.0-1_amd64.tar.gz"
  storage        = "local-lvm"
  rootfs         = "local-lvm:8G"
  memory         = 1024
  cores          = 2
  net {
    name = "eth0"
    ip   = "dhcp"
  }
  features {
    nesting = true
  }
  start = true

  post_start {
    inline = <<EOT
      apt-get update
      apt-get install -y docker.io docker-compose
      mkdir -p /opt/smart-smoker
      echo '${file("cloud.docker-compose.yml")}' > /opt/smart-smoker/docker-compose.yml
      cd /opt/smart-smoker && docker-compose up -d
    EOT
  }
}

variable "proxmox_password" {
  description = "Proxmox root password"
  type        = string
}

variable "env_name" {
  description = "Environment name (e.g., dev, stag, prod)"
  type        = string
}
