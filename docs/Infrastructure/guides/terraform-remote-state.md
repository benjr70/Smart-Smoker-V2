# Terraform: remote state (Terraform Cloud) + prod gating

> **STATUS (2026-07-08): hands-off dev auto-apply ENABLED (non-destructive).**
> State is imported into TFC (`smart-smoker-proxmox`) and the dev-scoped plan is
> clean. The two force-replacement attributes that had drifted — SSH keys
> (`initialization[0].user_account[0].keys`, managed by Ansible) and runner disk
> size (`disk[0].size`, grown out-of-band) — are now under `ignore_changes` in
> `modules/lxc-container/main.tf` (see #274), so `plan` reports **0 to destroy,
> 0 to replace**. `infra-provision-vm.yml` runs a real dev-scoped `terraform
> apply` on push to `master` behind a guard that refuses to apply any plan
> containing a destroy/replace, and the drift nightly cron is active. Prod
> (`module.prod_cloud` / CT 104) is **never** auto-applied — only via the gated
> `terraform-apply-prod.yml`.

## Why

State was a `local` backend at `infra/proxmox/terraform/state/`, which is
`.gitignore`d. On the self-hosted runner every checkout wipes it, so CI
Terraform had no persistent state — plan/apply were effectively broken and
unsafe. State now lives in **Terraform Cloud** (state storage + locking only),
and prod is split out behind an approval gate.

- **Dev** (`module.networking`, `github_runner`, `dev_cloud`, `virtual_smoker`):
  auto-applied on push to `master` by `infra-provision-vm.yml`.
- **Prod** (`module.prod_cloud`): applied **only** by `terraform-apply-prod.yml`
  (`workflow_dispatch`), behind the `production` Environment gate.

Execution is **Local**: plan/apply run on the proxmox runner (the bpg/proxmox
provider needs tailnet access to Proxmox); TFC only holds state.

## One-time setup (must happen BEFORE merging the backend change)

If CI runs `terraform init` against the new `cloud {}` backend before this exists,
every TF workflow fails. Do these first:

1. **Create the TFC workspace** — in Terraform Cloud, create org (note its name)
   and a workspace named **`smart-smoker-proxmox`** (CLI-driven workflow).
2. **Set Execution Mode = Local** — workspace → Settings → General →
   Execution Mode → **Local**. (Critical — Remote can't reach Proxmox.)
3. **Create an API token** — a user or team token with access to the workspace.
4. **Add CI config:**
   - Repo **secret** `TF_API_TOKEN` = the token.
   - Repo **variable** `TF_CLOUD_ORGANIZATION` = your TFC org name.
5. **Place the secret tfvars on the runner.** TFC Local execution mode does
   **not** inject TFC workspace variables, and a fresh `actions/checkout` wipes
   the working tree, so the required `terraform.tfvars` (Proxmox API token +
   per-container passwords) must live **outside the checkout** on the
   self-hosted runner. Copy your populated `terraform.tfvars` to
   **`/opt/iac/terraform.tfvars`** (root-owned, `chmod 600`). The TF workflows
   read it via `-var-file="$TFVARS_FILE"`; override the path with the
   `TFVARS_FILE` repo variable if you put it elsewhere. The workflows fail fast
   with a clear message if the file is missing.
6. **Migrate existing state** — from the machine that currently holds the real
   local state (workstation):
   ```bash
   cd infra/proxmox/terraform
   export TF_CLOUD_ORGANIZATION=<org>
   export TF_WORKSPACE=smart-smoker-proxmox
   terraform login                       # stores the TFC token locally
   terraform init -migrate-state         # pushes local state → TFC, confirm "yes"
   terraform plan                        # expect: No changes
   ```
7. **Then merge** the PR. Confirm a PR `Terraform Plan` check is green against TFC.

## Day-to-day

- **Change dev infra:** edit `environments/dev-cloud/` (or `var.dev_cloud`) →
  PR (plan posted) → merge → auto-applied (dev-scoped).
- **Change prod infra:** edit `environments/prod-cloud/` (or `var.prod_cloud`) →
  PR (plan posted) → merge → **Actions → Production Terraform Apply**:
  run with `plan_only=true` to review, then `plan_only=false` to apply
  (approval prompt fires on the apply).
- **Drift:** `terraform-drift.yml` (nightly 02:00 UTC) plans the whole tree and
  opens an issue on drift.

## Notes / caveats

- Single workspace = single state for all envs; `-target` scopes what each
  pipeline changes. `-target` is a deliberate partial apply — review plans.
- `backend.tf` is a symlink to `shared/backend.tf` (the real file).
- `state/` and `*.tfvars` remain gitignored; real `terraform.tfvars` (Proxmox
  creds, enable toggles) stays out of the repo. On the self-hosted runner it
  lives at `/opt/iac/terraform.tfvars` (override via the `TFVARS_FILE` repo
  variable) and is passed to every plan/apply with `-var-file`.
