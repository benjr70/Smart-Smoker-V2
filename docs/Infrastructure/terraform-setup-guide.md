# Terraform Infrastructure Setup Guide

## Overview

This guide covers the Terraform infrastructure setup for the Smart Smoker V2 project, implementing Infrastructure as Code (IaC) for managing Proxmox resources.

## Prerequisites

- **Proxmox VE Server**: Version 7.x or 8.x with API access
- **Terraform**: >= 1.5.0
- **Access**: Proxmox API credentials with appropriate permissions
- **Network**: Connectivity to Proxmox API endpoint

## Directory Structure

```
infra/proxmox/
├── README.md                          # Overview and usage instructions
├── terraform/
│   ├── main.tf                        # Root module composition
│   ├── variables.tf                   # Root variable definitions
│   ├── outputs.tf                     # Infrastructure outputs
│   ├── terraform.tfvars               # Environment-specific values (gitignored)
│   ├── terraform.tfvars.example       # Template for configuration
│   ├── modules/
│   │   ├── lxc-container/            # Reusable LXC container module
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── arm64-vm/                 # VM module (supports x86_64 and ARM64)
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   └── networking/               # Network bridge management
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── outputs.tf
│   ├── environments/
│   │   ├── github-runner/            # GitHub Actions runner environment
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── dev-cloud/                # Development cloud environment
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── prod-cloud/               # Production cloud environment
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   └── virtual-smoker/           # Virtual device testing environment
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── outputs.tf
│   ├── shared/
│   │   ├── providers.tf              # Proxmox provider configuration
│   │   ├── versions.tf               # Terraform version constraints
│   │   └── backend.tf                # State backend configuration
│   └── state/
│       └── terraform.tfstate         # Local state file (gitignored)
└── scripts/
    ├── create-cloud-init-template.sh # VM template creation script
    ├── install-arm64-firmware.sh     # ARM64 firmware installation
    └── fix-repos-and-install-arm64.sh # Repository fix + ARM64 setup
```

## Initial Setup

### 1. Configure Proxmox API Access

Create an API token in Proxmox:

```bash
# On Proxmox host
pveum user add terraform@pve
pveum passwd terraform@pve

# Create role with required permissions
pveum role add TerraformRole -privs "VM.Allocate VM.Clone VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network VM.Config.Options VM.Monitor VM.Audit VM.PowerMgmt Datastore.AllocateSpace Datastore.Audit Pool.Allocate Sys.Audit Sys.Console Sys.Modify"

# Assign role to user
pveum aclmod / -user terraform@pve -role TerraformRole

# Create API token
pveum user token add terraform@pve SmartSmoker --privsep=0
```

### 2. Create Terraform Configuration

```bash
cd infra/proxmox/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your environment-specific values:

```hcl
proxmox = {
  api_url          = "https://your-proxmox-ip:8006/"
  api_token_id     = "terraform@pve!SmartSmoker"
  api_token_secret = "your-api-token-secret"
  username         = "root@pam"           # Optional: for password auth
  password         = "your-password"       # Optional: for password auth
  tls_insecure     = true                 # Set to false in production
  default_storage  = "local-lvm"
  default_bridge   = "vmbr0"
  ssh_public_keys  = []                   # Optional: SSH keys for containers
  dns_servers      = ["10.0.0.1", "10.0.0.2"]
  search_domain    = "smoker.local"
}
```

### 3. Initialize Terraform

```bash
terraform init
```

This downloads the required providers and initializes the backend.

### 4. Validate Configuration

```bash
terraform validate
```

### 5. Plan Infrastructure

```bash
terraform plan -out=tfplan
```

Review the plan carefully to ensure it matches your expectations.

### 6. Apply Infrastructure

```bash
terraform apply tfplan
```

## Deployed Infrastructure

### LXC Containers

#### GitHub Runner (ID: 105)
- **Purpose**: Self-hosted GitHub Actions runner
- **Resources**: 2 CPU cores, 4GB RAM, 50GB disk
- **Network**: vmbr0 (10.20.0.10/24)
- **Features**: Nesting enabled for Docker-in-Docker

#### Development Cloud (ID: 104)
- **Purpose**: Development environment for cloud services
- **Resources**: 2 CPU cores, 4GB RAM, 20GB disk
- **Network**: vmbr0 (10.20.0.20/24)
- **Features**: Docker, Docker Compose, Git

#### Production Cloud (ID: 106)
- **Purpose**: Production environment for cloud services
- **Resources**: 4 CPU cores, 8GB RAM, 40GB disk
- **Network**: vmbr0 (10.20.0.30/24)
- **Features**: Docker, Docker Compose, Git, automated backups

### Networking

#### vmbr1 Bridge
- **Purpose**: Isolated network for virtual device testing
- **Network**: 10.30.0.0/24
- **Used by**: virtual-smoker-device (when enabled)

## Configuration Details

### Resource Pools

All infrastructure is organized in the `smart-smoker` resource pool for easier management.

### Container Features

- **Nesting**: Enabled on all containers for Docker-in-Docker support
- **Unprivileged**: All containers run as unprivileged for security
- **Auto-start**: Containers start automatically on host boot

### Networking Configuration

- **Primary Network**: vmbr0 (10.20.0.0/24)
  - GitHub Runner: 10.20.0.10/24
  - Dev Cloud: 10.20.0.20/24
  - Prod Cloud: 10.20.0.30/24

- **Isolated Network**: vmbr1 (10.30.0.0/24)
  - Virtual Smoker Device: 10.30.0.40/24

## State Management

### Local State (Current)

State is stored locally at `state/terraform.tfstate`. This is suitable for single-user development.

**⚠️ Important**: The state file is gitignored and should never be committed to version control as it may contain sensitive information.

### Migrating to Remote State (Recommended for Teams)

For team collaboration, migrate to a remote backend:

```hcl
# shared/backend.tf
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "smart-smoker/proxmox/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
```

After updating, run:

```bash
terraform init -migrate-state
```

## Common Operations

### Adding a New Environment

1. Create a new environment directory:
```bash
mkdir -p environments/new-env
```

2. Create environment-specific configuration:
```hcl
# environments/new-env/main.tf
module "container" {
  source = "../../modules/lxc-container"

