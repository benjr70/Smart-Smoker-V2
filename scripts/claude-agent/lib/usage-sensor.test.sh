#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/usage-sensor.sh
#
# Run: bash scripts/claude-agent/lib/usage-sensor.test.sh
#
# Strategy: usage_gate is pure — driven with canned endpoint JSON on stdin.
# usage_sensor_fetch is driven with a curl stub (logs its argv, prints a
# fixture) and a throwaway credentials file, so no network is touched.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=usage-sensor.sh
. "${SCRIPT_DIR}/usage-sensor.sh"

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

# Endpoint fixture builder: five_hour / seven_day utilizations + resets.
fixture() {
    local fh_u="$1" fh_r="$2" sd_u="$3" sd_r="$4"
    cat <<EOF
{ "five_hour": { "utilization": ${fh_u}, "resets_at": "${fh_r}" },
  "seven_day": { "utilization": ${sd_u}, "resets_at": "${sd_r}" },
  "seven_day_opus": null,
  "limits": [
    { "kind": "session", "percent": ${fh_u}, "is_active": true, "resets_at": "${fh_r}" },
    { "kind": "weekly_all", "percent": ${sd_u}, "is_active": true, "resets_at": "${sd_r}" } ] }
EOF
}

#-------------------------------------------------------------------------------
# Test 1: fresh budget (the live 2026-07-10 shape: 19% session / 18% weekly)
# → remainPct 81, session is binding, fires.
#-------------------------------------------------------------------------------
test_fresh_budget_fires() {
    echo "TEST: fresh budget fires"

    local out rc
    out="$(fixture 19 "2026-07-10T22:10:00+00:00" 18 "2026-07-10T19:00:00+00:00" | usage_gate)"
    rc=$?

    local want='{"remainPct":81.00,"resetAt":"2026-07-10T22:10:00+00:00","shouldFire":true}'
    if [ "${rc}" -ne 0 ] || [ "${out}" != "${want}" ]; then
        fail "fresh budget verdict" "rc=${rc}
got:  ${out}
want: ${want}"
        return
    fi

    pass "fresh budget fires"
}

#-------------------------------------------------------------------------------
# Test 2: session nearly spent → no fire, resetAt is the SESSION reset (the
# binding constraint), not the weekly one.
#-------------------------------------------------------------------------------
test_spent_session_blocks() {
    echo "TEST: spent session blocks with session reset"

    local out
    out="$(fixture 90 "2026-07-10T22:10:00+00:00" 20 "2026-07-14T00:00:00+00:00" | usage_gate)"

    local want='{"remainPct":10.00,"resetAt":"2026-07-10T22:10:00+00:00","shouldFire":false}'
    if [ "${out}" != "${want}" ]; then
        fail "spent session verdict" "got:  ${out}
want: ${want}"
        return
    fi

    pass "spent session blocks with session reset"
}

#-------------------------------------------------------------------------------
# Test 3: weekly wall — fresh session but the weekly limit is nearly spent →
# no fire, resetAt is the WEEKLY reset. The old time-proxy gate could never
# see this case.
#-------------------------------------------------------------------------------
test_weekly_wall_blocks() {
    echo "TEST: weekly wall blocks with weekly reset"

    local out
    out="$(fixture 10 "2026-07-10T22:10:00+00:00" 96 "2026-07-14T00:00:00+00:00" | usage_gate)"

    local want='{"remainPct":4.00,"resetAt":"2026-07-14T00:00:00+00:00","shouldFire":false}'
    if [ "${out}" != "${want}" ]; then
        fail "weekly wall verdict" "got:  ${out}
want: ${want}"
        return
    fi

    pass "weekly wall blocks with weekly reset"
}

#-------------------------------------------------------------------------------
# Test 4: a per-model weekly limit (seven_day_opus) binds when it is the worst.
#-------------------------------------------------------------------------------
test_per_model_limit_binds() {
    echo "TEST: per-model weekly limit binds"

    local out
    out="$(cat <<'EOF' | usage_gate
{ "five_hour": { "utilization": 10, "resets_at": "2026-07-10T22:10:00+00:00" },
  "seven_day": { "utilization": 20, "resets_at": "2026-07-14T00:00:00+00:00" },
  "seven_day_opus": { "utilization": 99, "resets_at": "2026-07-15T06:00:00+00:00" } }
EOF
)"

    local want='{"remainPct":1.00,"resetAt":"2026-07-15T06:00:00+00:00","shouldFire":false}'
    if [ "${out}" != "${want}" ]; then
        fail "per-model limit verdict" "got:  ${out}
want: ${want}"
        return
    fi

    pass "per-model weekly limit binds"
}

#-------------------------------------------------------------------------------
# Test 5: malformed / empty / limit-free payloads degrade (exit 3, non-firing
# verdict) — the daemon falls back to the ccusage time-proxy.
#-------------------------------------------------------------------------------
test_malformed_degrades() {
    echo "TEST: malformed payload degrades"

    local out rc
    out="$(printf '%s' 'not json' | usage_gate)"; rc=$?
    if [ "${rc}" -ne 3 ] || [ "${out}" != '{"remainPct":0,"resetAt":"","shouldFire":false}' ]; then
        fail "malformed must degrade rc=3 non-firing" "rc=${rc} out=${out}"
        return
    fi

    out="$(printf '%s' '{"five_hour":null,"seven_day":null}' | usage_gate)"; rc=$?
    if [ "${rc}" -ne 3 ]; then
        fail "limit-free payload must degrade rc=3" "rc=${rc} out=${out}"
        return
    fi

    pass "malformed payload degrades"
}

#-------------------------------------------------------------------------------
# Test 6: usage_sensor_fetch sends the token from the creds file and returns
# the endpoint body; a missing creds file fails without touching curl.
#-------------------------------------------------------------------------------
test_fetch_wires_token() {
    echo "TEST: fetch wires the token"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    printf '%s' '{"claudeAiOauth":{"accessToken":"tok-123"}}' > "${dir}/creds.json"
    cat > "${dir}/curl-stub" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${dir}/curl.args"
printf '%s' '{"five_hour":{"utilization":5,"resets_at":"2026-07-10T22:10:00+00:00"}}'
EOF
    chmod +x "${dir}/curl-stub"

    local body
    body="$(USAGE_CREDS_FILE="${dir}/creds.json" CURL_BIN="${dir}/curl-stub" usage_sensor_fetch)"
    if [ $? -ne 0 ] || ! printf '%s' "${body}" | jq -e '.five_hour' >/dev/null; then
        fail "fetch must return the endpoint body" "body=${body}"
        return
    fi
    if ! grep -q 'Bearer tok-123' "${dir}/curl.args"; then
        fail "fetch must send the creds token" "args: $(cat "${dir}/curl.args")"
        return
    fi

    if USAGE_CREDS_FILE="${dir}/nope.json" CURL_BIN="${dir}/curl-stub" usage_sensor_fetch >/dev/null 2>&1; then
        fail "missing creds file must fail" ""
        return
    fi

    pass "fetch wires the token"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "usage-sensor tests"
echo "=========================================="

test_fresh_budget_fires
test_spent_session_blocks
test_weekly_wall_blocks
test_per_model_limit_binds
test_malformed_degrades
test_fetch_wires_token

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
