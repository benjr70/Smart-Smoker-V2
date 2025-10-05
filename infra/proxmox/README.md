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

## Next Steps

- Configure a remote backend (S3, PostgreSQL, etc.) before multiple engineers run Terraform concurrently.
- Integrate the Terraform apply into the self-hosted runner once Story 2 (CI/CD) is implemented.
- Extend modules with provisioning scripts (cloud-init, Ansible) as workloads are containerized.
