# Proxmox Infrastructure as Code

Terraform configuration for provisioning Smart Smoker infrastructure on Proxmox. The layout mirrors the Phase 2 architecture: reusable modules, opinionated environment blueprints, and a single entry point for applying the configuration.

```
infra/proxmox
├── README.md
└── terraform
    ├── main.tf
    ├── outputs.tf
    ├── providers.tf -> shared/providers.tf
    ├── versions.tf -> shared/versions.tf
    ├── backend.tf -> shared/backend.tf
    ├── terraform.tfvars.example
    ├── modules
    │   ├── arm64-vm
    │   └── lxc-container
    ├── environments
    │   ├── dev-cloud
    │   ├── github-runner
    │   ├── prod-cloud
    │   └── virtual-smoker
    └── shared
        ├── backend.tf
        ├── providers.tf
        └── versions.tf
```

## Usage Overview

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and populate environment specific values.
2. From `infra/proxmox/terraform` run:
   ```bash
   terraform init
   terraform plan -out plan.tfplan
   terraform apply plan.tfplan
   ```
3. Use the `-target` flag to apply individual environments if needed (for example during initial testing):
   ```bash
   terraform plan -target=module.github_runner
   ```
4. Terraform state is stored locally by default (`state/terraform.tfstate`). Configure a remote backend if required for your team before running `terraform apply` in collaboration scenarios.

## Modules

- `modules/lxc-container`: Generic LXC container module with networking, storage, and optional mounts.
- `modules/arm64-vm`: QEMU VM module tailored for the virtual Raspberry Pi test device.

## Environment Blueprints

- `github-runner`: Self-hosted GitHub Actions runner with Terraform tooling.
- `dev-cloud`: Development cloud environment for nightly deployments.
- `prod-cloud`: Production cloud environment with larger resource allocations.
- `virtual-smoker`: ARM64 VM to simulate the smoker hardware.

Each environment module wraps the generic modules and exposes only the inputs relevant to that component. The root module composes them based on the configuration in `terraform.tfvars`.

## Networking

All LXC containers use a private `10.20.0.0/24` network behind NAT on the Proxmox host. Two things must be configured for networking to survive reboots:

### 1. Container OS Type

The Terraform `lxc-container` module sets `os_type = "ubuntu"` by default. This tells Proxmox to automatically configure the network interface (`veth0`) inside the container on boot. Without this, the interface stays DOWN and the container has no connectivity.

For **existing containers** that were created before this fix, update them manually from the Proxmox host shell:

```bash
pct set 106 --ostype ubuntu   # github-runner
pct set 104 --ostype ubuntu   # smart-smoker-cloud-prod
pct set 108 --ostype ubuntu   # smart-smoker-dev-cloud
```

### 2. NAT Persistence

The Proxmox host must have NAT masquerade rules that persist across reboots. Add these lines to the `vmbr0` block in `/etc/network/interfaces` on the Proxmox host:

```
auto vmbr0
iface vmbr0 inet static
    ... existing config ...
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s 10.20.0.0/24 -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s 10.20.0.0/24 -o vmbr0 -j MASQUERADE
```

This is the standard Proxmox-recommended approach for NAT. The `configure-nat-manual.sh` script in `scripts/` can also be used for one-time setup but does not guarantee persistence without `netfilter-persistent` installed.

### Verification

After applying both fixes, reboot a container and verify:

```bash
pct reboot 106
pct enter 106
ip addr          # veth0 should be UP with 10.20.0.10/24
ping -c 3 8.8.8.8   # Should succeed
tailscale status     # Should show connected
```

## GitHub Runner Self-Healing

The GitHub Actions self-hosted runner (container 106) has a self-healing mechanism that automatically detects stale registrations and re-registers without manual intervention.

### How It Works

A systemd timer (`runner-health-check.timer`) runs every 5 minutes on the runner container and checks:

1. The `.runner` config file exists at `/opt/actions-runner/.runner`
2. The runner systemd service is active
3. No error loops in recent service logs (>3 errors in 5 min = unhealthy)

If the runner is unhealthy, the script:

1. Checks DNS resolution for `api.github.com` (falls back to `8.8.8.8` if needed)
2. Auto-generates a registration token using a stored GitHub PAT
3. Stops and removes the stale runner service
4. Re-registers with `--replace --unattended`
5. Installs and starts the new service

### One-Time Setup: Create GitHub PAT

1. Go to **GitHub** > **Settings** > **Developer settings** > **Fine-grained tokens** > **Generate new token**
2. Configure:
   - **Token name:** `smart-smoker-runner-autoregister`
   - **Expiration:** No expiration (or 1 year max)
   - **Repository access:** Only select `benjr70/Smart-Smoker-V2`
   - **Permissions:** Repository permissions > **Administration: Read and write**
3. Copy the token (starts with `github_pat_...`)
4. Add it as a GitHub Secret named `RUNNER_PAT` in repo **Settings > Secrets and variables > Actions**

The Ansible provisioning workflow passes this secret to the runner role automatically. The role also deploys the PAT to `/etc/github-runner/pat` (root-only, mode 0600) for the self-healing script.

### Monitoring

```bash
# Check timer status
systemctl status runner-health-check.timer

# View recent health check logs
journalctl -u runner-health-check --since "1 hour ago"

# Manually trigger a health check
systemctl start runner-health-check.service

# Check runner service directly
systemctl status actions.runner.*
```

## Next Steps

- Configure a remote backend (S3, PostgreSQL, etc.) before multiple engineers run Terraform concurrently.
- Integrate the Terraform apply into the self-hosted runner once Story 2 (CI/CD) is implemented.
- Extend modules with provisioning scripts (cloud-init, Ansible) as workloads are containerized.
