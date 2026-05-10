#!/bin/bash
# Test: Self-healing GitHub Actions runner (DNS guardrail + re-register watchdog)
# Issue #190
# These are static analysis / syntax tests runnable without a live Ansible inventory.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANSIBLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROLE_DIR="$ANSIBLE_DIR/roles/github-runner"
TEMPLATES_DIR="$ROLE_DIR/templates"
TASKS_FILE="$ROLE_DIR/tasks/main.yml"
DEFAULTS_FILE="$ROLE_DIR/defaults/main.yml"
README_FILE="$ANSIBLE_DIR/README.md"

TOTAL=0
FAILURES=0

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; TOTAL=$((TOTAL + 1)); }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; TOTAL=$((TOTAL + 1)); FAILURES=$((FAILURES + 1)); }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# ---------------------------------------------------------------------------
section "Template file existence"
# ---------------------------------------------------------------------------

for f in \
    runner-dns-guard.sh.j2 \
    runner-dns-guard.service.j2 \
    runner-dns-guard.timer.j2 \
    runner-dns-guard-dropin.conf.j2 \
    resolv.conf.j2 \
    runner-reregister-watchdog.sh.j2 \
    runner-reregister-watchdog.service.j2 \
    runner-reregister-watchdog.path.j2; do
    if [ -f "$TEMPLATES_DIR/$f" ]; then
        pass "template exists: $f"
    else
        fail "template missing: $f"
    fi
done

# ---------------------------------------------------------------------------
section "Bash syntax check on shell templates"
# ---------------------------------------------------------------------------

for f in runner-dns-guard.sh.j2 runner-reregister-watchdog.sh.j2; do
    # Strip Jinja2 to make bash -n happy: replace {{ ... }} with placeholder
    STRIPPED=$(sed 's/{{[^}]*}}/PLACEHOLDER/g' "$TEMPLATES_DIR/$f")
    if echo "$STRIPPED" | bash -n 2>/dev/null; then
        pass "bash syntax OK: $f"
    else
        fail "bash syntax error: $f"
    fi
done

# ---------------------------------------------------------------------------
section "systemd unit structure"
# ---------------------------------------------------------------------------

# DNS guard service has [Service] section with ExecStart
if grep -q '^\[Service\]' "$TEMPLATES_DIR/runner-dns-guard.service.j2" \
   && grep -q 'ExecStart=' "$TEMPLATES_DIR/runner-dns-guard.service.j2"; then
    pass "runner-dns-guard.service.j2 has [Service] + ExecStart"
else
    fail "runner-dns-guard.service.j2 missing [Service] or ExecStart"
fi

# DNS guard timer has [Timer] and [Install]
if grep -q '^\[Timer\]' "$TEMPLATES_DIR/runner-dns-guard.timer.j2" \
   && grep -q '^\[Install\]' "$TEMPLATES_DIR/runner-dns-guard.timer.j2"; then
    pass "runner-dns-guard.timer.j2 has [Timer] + [Install]"
else
    fail "runner-dns-guard.timer.j2 missing [Timer] or [Install]"
fi

# Drop-in has ExecStartPre
if grep -q 'ExecStartPre=' "$TEMPLATES_DIR/runner-dns-guard-dropin.conf.j2"; then
    pass "runner-dns-guard-dropin.conf.j2 has ExecStartPre"
else
    fail "runner-dns-guard-dropin.conf.j2 missing ExecStartPre"
fi

# Path unit has [Path] with PathModified
if grep -q '^\[Path\]' "$TEMPLATES_DIR/runner-reregister-watchdog.path.j2" \
   && grep -q 'PathModified=' "$TEMPLATES_DIR/runner-reregister-watchdog.path.j2"; then
    pass "runner-reregister-watchdog.path.j2 has [Path] + PathModified"
else
    fail "runner-reregister-watchdog.path.j2 missing [Path] or PathModified"
fi

# Watchdog service has Type=oneshot
if grep -q 'Type=oneshot' "$TEMPLATES_DIR/runner-reregister-watchdog.service.j2"; then
    pass "runner-reregister-watchdog.service.j2 has Type=oneshot"
else
    fail "runner-reregister-watchdog.service.j2 missing Type=oneshot"
fi

# ---------------------------------------------------------------------------
section "Script safety checks"
# ---------------------------------------------------------------------------

# DNS guard uses getent hosts (not nslookup)
if grep -q 'getent hosts' "$TEMPLATES_DIR/runner-dns-guard.sh.j2"; then
    pass "runner-dns-guard.sh.j2 uses getent hosts"
else
    fail "runner-dns-guard.sh.j2 should use getent hosts"
fi

# DNS guard restarts tailscaled
if grep -q 'tailscaled' "$TEMPLATES_DIR/runner-dns-guard.sh.j2"; then
    pass "runner-dns-guard.sh.j2 references tailscaled"
else
    fail "runner-dns-guard.sh.j2 missing tailscaled restart"
fi

# DNS guard rewrites resolv.conf from template
if grep -q 'resolv.conf.template' "$TEMPLATES_DIR/runner-dns-guard.sh.j2"; then
    pass "runner-dns-guard.sh.j2 uses resolv.conf.template"
else
    fail "runner-dns-guard.sh.j2 does not reference resolv.conf.template"
fi

# Watchdog checks for "registration deleted from server"
if grep -q 'registration deleted from server' "$TEMPLATES_DIR/runner-reregister-watchdog.sh.j2"; then
    pass "runner-reregister-watchdog.sh.j2 checks for 'registration deleted from server'"
else
    fail "runner-reregister-watchdog.sh.j2 missing 'registration deleted' check"
fi

