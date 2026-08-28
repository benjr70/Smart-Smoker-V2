# Infrastructure

Everything in this directory is the **reference deployment** for Smart Smoker
V2: the actual Proxmox homelab, tailnet and CI wiring the maintainer runs, kept
in the repo so the deployment story is inspectable end to end.

**It is tied to one specific environment.** Node names, container IDs, the
`10.20.0.0/24` private network, the Terraform Cloud workspace and the Tailscale
tailnet all describe the maintainer's hardware. Nothing here is a
turnkey installer, and none of it is required to run or develop the
applications — for local development see [CONTRIBUTING.md](../CONTRIBUTING.md),
and for a plain container deployment the root `*.docker-compose.yml` files stand
on their own. Treat this directory as a worked example to adapt, not a product.

## Layout

| Path                        | What it is                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `proxmox/terraform/`        | Terraform that provisions the LXC containers and ARM64 VM on the Proxmox host            |
| `proxmox/ansible/`          | Ansible roles and playbooks that configure those hosts once they exist                   |
| `proxmox/scripts/`          | One-off host helper scripts (cloud-init template, NAT config, network diagnostics)       |
| `mongodb-init/`             | MongoDB container bootstrap scripts (application user creation)                          |
| `systemd/`                  | Unit files for the maintainer's agent daemon and status dashboard                        |

## The reference environment

**Proxmox** is the hypervisor. Terraform (`proxmox/terraform/`) declares four
environments from two generic modules (`lxc-container`, `arm64-vm`):

- `github-runner` — self-hosted GitHub Actions runner with Terraform and Docker
- `dev-cloud` — nightly/dev deployment target for the cloud apps
- `prod-cloud` — production target, same shape with more resources
- `virtual-smoker` — ARM64 VM standing in for the Raspberry Pi smoker device, so
  device builds and deploys can be exercised without the physical hardware

All containers sit on a private `10.20.0.0/24` bridge behind NAT on the Proxmox
host. See [`proxmox/README.md`](proxmox/README.md) for the module inputs and the
networking caveats (container `os_type`, NAT persistence across reboots).

**Terraform Cloud** holds remote state and provides locking only — the workspace
runs in *Local* execution mode. Plans and applies execute on the self-hosted
runner because the Proxmox provider needs tailnet access to the hypervisor,
which Terraform Cloud's hosted runners do not have. The organization and
workspace come from `TF_CLOUD_ORGANIZATION` / `TF_WORKSPACE` environment
variables rather than being hardcoded (`proxmox/terraform/shared/backend.tf`).

**Tailscale** is the only network path between GitHub Actions and the hosts.
Nothing in the deployment is exposed to the public internet: the runner lives
inside the tailnet, the deploy workflows SSH over tailnet names, and the cloud
compose files publish MongoDB and the backend on loopback only. The `tailscale`
Ansible role installs and authenticates the daemon on every host.

**Ansible** (`proxmox/ansible/`) does everything after provisioning — Docker,
Node.js, Tailscale, the app deployment layout, backups and a DNS guard — with
one playbook per environment plus `site.yml` and verification playbooks. See
[`proxmox/ansible/README.md`](proxmox/ansible/README.md).

## Reusing this

If you want to run Smart Smoker somewhere else, the useful pieces are the
compose files at the repo root and the environment contract they document
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT`, the Mongo
credentials, `DB_URL`). The Terraform and Ansible here will need real edits —
host names, storage pools, network ranges, secrets and tailnet identities are
all specific to the maintainer's setup, and several runbook notes reference
container IDs that only exist there.
