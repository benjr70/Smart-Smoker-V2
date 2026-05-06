#!/usr/bin/env bash
# Regression tests for scripts/deployment-health-check.sh
#
# These tests focus on the resolver-invocation contract: the call into
# scripts/smoke/resolve-host-cli.ts MUST work regardless of the caller's
# current working directory. The original bug (issue #202) was that
# `node --import tsx/esm` resolves the `tsx` package from the process CWD,
# not from the script's directory, so invoking the health check from the
# repo root (as GitHub Actions does) failed with ERR_MODULE_NOT_FOUND.
#
# Run: bash scripts/deployment-health-check.test.sh
# Or:  ./scripts/deployment-health-check.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_SCRIPT="${SCRIPT_DIR}/deployment-health-check.sh"
SMOKE_DIR="${SCRIPT_DIR}/smoke"

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

# Preconditions
if [ ! -f "${HEALTH_SCRIPT}" ]; then
    echo "FATAL: ${HEALTH_SCRIPT} not found"
    exit 2
fi
if [ ! -d "${SMOKE_DIR}/node_modules" ]; then
    echo "FATAL: ${SMOKE_DIR}/node_modules missing — run 'npm --prefix scripts/smoke ci' first"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test: the resolver invocation embedded in the health-check script must not
# depend on the caller's CWD. We exercise the FQDN-passthrough branch (case (a)
# of resolve-host.ts) which requires no network or Tailscale access — it just
# strips a trailing dot and echoes the input back. If `tsx` is not resolvable
# from the CWD, the invocation fails with ERR_MODULE_NOT_FOUND before the
# resolver logic runs. That is the bug we are guarding against.
#-------------------------------------------------------------------------------
test_resolver_invocation_cwd_independent() {
    echo "TEST: resolver invocation works from a non-repo CWD (FQDN passthrough)"

    local tmpdir
    tmpdir="$(mktemp -d)"
    trap "rm -rf '${tmpdir}'" RETURN

    local output
    # Run from /tmp/<random>, not the repo root, to mimic the bug repro.
    # Use RETRY_COUNT=1 to keep subsequent failing curl checks fast.
    output=$(cd "${tmpdir}" && "${HEALTH_SCRIPT}" smoker-dev-cloud-1.tail74646.ts.net 1 2>&1) || true

    # Primary assertion: the resolver must NOT bail with ERR_MODULE_NOT_FOUND.
    if echo "${output}" | grep -q "ERR_MODULE_NOT_FOUND"; then
        fail "resolver invocation must not fail with ERR_MODULE_NOT_FOUND" \
             "got: $(echo "${output}" | grep -m1 ERR_MODULE_NOT_FOUND)"
        return
    fi

    # Secondary assertion: the resolver must successfully report the resolved FQDN.
    # The script prints "Resolved to: <fqdn>" on the success path.
    if ! echo "${output}" | grep -q "Resolved to: smoker-dev-cloud-1.tail74646.ts.net"; then
        fail "resolver did not report successful FQDN resolution" \
             "output snippet: $(echo "${output}" | head -20 | tr '\n' '|')"
        return
    fi

    pass "resolver invocation works from a non-repo CWD"
}

#-------------------------------------------------------------------------------
# Test: the localhost branch must not regress — it bypasses the resolver
# entirely, so it should print neither "Resolving Tailscale FQDN" nor an
# ERR_MODULE_NOT_FOUND, and it should reach the Backend API check step.
#-------------------------------------------------------------------------------
test_localhost_bypasses_resolver() {
    echo "TEST: localhost branch bypasses the resolver"

    local output
    # localhost will fail the curl health checks (nothing listening on 8443),
    # but the assertions below are about the resolver branch behaviour, not the
    # final exit code. Run with RETRY_COUNT=1 to keep it fast.
    output=$("${HEALTH_SCRIPT}" localhost 1 2>&1) || true

    if echo "${output}" | grep -q "ERR_MODULE_NOT_FOUND"; then
        fail "localhost branch must not invoke the resolver" \
             "ERR_MODULE_NOT_FOUND leaked into the localhost branch"
        return
    fi

    if echo "${output}" | grep -q "Resolving Tailscale FQDN"; then
        fail "localhost branch must skip 'Resolving Tailscale FQDN' message"
        return
    fi

    # The script must reach the Backend API check (proves we didn't exit early
    # on the resolver branch).
    if ! echo "${output}" | grep -q "Checking Backend API"; then
        fail "localhost branch did not reach the Backend API check step"
        return
    fi

    pass "localhost branch bypasses the resolver"
}

#-------------------------------------------------------------------------------
# Run the suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "deployment-health-check.sh regression tests"
echo "=========================================="

test_resolver_invocation_cwd_independent
test_localhost_bypasses_resolver

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
