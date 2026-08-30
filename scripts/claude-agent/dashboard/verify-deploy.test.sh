#!/usr/bin/env bash
# Tests for scripts/claude-agent/dashboard/verify-deploy.sh
#
# Run: bash scripts/claude-agent/dashboard/verify-deploy.test.sh
#
# Strategy: the script talks to the box through four injectable binaries
# (SYSTEMCTL_BIN, SS_BIN, CURL_BIN, JQ_BIN). Every test builds a temp dir with
# stubs for the first three — jq is real — so the whole post-deploy check runs
# hermetically here with no unit, no listener and no :8090 server. Assertions
# cover the exit code plus the specific guard line that must fail, because the
# contract the human relies on is "non-zero with a message naming the guard".

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY="${SCRIPT_DIR}/verify-deploy.sh"

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

good_status() { # a /api/status body with every guard green
    cat <<'EOF'
{
  "maps": {"error": null, "stale": false, "items": []},
  "wayfinder": {"unknown": false, "maps": 2, "frontier": 5, "afk": 3},
  "pipeline": {"scan": {"slices": 4, "wayfinder": 1, "openMaps": 2}}
}
EOF
}

make_env() { # make_env → temp dir with stubs; caller tweaks the control files
    local dir; dir="$(mktemp -d)"

    echo 'active' > "${dir}/unit-state"
    cat > "${dir}/systemctl-stub" <<EOF
#!/usr/bin/env bash
cat "${dir}/unit-state"
[ "\$(cat "${dir}/unit-state")" = "active" ]
EOF

    echo 'LISTEN 0 5 0.0.0.0:8090 0.0.0.0:* users:(("python3",pid=4242,fd=3))' \
        > "${dir}/ss-out"
    cat > "${dir}/ss-stub" <<EOF
#!/usr/bin/env bash
cat "${dir}/ss-out"
EOF

    echo '200' > "${dir}/http-code"
    good_status > "${dir}/body"
    # curl stub: honours -o <file> -w '%{http_code}' the script uses, and the
    # plain body fetch. Ignores the URL.
    cat > "${dir}/curl-stub" <<EOF
#!/usr/bin/env bash
out=''
prev=''
for a in "\$@"; do
    if [ "\${prev}" = "-o" ]; then out="\${a}"; fi
    prev="\${a}"
done
if [ -n "\${out}" ]; then
    cp "${dir}/body" "\${out}" 2>/dev/null || true
    cat "${dir}/http-code"
else
    cat "${dir}/body"
fi
EOF

    chmod +x "${dir}"/*-stub
    echo "${dir}"
}

run_verify() { # run_verify <dir> [args...] — echoes output, returns exit code
    local dir="$1"; shift
    SYSTEMCTL_BIN="${dir}/systemctl-stub" \
    SS_BIN="${dir}/ss-stub" \
    CURL_BIN="${dir}/curl-stub" \
        bash "${VERIFY}" "$@" 2>&1
}

# ── Test 1: everything green → exit 0 ───────────────────────────────────────
test_all_green() {
    local dir out code
    dir="$(make_env)"
    out="$(run_verify "${dir}" --prev-pid 111)"; code=$?
    if [ "${code}" -eq 0 ] && printf '%s' "${out}" | grep -q 'ALL GUARDS PASSED'; then
        pass "all guards green → exit 0"
    else
        fail "all guards green → exit 0" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 2: unit not active → fail naming the unit guard ────────────────────
test_unit_inactive() {
    local dir out code
    dir="$(make_env)"
    echo 'inactive' > "${dir}/unit-state"
    out="$(run_verify "${dir}" --prev-pid 111)"; code=$?
    if [ "${code}" -ne 0 ] && printf '%s' "${out}" | grep -q 'FAIL: unit active'; then
        pass "inactive unit → non-zero naming the unit guard"
    else
        fail "inactive unit → non-zero naming the unit guard" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 3: same PID as before the restart → stale-process fail ─────────────
test_stale_pid() {
    local dir out code
    dir="$(make_env)"
    out="$(run_verify "${dir}" --prev-pid 4242)"; code=$?
    if [ "${code}" -ne 0 ] \
        && printf '%s' "${out}" | grep -q 'FAIL: listener restarted' \
        && printf '%s' "${out}" | grep -q '4242'; then
        pass "unchanged PID → non-zero, stale process reported"
    else
        fail "unchanged PID → non-zero, stale process reported" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 4: nothing listening on :8090 → listener guard fails ───────────────
test_no_listener() {
    local dir out code
    dir="$(make_env)"
    : > "${dir}/ss-out"
    out="$(run_verify "${dir}" --prev-pid 111)"; code=$?
    if [ "${code}" -ne 0 ] && printf '%s' "${out}" | grep -q 'FAIL: listener on'; then
        pass "no listener → non-zero naming the listener guard"
    else
        fail "no listener → non-zero naming the listener guard" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 5: non-200 /api/status → http guard fails ─────────────────────────
test_http_not_200() {
    local dir out code
    dir="$(make_env)"
    echo '503' > "${dir}/http-code"
    out="$(run_verify "${dir}" --prev-pid 111)"; code=$?
    if [ "${code}" -ne 0 ] && printf '%s' "${out}" | grep -q 'FAIL: /api/status 200'; then
        pass "503 from /api/status → non-zero naming the http guard"
    else
        fail "503 from /api/status → non-zero naming the http guard" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 6: the round-1 bug class — maps.error set, wayfinder.unknown true ──
test_round1_bug_class() {
    local dir out code
    dir="$(make_env)"
    cat > "${dir}/body" <<'EOF'
{
  "maps": {"error": "gh: exit 1", "stale": true},
  "wayfinder": {"unknown": true, "maps": null, "frontier": null, "afk": null},
  "pipeline": {"scan": {"slices": 4, "wayfinder": 1, "openMaps": 2}}
}
EOF
    out="$(run_verify "${dir}" --prev-pid 111)"; code=$?
    if [ "${code}" -ne 0 ] \
        && printf '%s' "${out}" | grep -q 'FAIL: maps.error null' \
        && printf '%s' "${out}" | grep -q 'FAIL: wayfinder.unknown false' \
        && printf '%s' "${out}" | grep -q 'FAIL: maps.stale false' \
        && printf '%s' "${out}" | grep -q 'FAIL: wayfinder tile counts numeric'; then
        pass "round-1 bug class → all four tile guards fail"
    else
        fail "round-1 bug class → all four tile guards fail" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 7: old work-probe module → pipeline.scan keys guard fails ─────────
test_stale_work_probe() {
    local dir out code
    dir="$(make_env)"
    cat > "${dir}/body" <<'EOF'
{
  "maps": {"error": null, "stale": false},
  "wayfinder": {"unknown": false, "maps": 2, "frontier": 5, "afk": 3},
  "pipeline": {"scan": {"eligible": 4}}
}
EOF
    out="$(run_verify "${dir}" --prev-pid 111)"; code=$?
    if [ "${code}" -ne 0 ] \
        && printf '%s' "${out}" | grep -q 'FAIL: pipeline.scan'; then
        pass "cached old work-probe → pipeline.scan guard fails"
    else
        fail "cached old work-probe → pipeline.scan guard fails" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 8: --unit-scope none skips the unit guard but still checks the rest ─
test_unit_scope_none() {
    local dir out code
    dir="$(make_env)"
    echo 'inactive' > "${dir}/unit-state"
    out="$(run_verify "${dir}" --prev-pid 111 --unit-scope none)"; code=$?
    if [ "${code}" -eq 0 ] && printf '%s' "${out}" | grep -q 'SKIP: unit active'; then
        pass "--unit-scope none → unit guard skipped, rest green"
    else
        fail "--unit-scope none → unit guard skipped, rest green" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 9: --capture-pid prints the current listener PID ───────────────────
test_capture_pid() {
    local dir out code
    dir="$(make_env)"
    out="$(run_verify "${dir}" --capture-pid)"; code=$?
    if [ "${code}" -eq 0 ] && [ "${out}" = "4242" ]; then
        pass "--capture-pid → prints the listening PID only"
    else
        fail "--capture-pid → prints the listening PID only" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

# ── Test 10: missing --prev-pid is a usage error, never a silent pass ───────
test_prev_pid_required() {
    local dir out code
    dir="$(make_env)"
    out="$(run_verify "${dir}")"; code=$?
    if [ "${code}" -eq 3 ] && printf '%s' "${out}" | grep -q -- '--prev-pid'; then
        pass "missing --prev-pid → exit 3 usage error"
    else
        fail "missing --prev-pid → exit 3 usage error" "code=${code} out=${out}"
    fi
    rm -rf "${dir}"
}

echo "=== verify-deploy.sh tests ==="
test_all_green
test_unit_inactive
test_stale_pid
test_no_listener
test_http_not_200
test_round1_bug_class
test_stale_work_probe
test_unit_scope_none
test_capture_pid
test_prev_pid_required

echo ""
echo "Tests run: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    for name in "${FAILED_NAMES[@]}"; do echo "  - ${name}"; done
    exit 1
fi
exit 0
