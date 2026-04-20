# Infrastructure Harness

Gates that keep Terraform state, Ansible intent, Docker compose, and VM provisioning honest. These are the infra-side complements to [Backpressure](backpressure.md) and [Self-validation](self-validation.md).

## Terraform plan on PR

`.github/workflows/terraform-plan.yml` runs on PRs that touch `infra/proxmox/terraform/**`. It executes `terraform plan` and posts the diff as a sticky PR comment.

Runner: `[self-hosted, linux, proxmox]` — the plan needs access to the real Proxmox API.

How reviewers use it: open the PR, scroll to the bottom comment marked `<!-- terraform-plan-pr -->`, read the diff. "What will this actually change?" becomes visible without cloning the branch locally.

How agents use it:

```bash
gh pr view <number> --json comments --jq '.comments[] | select(.body | contains("terraform-plan-pr"))'
```

The workflow is advisory (`continue-on-error: true`) — a failed plan posts a warning comment instead of blocking merge during the bake window.

## Terraform drift detection

`.github/workflows/terraform-drift.yml` runs nightly at 02:00 UTC (and can be dispatched manually).

What it does:

1. `terraform plan -detailed-exitcode` against the real Proxmox state
2. Exit code 0 → clean, no action
3. Exit code 2 → drift detected. Opens or updates a sticky GitHub issue labeled `infra:drift` with the plan diff
4. Exit code 1 → Terraform errored; fails the workflow

When drift is detected, you have two choices:

- **Reverse the manual change** — someone edited a VM in the Proxmox console. Put it back via Terraform.
- **Accept the change** — update the Terraform config to match reality and `terraform apply`.

The issue is idempotent: subsequent drift runs update the same issue body instead of spamming. When drift clears, the workflow auto-closes the issue with a comment.

Concurrency group `ansible-provision-dev` prevents this workflow from racing with `infra-provision-vm.yml`.

## Ansible --check dry-run

`.github/workflows/ansible-lint.yml` has an `ansible-check` job (runs after `ansible-lint` succeeds). It builds a throwaway localhost fixture inventory and runs every playbook with `--check --diff`.

What this catches that pure lint misses:

- A renamed handler reference that still parses fine
- A wrong file path in a `copy:` task
- An undefined variable that only surfaces at execution time
- A task that references a role that no longer exists

It is advisory for the bake window — a failure annotates the PR but does not block.

## Compose healthchecks

Every service in the three compose files has a `healthcheck:` block:

| File | Services | Check |
|------|----------|-------|
| `cloud.docker-compose.yml` | backend, frontend, mongodb, watchtower | curl `/api/health`, wget, mongo ping, pgrep |
| `smoker.docker-compose.yml` | deviceService, frontend, electronShell, watchtower | curl `/api/health`, wget, pgrep |
| `virtual-smoker.docker-compose.yml` | deviceService, frontend, watchtower | curl `/api/health`, wget, pgrep |

Consume programmatically:

```bash
docker compose -f smoker.docker-compose.yml ps --format json \
  | jq '.[] | {name: .Name, health: .Health}'

# Output:
# {"name": "device_service", "health": "healthy"}
# {"name": "frontend_smoker", "health": "starting"}
# {"name": "watchtower", "health": "healthy"}
```

States:

- `starting` — within `start_period` grace window
- `healthy` — probe passed
- `unhealthy` — probe failed N consecutive times (N = `retries`)

The smoke script (see [Self-validation](self-validation.md#smoke-script)) polls `/api/health` directly rather than relying on compose state, but compose health is the right primitive for `docker compose` operators and watchtower auto-restart decisions.

## Post-provision smoke

`.github/workflows/infra-provision-vm.yml` has a final `post-provision-smoke` job. After Terraform applies and Ansible configures the VM, this job:

1. SSHes in and runs `uname -a` (confirms SSH + the user exists)
2. Checks `tailscale status --json | jq -e '.BackendState == "Running"'` (confirms Tailscale is actually up)
3. Curls `http://localhost:3003/api/health` and `http://localhost:8080` (confirms services respond)

Before this existed, "VM provisioned" meant "terraform apply succeeded." Now it means "the VM is actually usable."

All three probes use `continue-on-error: true` during the bake window — they annotate the run with `::warning::` instead of failing the whole provision. Flip to blocking after ~2 weeks.

## Related

- [Backpressure](backpressure.md) — application-level commit/PR gates
- [Self-validation](self-validation.md) — runtime health endpoints + smoke script
- [Infrastructure overview](../Infrastructure/README.md) — the broader infra docs
- [Terraform feature page](../Infrastructure/features/infrastructure/terraform.md) — Terraform-specific reference
- [Ansible feature page](../Infrastructure/features/configuration/ansible.md) — Ansible-specific reference
