#!/usr/bin/env bash
# Tests for scripts/verify-pr/preflight-boot.sh
#
# Run: bash scripts/verify-pr/preflight-boot.test.sh
#
# Strategy: each test builds a throwaway git repo mimicking the checkout layout
# (verify-pr scripts present, stack-runner deps dir) and injects every external
# via env — GH_BIN for auth, STACK_RUNNER_CMD/STACK_DOWN_CMD for the boot, and
# ELECTRON_START_CMD for the launcher. Assertions cover exit codes, the
# stdout-only contract, the one-retry rule, and stderr routing.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOT="${SCRIPT_DIR}/preflight-boot.sh"

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

# Throwaway checkout with all hard prerequisites satisfied. Echoes the dir.
make_repo() {
    local dir; dir="$(mktemp -d)"
    git -C "${dir}" init -q
    mkdir -p "${dir}/scripts/verify-pr" "${dir}/scripts/stack-runner/node_modules" \
             "${dir}/scripts/pr-images/node_modules"
    local f
    for f in parse-checklist.sh tick-checklist.sh detect-ui-change.sh inject-screenshots.sh; do
        touch "${dir}/scripts/verify-pr/${f}"
    done
    # gh stub: authed by default.
    printf '#!/usr/bin/env bash\nexit 0\n' > "${dir}/gh-ok"
    printf '#!/usr/bin/env bash\nexit 1\n' > "${dir}/gh-bad"
    # stack-runner up stub: healthy boot printing the contract + stderr noise.
    cat > "${dir}/up-ok" <<'EOF'
#!/usr/bin/env bash
echo "[stack-runner] building..." >&2
echo "E2E_FRONTEND_URL=http://localhost:41000"
echo "E2E_BACKEND_URL=http://localhost:41001"
echo "STACK_PROJECT_NAME=pr-7-stack"
EOF
    # up stub that fails, counting attempts.
    cat > "${dir}/up-fail" <<EOF
#!/usr/bin/env bash
echo "\$(( \$(cat "${dir}/up-attempts" 2>/dev/null || echo 0) + 1 ))" > "${dir}/up-attempts"
echo "[stack-runner] health wait timed out" >&2
exit 1
EOF
    # down stub, counting teardowns.
    cat > "${dir}/down-count" <<EOF
#!/usr/bin/env bash
echo "\$(( \$(cat "${dir}/downs" 2>/dev/null || echo 0) + 1 ))" > "${dir}/downs"
EOF
    printf '#!/usr/bin/env bash\nexit 0\n' > "${dir}/electron-ok"
    printf '#!/usr/bin/env bash\nexit 1\n' > "${dir}/electron-bad"
    # Electron stub that proves it saw the sourced contract.
    cat > "${dir}/electron-env" <<EOF
#!/usr/bin/env bash
echo "electron saw STACK_PROJECT_NAME=\${STACK_PROJECT_NAME:-MISSING}" > "${dir}/electron-env.out"
EOF
    chmod +x "${dir}"/gh-ok "${dir}"/gh-bad "${dir}"/up-ok "${dir}"/up-fail \
             "${dir}"/down-count "${dir}"/electron-ok "${dir}"/electron-bad "${dir}"/electron-env
    echo "${dir}"
}

run_boot() { # run_boot <dir> <stdout-file> <stderr-file> [extra env/args via globals]
    local dir="$1" out="$2" err="$3"; shift 3
    (cd "${dir}" && GH_BIN="${dir}/gh-ok" \
        STACK_RUNNER_CMD="${STACK_RUNNER_CMD:-${dir}/up-ok}" \
        STACK_DOWN_CMD="${STACK_DOWN_CMD:-${dir}/down-count}" \
        ELECTRON_START_CMD="${ELECTRON_START_CMD:-${dir}/electron-ok}" \
        bash "${BOOT}" --pr 7 "$@") >"${out}" 2>"${err}"
}

# ── Test 1: healthy boot → exit 0, contract ONLY on stdout ───────────────────
test_happy_path_contract() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    run_boot "${dir}" "${out}" "${err}"; code=$?
    if [ "${code}" -eq 0 ] \
        && grep -q '^STACK_PROJECT_NAME=pr-7-stack$' "${out}" \
        && grep -q '^E2E_FRONTEND_URL=' "${out}" \
        && ! grep -q 'stack-runner' "${out}" \
        && grep -q 'building' "${err}"; then
        pass "healthy boot → exit 0, clean sourceable contract on stdout"
    else
        fail "healthy boot → exit 0, clean sourceable contract on stdout" "code=${code} out=$(cat "${out}") err=$(cat "${err}")"
    fi
}

