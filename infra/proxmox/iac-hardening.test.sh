#!/usr/bin/env bash
# Regression tests for the prod-deploy IaC hardening slice (issue #238).
#
# Running the first gated production deploy required a chain of manual fixes
# applied directly to the prod box and its daemon config. This suite locks those
# fixes into infrastructure-as-code so a rebuild/reprovision reproduces a working
# box and the prod smoke gate is real (blocking) again.
#
# The assertions are intentionally config-level: each fix corresponds to a
# specific line/setting in an Ansible role, a Terraform module, or a workflow.
# They guard against silent regression of the exact settings that broke the
# deploy.
#
# Run: bash infra/proxmox/iac-hardening.test.sh
# Or:  ./infra/proxmox/iac-hardening.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DOCKER_TASKS="${SCRIPT_DIR}/ansible/roles/docker/tasks/main.yml"
PROD_PLAYBOOK="${SCRIPT_DIR}/ansible/playbooks/setup-prod-cloud.yml"
LXC_MODULE_MAIN="${SCRIPT_DIR}/terraform/modules/lxc-container/main.tf"
LXC_MODULE_VARS="${SCRIPT_DIR}/terraform/modules/lxc-container/variables.tf"
PROD_ENV_VARS="${SCRIPT_DIR}/terraform/environments/prod-cloud/variables.tf"
PROD_DEPLOY_WF="${REPO_ROOT}/.github/workflows/prod-deploy.yml"

# Test counters
TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES+=("$1")
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "    $2"
    fi
}

#-------------------------------------------------------------------------------
# AC 1: the docker role installs crun and sets crun as the default runtime.
# runc fails on net.ipv4.ip_unprivileged_port_start in an unprivileged LXC, so
# the box must run containers under crun or no app container starts.
#-------------------------------------------------------------------------------
test_docker_role_installs_crun() {
    echo "TEST: docker role installs crun and sets default-runtime: crun"

    if [ ! -f "${DOCKER_TASKS}" ]; then
        fail "docker tasks file exists" "missing: ${DOCKER_TASKS}"
        return
    fi

    if ! grep -qE '(^|[^[:alnum:]])crun([^[:alnum:]]|$)' "${DOCKER_TASKS}"; then
        fail "docker role must install the crun package" \
             "no 'crun' package reference found in ${DOCKER_TASKS}"
        return
    fi

    if ! grep -q '"default-runtime": *"crun"' "${DOCKER_TASKS}"; then
        fail "daemon.json must set \"default-runtime\": \"crun\"" \
             "runc default would fail on ip_unprivileged_port_start in unprivileged LXC"
        return
    fi

    pass "docker role installs crun and sets default-runtime: crun"
}

#-------------------------------------------------------------------------------
# AC 2: the daemon.json default-address-pools must NOT use the docker0-
# overlapping 172.17.0.0/16 base. With it, Docker reports "all predefined
# address pools have been fully subnetted" and refuses to create the compose
# network. A pool must be present (so user-defined networks get a deterministic
# range) but it must not collide with docker0.
#-------------------------------------------------------------------------------
test_docker_address_pool_not_overlapping() {
    echo "TEST: daemon.json address pool does not overlap docker0 (172.17.0.0/16)"

    if [ ! -f "${DOCKER_TASKS}" ]; then
        fail "docker tasks file exists" "missing: ${DOCKER_TASKS}"
        return
    fi

    if grep -q '"base": *"172\.17\.0\.0/16"' "${DOCKER_TASKS}"; then
        fail "address pool base must not be 172.17.0.0/16 (overlaps docker0)" \
             "this triggers 'all predefined address pools have been fully subnetted'"
        return
    fi

    if ! grep -q '"default-address-pools"' "${DOCKER_TASKS}"; then
        fail "daemon.json must still define default-address-pools" \
             "a non-overlapping pool keeps compose network ranges deterministic"
        return
    fi

    pass "daemon.json address pool does not overlap docker0"
}

#-------------------------------------------------------------------------------
# AC 3: prod-cloud must get persistent working DNS that survives reboot. The
# dns-guard role ships a systemd timer + known-good resolv.conf (1.1.1.1) that
# remediates the resolv.conf reset to the unreachable 10.0.0.1/10.0.0.2 on the
# isolated bridge. The prod-cloud playbook must apply that role.
#-------------------------------------------------------------------------------
test_prod_playbook_applies_dns_guard() {
    echo "TEST: setup-prod-cloud playbook applies the dns-guard role"

    if [ ! -f "${PROD_PLAYBOOK}" ]; then
        fail "prod-cloud playbook exists" "missing: ${PROD_PLAYBOOK}"
        return
    fi

    # Match the role only within the roles: list (a leading '- ' list entry),
    # not an incidental mention in a comment or debug message.
    if ! grep -qE '^[[:space:]]*-[[:space:]]+dns-guard[[:space:]]*$' "${PROD_PLAYBOOK}"; then
        fail "setup-prod-cloud.yml must list the dns-guard role" \
             "without it resolv.conf resets to unreachable 10.0.0.x and apt/docker pull break"
        return
    fi

    pass "setup-prod-cloud playbook applies the dns-guard role"
}

