#!/usr/bin/env bash
# Tests for the dashboard's fire-log discovery (scripts/claude-agent/dashboard/server.py)
#
# Run: bash scripts/claude-agent/dashboard/dashboard-log-regex.test.sh
#
# The team->AFK rename changed the fire-log filename prefix from
# the historical `team-pickup-<TS>.log` to `afk-pickup-<TS>.log`. Old logs keep
# the old prefix forever, so the dashboard must read BOTH names identically and
# order them by timestamp, not by filename.
#
# Strategy: import server.py in-process via `python3 -c` (it is import-safe — the
# HTTP server only starts under `__main__`) and drive `_TS_RE` / `fetch_fires`
# against a temp LOG_DIR holding one old-named and one new-named log.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON_BIN:-python3}"

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

# Import server.py by path without executing its __main__ block.
py_import() {
    cat <<EOF
import importlib.util, sys
spec = importlib.util.spec_from_file_location("dash_server", "${SCRIPT_DIR}/server.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
EOF
}

# Write a minimal fire log that parse_fire_log can read.
write_log() {
    local path="$1" issue="$2"
    cat > "${path}" <<EOF
=== agent-run 20260101T000000Z ===
picked:   #${issue} some slice
=== agent-run exit 0 ===
EOF
}

#-------------------------------------------------------------------------------
# Test 1: _TS_RE matches both the historical team-pickup- and the new
# afk-pickup- filename, extracting the same timestamp.
#-------------------------------------------------------------------------------
test_ts_re_matches_both_prefixes() {
    echo "TEST: _TS_RE matches the historical team-pickup- and new afk-pickup- names"
    local out
    out="$("${PY}" -c "$(py_import)
old = m._TS_RE.search('/logs/team-pickup-20260101T000000Z.log')  # historical name
new = m._TS_RE.search('/logs/afk-pickup-20260101T000000Z.log')
print('none' if old is None else old.group(1))
print('none' if new is None else new.group(1))
" 2>&1)"

    local want='20260101T000000Z
20260101T000000Z'
    if [ "${out}" != "${want}" ]; then
        fail "_TS_RE must match both prefixes" "got: ${out}"
        return
    fi
    pass "_TS_RE matches the historical team-pickup- and new afk-pickup- names"
}

#-------------------------------------------------------------------------------
# Test 2: an old-named and a new-named log are discovered and parsed
# identically, newest timestamp first regardless of filename ordering.
#-------------------------------------------------------------------------------
test_fetch_fires_reads_both_prefixes() {
    echo "TEST: fetch_fires reads old- and new-named logs, newest first"
    local dir; dir="$(mktemp -d)"
    # Alphabetically 'afk-' sorts before 'team-', but the team- log is NEWER —
    # so a filename sort would invert the history.
    write_log "${dir}/afk-pickup-20260101T000000Z.log" 101
    write_log "${dir}/team-pickup-20260102T000000Z.log" 102  # historical name

    local out
    out="$("${PY}" -c "$(py_import)
import json
m.LOG_DIR = '${dir}'
fires = m.fetch_fires()['items']
print(json.dumps([[f['id'], f['summary'], f['exit']] for f in fires]))
" 2>&1)"
    rm -rf "${dir}"

    local want='[["20260102T000000Z", "#102 some slice", 0], ["20260101T000000Z", "#101 some slice", 0]]'
    if [ "${out}" != "${want}" ]; then
        fail "fetch_fires must read both prefixes newest-first" "got:  ${out}
want: ${want}"
        return
    fi
    pass "fetch_fires reads old- and new-named logs, newest first"
}

echo "=========================================="
echo "dashboard fire-log discovery tests"
echo "=========================================="

test_ts_re_matches_both_prefixes
test_fetch_fires_reads_both_prefixes

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