  target_node     = var.target_node
  hostname        = var.hostname
  # ... other variables
}
```

3. Add the environment to `main.tf`:
```hcl
module "new_env" {
  count  = var.new_env.enabled ? 1 : 0
  source = "./environments/new-env"

  # Pass variables
}
```

4. Add variables to `variables.tf` and `terraform.tfvars`

### Updating Container Resources

1. Modify the resource allocation in `terraform.tfvars`:
```hcl
dev_cloud = {
  enabled   = true
  cpu_cores = 4  # Changed from 2
  memory_mb = 8192  # Changed from 4096
  # ... other settings
}
```

2. Plan and apply:
```bash
terraform plan
terraform apply
```

### Destroying Infrastructure

**⚠️ Warning**: This will destroy all managed infrastructure.

```bash
# Destroy specific resource
terraform destroy -target=module.dev_cloud[0]

# Destroy all infrastructure
terraform destroy
```

## Troubleshooting

### Tainted Resources

If a resource fails to create properly, it may be marked as "tainted":

```bash
# Check for tainted resources
terraform show

# Untaint a resource
terraform untaint 'module.virtual_smoker[0].module.vm.proxmox_virtual_environment_vm.this'
```

### Provider Timeouts

If operations timeout, you may need to manually clean up on Proxmox:

```bash
# On Proxmox host
qm status <vmid>
qm stop <vmid>
qm unlock <vmid>
rm -f /var/lock/qemu-server/lock-<vmid>.conf
```

Then remove from terraform state and reapply:

```bash
terraform state rm 'module.resource.path'
terraform apply
```

### Repository Issues (Proxmox)

If you encounter enterprise repository errors on Proxmox:

```bash
# Disable enterprise repos
mv /etc/apt/sources.list.d/pve-enterprise.list /etc/apt/sources.list.d/pve-enterprise.list.disabled
mv /etc/apt/sources.list.d/ceph.list /etc/apt/sources.list.d/ceph.list.disabled

# Add no-subscription repo
echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" > /etc/apt/sources.list.d/pve-no-subscription.list

# Update
apt-get update
```

## Security Best Practices

### Sensitive Data

- **Never commit** `terraform.tfvars` containing real credentials
- Use `.gitignore` to exclude state files and variable files
- Rotate API tokens regularly
- Use environment variables or secret management tools for CI/CD

### Access Control

- Use API tokens instead of passwords when possible
- Apply principle of least privilege
- Create dedicated Terraform users with minimal required permissions
- Enable audit logging on Proxmox

### Network Security

- Use TLS for Proxmox API access in production (`tls_insecure = false`)
- Implement firewall rules to restrict access to management interfaces
- Use VPN or Tailscale for remote access to infrastructure

## Maintenance

### Regular Tasks

1. **Update Providers**: Check for provider updates monthly
   ```bash
   terraform init -upgrade
   ```

2. **Validate State**: Ensure state matches reality
   ```bash
   terraform plan
   ```

3. **Backup State**: If using local backend, backup state files regularly
   ```bash
   cp state/terraform.tfstate state/terraform.tfstate.backup-$(date +%Y%m%d)
   ```

4. **Review Logs**: Check Terraform logs and Proxmox task history

### Disaster Recovery

1. **State File Recovery**: Keep backups of state files
2. **Import Existing Resources**: If state is lost, resources can be imported
3. **Documentation**: Maintain up-to-date documentation of all infrastructure

## Next Steps

After completing Phase 2 Story 1, proceed to:

- **Story 2**: Configure GitHub Actions self-hosted runner
- **Story 3**: Set up Tailscale networking for secure access
- **Story 4**: Create virtual device testing environment

## References

- [Terraform Documentation](https://www.terraform.io/docs)
- [Proxmox Provider Documentation](https://registry.terraform.io/providers/bpg/proxmox/latest/docs)
- [Phase 2 Infrastructure Plan](./phase-2-proxmox-infrastructure.md)