#-------------------------------------------------------------------------------
# AC 4: Terraform must model the container keyctl feature so it is no longer
# hand-edited drift on the prod CTs. The lxc-container module's features object
# must expose keyctl, and the resource must wire it into the features block.
#-------------------------------------------------------------------------------
test_lxc_module_models_keyctl() {
    echo "TEST: lxc-container module models the keyctl feature"

    if [ ! -f "${LXC_MODULE_VARS}" ] || [ ! -f "${LXC_MODULE_MAIN}" ]; then
        fail "lxc-container module files exist" \
             "missing ${LXC_MODULE_VARS} or ${LXC_MODULE_MAIN}"
        return
    fi

    # The features object variable must declare a keyctl attribute.
    if ! grep -qE 'keyctl[[:space:]]*=[[:space:]]*optional\(bool' "${LXC_MODULE_VARS}"; then
        fail "features variable must declare an optional keyctl bool" \
             "no 'keyctl = optional(bool ...' in ${LXC_MODULE_VARS}"
        return
    fi

    # The resource must wire keyctl from the features value into the features
    # block so a tfvars setting actually reaches Proxmox.
    if ! grep -qE 'keyctl[[:space:]]*=[[:space:]]*try\(features\.value\.keyctl' "${LXC_MODULE_MAIN}"; then
        fail "container resource must wire features.value.keyctl into the features block" \
             "no 'keyctl = try(features.value.keyctl ...' in ${LXC_MODULE_MAIN}"
        return
    fi

    pass "lxc-container module models the keyctl feature"
}

#-------------------------------------------------------------------------------
# AC 4 (cont.): the prod-cloud environment passes its features object straight
# through to the module (features = var.features). Its own features variable
# type must therefore also accept keyctl, or a tfvars that sets keyctl on the
# prod CT (104) fails terraform validate and the keyctl wiring never reaches the
# module.
#-------------------------------------------------------------------------------
test_prod_env_features_accepts_keyctl() {
    echo "TEST: prod-cloud env features variable accepts keyctl"

    if [ ! -f "${PROD_ENV_VARS}" ]; then
        fail "prod-cloud env variables file exists" "missing: ${PROD_ENV_VARS}"
        return
    fi

    if ! grep -qE 'keyctl[[:space:]]*=[[:space:]]*optional\(bool' "${PROD_ENV_VARS}"; then
        fail "prod-cloud features variable must declare an optional keyctl bool" \
             "no 'keyctl = optional(bool ...' in ${PROD_ENV_VARS}"
        return
    fi

    pass "prod-cloud env features variable accepts keyctl"
}

#-------------------------------------------------------------------------------
# AC 6: prod smoke must be blocking again, running from a dedicated
# ubuntu-latest job against the public funnel URLs (no Tailscale needed). The
# advisory continue-on-error from #237 must be gone from the smoke steps, and a
# distinct ubuntu-latest smoke job that runs after deploy must exist.
#-------------------------------------------------------------------------------
test_prod_deploy_smoke_is_blocking() {
    echo "TEST: prod-deploy smoke runs as a blocking ubuntu-latest job"

    if [ ! -f "${PROD_DEPLOY_WF}" ]; then
        fail "prod-deploy workflow exists" "missing: ${PROD_DEPLOY_WF}"
        return
    fi

    # A dedicated smoke job keyed under jobs: must exist.
    if ! grep -qE '^[[:space:]]{2}smoke:' "${PROD_DEPLOY_WF}"; then
        fail "prod-deploy.yml must define a dedicated 'smoke' job" \
             "smoke must run from its own job, not inside the self-hosted deploy job"
        return
    fi

    # That smoke job must run on ubuntu-latest (Playwright-capable, public funnel).
    if ! grep -qE 'runs-on:[[:space:]]*ubuntu-latest' "${PROD_DEPLOY_WF}"; then
        fail "the smoke job must run on ubuntu-latest" \
             "self-hosted runner cannot install Playwright system deps"
        return
    fi

    # The advisory escape hatch must be gone — smoke failure must fail the run.
    if grep -q 'continue-on-error' "${PROD_DEPLOY_WF}"; then
        fail "prod-deploy.yml must not contain continue-on-error (smoke is blocking)" \
             "the #237 advisory downgrade must be reverted"
        return
    fi

    # The smoke job must depend on the deploy job (run after a successful deploy).
    if ! grep -qE 'needs:.*deploy' "${PROD_DEPLOY_WF}"; then
        fail "the smoke job must declare 'needs: ... deploy'" \
             "smoke runs only after the deploy job succeeds"
        return
    fi

    pass "prod-deploy smoke runs as a blocking ubuntu-latest job"
}

#-------------------------------------------------------------------------------
# AC 5: the deploy must copy the helper scripts (deployment-backup.sh,
# deployment-health-check.sh, rollback.sh) to the box itself — they were scp'd
# by hand. The workflow must reference all three in a copy step.
#-------------------------------------------------------------------------------
test_prod_deploy_copies_helper_scripts() {
    echo "TEST: prod-deploy copies the deploy helper scripts to the box"

    if [ ! -f "${PROD_DEPLOY_WF}" ]; then
        fail "prod-deploy workflow exists" "missing: ${PROD_DEPLOY_WF}"
        return
    fi

    local missing=()
    for s in deployment-backup.sh deployment-health-check.sh rollback.sh; do
        if ! grep -q "${s}" "${PROD_DEPLOY_WF}"; then
            missing+=("${s}")
        fi
    done

    if [ "${#missing[@]}" -gt 0 ]; then
        fail "prod-deploy.yml must copy all deploy helper scripts" \
             "missing references: ${missing[*]}"
        return
    fi

    pass "prod-deploy copies the deploy helper scripts to the box"
}

#-------------------------------------------------------------------------------
# Run the suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "prod-deploy IaC hardening regression tests"
echo "=========================================="

test_docker_role_installs_crun
test_docker_address_pool_not_overlapping
test_prod_playbook_applies_dns_guard
test_lxc_module_models_keyctl
test_prod_env_features_accepts_keyctl
test_prod_deploy_smoke_is_blocking
test_prod_deploy_copies_helper_scripts

echo ""
echo "=========================================="
echo "Ran: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
echo "=========================================="

if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failed tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi

exit 0