# Watchdog uses PAT file path variable
if grep -q '/etc/actions-runner/.token' "$TEMPLATES_DIR/runner-reregister-watchdog.sh.j2"; then
    pass "runner-reregister-watchdog.sh.j2 uses /etc/actions-runner/.token"
else
    fail "runner-reregister-watchdog.sh.j2 missing PAT file path"
fi

# Watchdog runs config.sh --replace
if grep -q '\-\-replace' "$TEMPLATES_DIR/runner-reregister-watchdog.sh.j2"; then
    pass "runner-reregister-watchdog.sh.j2 runs config.sh --replace"
else
    fail "runner-reregister-watchdog.sh.j2 missing --replace flag"
fi

# Watchdog has lock file guard (prevents parallel execution)
if grep -q 'LOCK_FILE' "$TEMPLATES_DIR/runner-reregister-watchdog.sh.j2"; then
    pass "runner-reregister-watchdog.sh.j2 has lock file guard"
else
    fail "runner-reregister-watchdog.sh.j2 missing lock file guard"
fi

# ---------------------------------------------------------------------------
section "defaults/main.yml new variables"
# ---------------------------------------------------------------------------

if grep -q 'github_runner_dns_probe_host' "$DEFAULTS_FILE"; then
    pass "defaults/main.yml has github_runner_dns_probe_host"
else
    fail "defaults/main.yml missing github_runner_dns_probe_host"
fi

if grep -q 'github_runner_pat_file' "$DEFAULTS_FILE"; then
    pass "defaults/main.yml has github_runner_pat_file"
else
    fail "defaults/main.yml missing github_runner_pat_file"
fi

if grep -q '/etc/actions-runner/.token' "$DEFAULTS_FILE"; then
    pass "defaults/main.yml github_runner_pat_file points to /etc/actions-runner/.token"
else
    fail "defaults/main.yml github_runner_pat_file wrong value"
fi

# ---------------------------------------------------------------------------
section "tasks/main.yml — zombie cleanup + new units"
# ---------------------------------------------------------------------------

if grep -q 'smart-smoker-runner-1' "$TASKS_FILE"; then
    pass "tasks/main.yml removes smart-smoker-runner-1"
else
    fail "tasks/main.yml missing smart-smoker-runner-1 cleanup"
fi

if grep -q 'smoker-runner-1' "$TASKS_FILE"; then
    pass "tasks/main.yml removes smoker-runner-1"
else
    fail "tasks/main.yml missing smoker-runner-1 cleanup"
fi

if grep -q '.runner_migrated' "$TASKS_FILE"; then
    pass "tasks/main.yml removes .runner_migrated"
else
    fail "tasks/main.yml missing .runner_migrated cleanup"
fi

if grep -q 'runner-dns-guard.timer' "$TASKS_FILE"; then
    pass "tasks/main.yml enables runner-dns-guard.timer"
else
    fail "tasks/main.yml missing runner-dns-guard.timer"
fi

if grep -q 'runner-reregister-watchdog.path' "$TASKS_FILE"; then
    pass "tasks/main.yml enables runner-reregister-watchdog.path"
else
    fail "tasks/main.yml missing runner-reregister-watchdog.path"
fi

if grep -q 'runner-dns-guard-dropin' "$TASKS_FILE"; then
    pass "tasks/main.yml deploys dns-guard drop-in"
else
    fail "tasks/main.yml missing dns-guard drop-in deployment"
fi

if grep -q 'resolv.conf.template' "$TASKS_FILE"; then
    pass "tasks/main.yml deploys resolv.conf.template"
else
    fail "tasks/main.yml missing resolv.conf.template deployment"
fi

# PAT task uses no_log and correct mode
# Verify no_log: true appears within 20 lines after the PAT deploy task name
PAT_LINE=$(grep -n 'Deploy PAT to /etc/actions-runner' "$TASKS_FILE" | head -1 | cut -d: -f1)
if [ -n "$PAT_LINE" ]; then
    PAT_TASK_BLOCK=$(sed -n "${PAT_LINE},$((PAT_LINE + 20))p" "$TASKS_FILE")
    if echo "$PAT_TASK_BLOCK" | grep -q 'no_log: true'; then
        pass "PAT deploy task uses no_log: true"
    else
        fail "PAT deploy task missing no_log: true"
    fi
    if echo "$PAT_TASK_BLOCK" | grep -q '"0600"'; then
        pass "PAT deploy task sets mode 0600"
    else
        fail "PAT deploy task missing mode 0600"
    fi
else
    fail "PAT deploy task not found in tasks/main.yml"
    fail "PAT deploy task mode check skipped"
fi

# ---------------------------------------------------------------------------
section "README.md documentation"
# ---------------------------------------------------------------------------

for section_name in \
    "Self-Healing: DNS Guardrail" \
    "Self-Healing: Re-registration Watchdog" \
    "PAT Rotation Procedure" \
    "Zombie Service Cleanup Runbook"; do
    if grep -q "## $section_name" "$README_FILE"; then
        pass "README has section: $section_name"
    else
        fail "README missing section: $section_name"
    fi
done

if grep -q '/etc/actions-runner/.token' "$README_FILE"; then
    pass "README documents /etc/actions-runner/.token path"
else
    fail "README missing /etc/actions-runner/.token"
fi

if grep -q 'smart-smoker-runner-1' "$README_FILE"; then
    pass "README mentions smart-smoker-runner-1 zombie"
else
    fail "README missing smart-smoker-runner-1 in runbook"
fi

# ---------------------------------------------------------------------------
echo ""
echo "Results: $((TOTAL - FAILURES))/$TOTAL passed"
if [ "$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}All tests passed${NC}"
    exit 0
else
    echo -e "${RED}$FAILURES test(s) failed${NC}"
    exit 1
fi
