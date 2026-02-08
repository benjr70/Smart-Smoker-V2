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

## Next Steps

- Configure a remote backend (S3, PostgreSQL, etc.) before multiple engineers run Terraform concurrently.
- Integrate the Terraform apply into the self-hosted runner once Story 2 (CI/CD) is implemented.
- Extend modules with provisioning scripts (cloud-init, Ansible) as workloads are containerized.