# ── Test 2: gh unauthenticated → exit 3, nothing booted ──────────────────────
test_gh_auth_hard_fail() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    (cd "${dir}" && GH_BIN="${dir}/gh-bad" STACK_RUNNER_CMD="${dir}/up-ok" \
        bash "${BOOT}" --pr 7) >"${out}" 2>"${err}"; code=$?
    if [ "${code}" -eq 3 ] && grep -q 'not authenticated' "${err}" && [ ! -s "${out}" ]; then
        pass "gh unauthenticated → exit 3, empty stdout"
    else
        fail "gh unauthenticated → exit 3, empty stdout" "code=${code}"
    fi
}

# ── Test 3: missing stack-runner deps → exit 3 (never auto-installs) ─────────
test_missing_deps_hard_fail() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    rmdir "${dir}/scripts/stack-runner/node_modules"
    run_boot "${dir}" "${out}" "${err}"; code=$?
    if [ "${code}" -eq 3 ] && grep -q 'stack-runner deps missing' "${err}"; then
        pass "missing stack-runner deps → exit 3"
    else
        fail "missing stack-runner deps → exit 3" "code=${code} err=$(cat "${err}")"
    fi
}

# ── Test 4: missing pr-images deps is a WARN, not a failure ──────────────────
test_soft_warn_screenshots() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    rmdir "${dir}/scripts/pr-images/node_modules"
    run_boot "${dir}" "${out}" "${err}"; code=$?
    if [ "${code}" -eq 0 ] && grep -q 'WARN — screenshots unavailable' "${err}"; then
        pass "missing pr-images deps → WARN on stderr, still boots"
    else
        fail "missing pr-images deps → WARN on stderr, still boots" "code=${code} err=$(cat "${err}")"
    fi
}

# ── Test 5: boot fails twice → exactly 2 attempts, teardown between, exit 4 ──
test_one_retry_then_abort() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    STACK_RUNNER_CMD="${dir}/up-fail" run_boot "${dir}" "${out}" "${err}"; code=$?
    if [ "${code}" -eq 4 ] \
        && [ "$(cat "${dir}/up-attempts")" = "2" ] \
        && [ "$(cat "${dir}/downs")" = "2" ] \
        && [ ! -s "${out}" ]; then
        pass "double boot failure → 2 attempts, 2 teardowns, exit 4"
    else
        fail "double boot failure → 2 attempts, 2 teardowns, exit 4" \
            "code=${code} attempts=$(cat "${dir}/up-attempts" 2>/dev/null) downs=$(cat "${dir}/downs" 2>/dev/null)"
    fi
}

# ── Test 6: --electron passes the contract into the launcher env ─────────────
test_electron_gets_contract() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    ELECTRON_START_CMD="${dir}/electron-env" run_boot "${dir}" "${out}" "${err}" --electron; code=$?
    if [ "${code}" -eq 0 ] \
        && grep -q 'electron saw STACK_PROJECT_NAME=pr-7-stack' "${dir}/electron-env.out"; then
        pass "--electron → launcher runs with sourced contract in env"
    else
        fail "--electron → launcher runs with sourced contract in env" "code=${code}"
    fi
}

# ── Test 7: Electron failure after healthy boot → exit 5, contract still out ─
test_electron_fail_leaves_stack() {
    local dir out err code
    dir="$(make_repo)"; out="${dir}/out"; err="${dir}/err"
    ELECTRON_START_CMD="${dir}/electron-bad" run_boot "${dir}" "${out}" "${err}" --electron; code=$?
    if [ "${code}" -eq 5 ] \
        && grep -q '^STACK_PROJECT_NAME=pr-7-stack$' "${out}" \
        && [ ! -f "${dir}/downs" ]; then
        pass "Electron fail → exit 5, contract emitted, stack left up"
    else
        fail "Electron fail → exit 5, contract emitted, stack left up" "code=${code} out=$(cat "${out}")"
    fi
}

echo "preflight-boot.sh tests:"
test_happy_path_contract
test_gh_auth_hard_fail
test_missing_deps_hard_fail
test_soft_warn_screenshots
test_one_retry_then_abort
test_electron_gets_contract
test_electron_fail_leaves_stack

echo ""
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  failed: %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
