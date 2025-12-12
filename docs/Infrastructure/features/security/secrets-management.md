# Secrets Management Guide

## Overview

This guide covers secure secrets management for the Smart Smoker V2 infrastructure, including current practices and integration with HashiCorp Vault for enhanced security at scale.

## Table of Contents

1. [Current Secrets Management](#current-secrets-management)
2. [Security Best Practices](#security-best-practices)
3. [Vault Integration (Recommended for Teams)](#vault-integration)
4. [GitHub Actions Secrets](#github-actions-secrets)
5. [Rotating Secrets](#rotating-secrets)
6. [Secrets Audit](#secrets-audit)

---

## Current Secrets Management

### Development (Single User)

**terraform.tfvars** (Local, gitignored):
```hcl
proxmox = {
  api_url          = "https://192.168.1.151:8006/"
  api_token_id     = "terraform@pve!SmartSmoker"
  api_token_secret = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  # ...
}
```

**Security Measures**:
- ✅ File excluded from git via `.gitignore`
- ✅ Stored locally with filesystem permissions (600)
- ✅ Backed up encrypted with GPG

**Limitations**:
- ⚠️ No central secret rotation
- ⚠️ Manual sharing between team members
- ⚠️ No audit trail
- ⚠️ Difficult to rotate credentials

---

## Security Best Practices

### General Principles

1. **Never Commit Secrets to Git**
   - Use `.gitignore` for sensitive files
   - Scan commits with tools like `git-secrets` or `gitleaks`

2. **Use API Tokens Instead of Passwords**
   ```bash
   # Good: API token with limited scope
   api_token_id = "terraform@pve!SmartSmoker"

   # Bad: Root password
   username = "root@pam"
   password = "MyPassword123"
   ```

3. **Principle of Least Privilege**
   - Grant minimum required permissions
   - Use separate tokens for different environments

4. **Regular Rotation**
   - Rotate API tokens quarterly
   - Rotate production secrets monthly
   - Immediate rotation if compromise suspected

### File Permissions

**Protect terraform.tfvars**:
```bash
# Set restrictive permissions
chmod 600 infra/proxmox/terraform/terraform.tfvars

# Verify
ls -l infra/proxmox/terraform/terraform.tfvars
# Should show: -rw------- (600)
```

### Encrypted Backups

**Using GPG**:
```bash
# Encrypt
gpg --symmetric --cipher-algo AES256 terraform.tfvars
# Creates: terraform.tfvars.gpg

# Decrypt
gpg --decrypt terraform.tfvars.gpg > terraform.tfvars

# Store encrypted file in secure location
mv terraform.tfvars.gpg ~/secure-backups/
```

**Using age** (Modern alternative):
```bash
# Install age
brew install age  # macOS
sudo apt install age  # Ubuntu

# Generate key pair
age-keygen -o key.txt

# Encrypt
age -r $(cat key.txt | grep public) -o terraform.tfvars.age terraform.tfvars

# Decrypt
age -d -i key.txt terraform.tfvars.age > terraform.tfvars
```

---

## Vault Integration

### Why HashiCorp Vault?

**Benefits**:
- ✅ Centralized secret storage
- ✅ Automatic secret rotation
- ✅ Audit logging for all access
- ✅ Dynamic credentials
- ✅ Fine-grained access control
- ✅ Secret versioning

### Setup Vault Server

**Option 1: Vault in LXC Container** (Recommended for self-hosted):
```bash
# Create vault container
cd infra/proxmox/terraform
# Add vault environment configuration

# Install Vault
pct enter <vault-container-id>
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
apt update && apt install vault

# Configure Vault
cat > /etc/vault.d/vault.hcl <<EOF
storage "file" {
  path = "/opt/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1  # Use TLS in production!
}

api_addr = "http://10.20.0.50:8200"
cluster_addr = "https://10.20.0.50:8201"
ui = true
EOF

# Start Vault
systemctl enable vault
systemctl start vault

# Initialize (ONE TIME ONLY - SAVE OUTPUT!)
vault operator init -key-shares=5 -key-threshold=3

# Unseal Vault (required after restart)
vault operator unseal <UNSEAL_KEY_1>
vault operator unseal <UNSEAL_KEY_2>
vault operator unseal <UNSEAL_KEY_3>
```

**Option 2: HashiCorp Cloud Platform (HCP) Vault**:
- Managed service, no maintenance
- Free tier available
- Automatic backups and HA

### Configure Vault for Terraform

**Enable KV Secrets Engine**:
```bash
export VAULT_ADDR='http://10.20.0.50:8200'
export VAULT_TOKEN='<root-token>'

# Enable KV v2 secrets engine
vault secrets enable -path=smart-smoker kv-v2

# Store Proxmox credentials
vault kv put smart-smoker/proxmox \
  api_url="https://192.168.1.151:8006/" \
  api_token_id="terraform@pve!SmartSmoker" \
  api_token_secret="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Store per-environment secrets
vault kv put smart-smoker/prod-cloud \
  initial_password="SuperSecurePassword123!"

vault kv put smart-smoker/dev-cloud \
  initial_password="DevPassword123!"
```

**Create Vault Policy for Terraform**:
```bash
vault policy write terraform-policy - <<EOF
# Read Proxmox credentials
path "smart-smoker/data/proxmox" {
  capabilities = ["read"]
}

# Read environment secrets
path "smart-smoker/data/*" {
  capabilities = ["read", "list"]
}
EOF
```

**Create Terraform Token**:
```bash
vault token create -policy=terraform-policy -ttl=8h
# Save this token securely
```

### Update Terraform for Vault

**Add Vault Provider**:
```hcl
# infra/proxmox/terraform/providers.tf
terraform {
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.57.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 3.23"
    }
  }
}

provider "vault" {
  address = var.vault_addr
  token   = var.vault_token
}

data "vault_kv_secret_v2" "proxmox" {
  mount = "smart-smoker"
  name  = "proxmox"
}

data "vault_kv_secret_v2" "prod_cloud" {
  mount = "smart-smoker"
  name  = "prod-cloud"
}

provider "proxmox" {
  endpoint  = data.vault_kv_secret_v2.proxmox.data["api_url"]
  api_token = format("%s=%s",
    data.vault_kv_secret_v2.proxmox.data["api_token_id"],
    data.vault_kv_secret_v2.proxmox.data["api_token_secret"]
  )
  insecure = false
}
```

**Update variables.tf**:
```hcl
variable "vault_addr" {
  description = "Vault server address"
  type        = string
  default     = "http://10.20.0.50:8200"
}

variable "vault_token" {
  description = "Vault authentication token"
  type        = string
  sensitive   = true
}
```

**New terraform.tfvars** (no secrets!):
```hcl
# Only non-sensitive configuration
vault_addr = "http://10.20.0.50:8200"

# vault_token is provided via environment variable
# export VAULT_TOKEN=s.xxxxxxxxxxxx
```

**Run Terraform with Vault**:
```bash
# Set Vault token
export VAULT_TOKEN=$(vault token create -policy=terraform-policy -ttl=8h -format=json | jq -r .auth.client_token)

# Run Terraform
terraform plan
terraform apply
```

### Dynamic Proxmox Credentials

**Enable Proxmox Secrets Engine** (Future enhancement):
```bash
# This would require a Vault Proxmox plugin
# Vault generates short-lived API tokens on-demand
vault secrets enable proxmox

vault write proxmox/config/access \
  proxmox_url="https://192.168.1.151:8006/" \
  username="root@pam" \
  password="admin-password"

# Terraform requests credentials
vault read proxmox/creds/terraform
# Returns: api_token with 1-hour TTL
```

---

## GitHub Actions Secrets

### Store Secrets in GitHub

**Repository Secrets** (Settings > Secrets and variables > Actions):

**MongoDB Secrets** (Required for Phase 3 Story 0):
```yaml
MONGO_ROOT_USER: admin
MONGO_ROOT_PASSWORD: <strong-random-password>  # Base64-encoded 32-byte
MONGO_APP_PASSWORD: <strong-random-password>    # Base64-encoded 32-byte
```

**How to Add MongoDB Secrets**:
1. Navigate to repository: `https://github.com/YOUR_USERNAME/Smart-Smoker-V2`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each secret
4. Enter name and value
5. Click **Add secret**

**Generate Secure MongoDB Passwords**:
```bash
# Generate MongoDB root password
openssl rand -base64 32

# Generate MongoDB app password
openssl rand -base64 32

# URL-encode for connection strings (done automatically in workflow)
```

**SSH Secrets** (Required for dev-deploy.yml workflow):
```yaml
SSH_PRIVATE_KEY: <ed25519-private-key>  # SSH key for deployment to dev-cloud
```

**How to Set Up SSH_PRIVATE_KEY**:
1. Generate an SSH key pair (if not already done):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key -N ""
   ```
2. Add the public key to the target server:
   ```bash
   ssh-copy-id -i ~/.ssh/github_deploy_key.pub root@smoker-dev-cloud
   ```
3. Add the private key as a GitHub secret:
   - Go to repository **Settings > Secrets and variables > Actions**
   - Click **New repository secret**
   - Name: `SSH_PRIVATE_KEY`
   - Value: Contents of `~/.ssh/github_deploy_key` (the private key file, including the `-----BEGIN` and `-----END` lines)
   - Click **Add secret**
4. Test SSH connectivity from the runner to verify setup

**Other Secrets**:
```yaml
# Required for Terraform workflows
VAULT_ADDR: http://10.20.0.50:8200
VAULT_TOKEN: s.xxxxxxxxxxxx  # AppRole token with limited permissions

# Or store Proxmox directly (without Vault)
PROXMOX_API_URL: https://192.168.1.151:8006/
PROXMOX_TOKEN_ID: terraform@pve!SmartSmoker
PROXMOX_TOKEN_SECRET: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Discord notifications
DISCORD_WEBHOOK_URL: <discord-webhook-url>  # For deployment notifications

# Existing secrets
VAPID_PUBLIC_KEY: <existing>
VAPID_PRIVATE_KEY: <existing>
```

### Use in Workflows

**Terraform Workflow with Vault**:
```yaml
# .github/workflows/terraform-apply.yml
name: Terraform Apply

on:
  workflow_dispatch:

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        working-directory: infra/proxmox/terraform
        run: terraform init

      - name: Terraform Apply
        working-directory: infra/proxmox/terraform
        env:
          VAULT_ADDR: ${{ secrets.VAULT_ADDR }}
          VAULT_TOKEN: ${{ secrets.VAULT_TOKEN }}
        run: terraform apply -auto-approve
```

**Alternative: Direct Secrets**:
```yaml
      - name: Terraform Apply
        working-directory: infra/proxmox/terraform
        env:
          TF_VAR_proxmox_api_url: ${{ secrets.PROXMOX_API_URL }}
          TF_VAR_proxmox_token_id: ${{ secrets.PROXMOX_TOKEN_ID }}
          TF_VAR_proxmox_token_secret: ${{ secrets.PROXMOX_TOKEN_SECRET }}
        run: terraform apply -auto-approve
```

---

## Rotating Secrets

### Proxmox API Token Rotation

**Quarterly Rotation Schedule**:
```bash
# 1. Create new API token
pveum user token add terraform@pve SmartSmoker2 --privsep=0
# Save output: terraform@pve!SmartSmoker2=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 2. Update Vault (if using)
vault kv put smart-smoker/proxmox \
  api_url="https://192.168.1.151:8006/" \
  api_token_id="terraform@pve!SmartSmoker2" \
  api_token_secret="<new-token>"

# 3. Test with Terraform
terraform plan

# 4. Delete old token
pveum user token remove terraform@pve SmartSmoker

# 5. Update documentation
echo "$(date +%Y-%m-%d): Rotated Proxmox API token" >> rotation-log.md
```

### Container Password Rotation

**Update LXC Container Passwords**:
```bash
# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update in Vault
vault kv put smart-smoker/prod-cloud initial_password="$NEW_PASSWORD"

# Change password on running container
pct exec 106 -- passwd root
# Enter new password twice

# Update any scripts/automation using the password
```

---

## Secrets Audit

### Regular Audit Checklist

**Monthly Review**:
- [ ] Review Vault audit logs for suspicious access
- [ ] Verify no secrets in git history: `git log -p | grep -i "password\|token\|secret"`
- [ ] Check file permissions on terraform.tfvars: `ls -l terraform.tfvars`
- [ ] Verify encrypted backups are current
- [ ] Review GitHub Actions secret usage
- [ ] Confirm all team members have required access

**Tools for Secret Scanning**:
```bash
# Install gitleaks
brew install gitleaks

# Scan repository
gitleaks detect --source . --verbose

# Scan before commit (pre-commit hook)
gitleaks protect --staged
```

### Vault Audit Log Analysis

```bash
# Enable audit logging
vault audit enable file file_path=/var/log/vault_audit.log

# Review recent access
tail -f /var/log/vault_audit.log | jq '.request.path'

# Find who accessed Proxmox credentials
grep "smart-smoker/data/proxmox" /var/log/vault_audit.log | jq '.auth.display_name'
```

---

## Migration Path

### Phase 1: Current (Single Developer)
- ✅ terraform.tfvars with gitignore
- ✅ GPG encrypted backups
- ✅ File permissions

### Phase 2: Team Expansion
- 🔄 Implement Vault server
- 🔄 Migrate secrets to Vault
- 🔄 Update Terraform to use Vault provider
- 🔄 Document Vault operations

### Phase 3: Production Hardening
- ⏳ Enable Vault TLS
- ⏳ Configure Vault auto-unseal
- ⏳ Implement dynamic credentials
- ⏳ Set up Vault replication

---

## Related Documentation

- [Terraform Configuration](../infrastructure/terraform.md)
- [Disaster Recovery](../operations/disaster-recovery.md)
- [Proxmox Infrastructure](../infrastructure/proxmox.md)

---

**Last Updated**: 2025-10-05
**Next Review Date**: 2026-01-05
**Document Owner**: Infrastructure Team
