#!/usr/bin/env bash
# Tests for scripts/verify-pr/chrome-mcp-wrapper.sh
#
# Run: bash scripts/verify-pr/chrome-mcp-wrapper.test.sh
#
# Strategy: the wrapper's only system boundary is the `npx` invocation that
# launches the Playwright MCP server (it `exec`s it at the very end). We mock
# `npx` by PATH-prepending a stub that records its full argument vector and the
# DISPLAY / XAUTHORITY it inherited to ${NPX_CALL_LOG}, then exits 0 — standing
# in for the real long-running stdio MCP server.
#
# The rotating GNOME/XWayland X-authority file is simulated by pointing
# XDG_RUNTIME_DIR at a temp dir and dropping a `.mutter-Xwaylandauth.XXXXXX`
# file inside it (mutter writes a new random-suffixed file every boot). This
# lets us assert glob resolution for the found / rotated / absent cases without
# a real desktop session.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER="${SCRIPT_DIR}/chrome-mcp-wrapper.sh"

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

if [ ! -f "${WRAPPER}" ]; then
    echo "FATAL: ${WRAPPER} not found"
    exit 2
fi

# Mock bin with an `npx` stub that records its invocation + inherited display
# env to ${NPX_CALL_LOG}. Emulates the real MCP server by exiting 0.
make_mock_bin() {
    local mock_dir
    mock_dir="$(mktemp -d)"
    cat > "${mock_dir}/npx" <<'EOF'
#!/usr/bin/env bash
{
    echo "npx $*"
    echo "DISPLAY=${DISPLAY:-}"
    echo "XAUTHORITY=${XAUTHORITY:-}"
} >> "${NPX_CALL_LOG}"
exit 0
EOF
    chmod +x "${mock_dir}/npx"
    echo "${mock_dir}"
}

# Extract the value passed to --user-data-dir from a `npx ...` log line.
user_data_dir_from_log() {
    grep '^npx ' "$1" | head -1 | sed -n 's/.*--user-data-dir \([^ ]*\).*/\1/p'
}

#-------------------------------------------------------------------------------
# Test 1: with a present session auth file, the wrapper resolves XAUTHORITY to
#         that file and launches the MCP server (AC 2).
#-------------------------------------------------------------------------------
test_resolves_present_auth_file() {
    echo "TEST: resolves the current session X-authority file"

    local tmp runtime mock_dir log authfile
    tmp="$(mktemp -d)"
    runtime="${tmp}/run"
    mkdir -p "${runtime}"
    authfile="${runtime}/.mutter-Xwaylandauth.ABC123"
    echo "fake-xauth" > "${authfile}"
    log="${tmp}/npx-calls.log"
    touch "${log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    NPX_CALL_LOG="${log}" XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        CHROME_MCP_PROFILE_BASE="${tmp}/profiles" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "wrapper should exit 0 when a session auth file is present" \
            "exit=${exit_code}; log:
$(cat "${log}")"
        return
    fi

    if ! grep -qF "XAUTHORITY=${authfile}" "${log}"; then
        fail "MCP server must inherit XAUTHORITY pointing at the session auth file" \
            "expected XAUTHORITY=${authfile}; log:
$(cat "${log}")"
        return
    fi

    pass "resolves the current session X-authority file"
}

#-------------------------------------------------------------------------------
# Test 2: after a reboot the auth file has a DIFFERENT random suffix; the
#         wrapper must resolve whatever current file the glob finds, never a
#         hardcoded name (AC 2 — survives reboots with zero manual fixes).
#-------------------------------------------------------------------------------
test_resolves_rotated_auth_file() {
    echo "TEST: resolves a rotated (differently-suffixed) auth file"

    local tmp runtime mock_dir log authfile
    tmp="$(mktemp -d)"
    runtime="${tmp}/run"
    mkdir -p "${runtime}"
    # A suffix unrelated to any previous boot.
    authfile="${runtime}/.mutter-Xwaylandauth.ZZ9Q7K"
    echo "fake-xauth" > "${authfile}"
    log="${tmp}/npx-calls.log"
    touch "${log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    NPX_CALL_LOG="${log}" XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        CHROME_MCP_PROFILE_BASE="${tmp}/profiles" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "wrapper should exit 0 for a rotated auth file" \
            "exit=${exit_code}; log:
$(cat "${log}")"
        return
    fi

    if ! grep -qF "XAUTHORITY=${authfile}" "${log}"; then
        fail "wrapper must resolve the rotated auth file by glob" \
            "expected XAUTHORITY=${authfile}; log:
$(cat "${log}")"
        return
    fi

    pass "resolves a rotated (differently-suffixed) auth file"
}

#-------------------------------------------------------------------------------
# Test 3: no session auth file (no desktop session) => the wrapper exits
#         non-zero with a clear error naming the missing precondition, and NEVER
#         launches the MCP server (no headless fallback) (AC 5).
#-------------------------------------------------------------------------------
test_absent_auth_file_errors_clearly() {
    echo "TEST: absent auth file => clear error, non-zero, no headless fallback"

    local tmp runtime mock_dir log stderr
    tmp="$(mktemp -d)"
    runtime="${tmp}/run"
    mkdir -p "${runtime}" # empty — no .mutter-Xwaylandauth.* present
    log="${tmp}/npx-calls.log"
    stderr="${tmp}/stderr.txt"
    touch "${log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    NPX_CALL_LOG="${log}" XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        CHROME_MCP_PROFILE_BASE="${tmp}/profiles" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "absent auth file must exit non-zero" "got exit 0"
        return
    fi

    # Must NEVER have launched the MCP server.
    if [ -s "${log}" ]; then
        fail "must NOT launch the MCP server when no desktop session (no headless fallback)" \
            "log:
$(cat "${log}")"
        return
    fi

    # Error must name the missing precondition and reject headless.
    if ! grep -qi "x-authority" "${stderr}"; then
        fail "error must name the missing precondition (X-authority file)" \
            "stderr:
$(cat "${stderr}")"
        return
    fi
    if ! grep -qi "headless" "${stderr}"; then
        fail "error must state it refuses to fall back to headless" \
            "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "absent auth file => clear error, non-zero, no headless fallback"
}

#-------------------------------------------------------------------------------
# Test 4: the MCP server is launched for REAL Chrome, headful — `--browser
#         chrome` is present and `--headless` is NEVER passed (AC 3).
#-------------------------------------------------------------------------------
test_launches_real_chrome_headful() {
    echo "TEST: launches real Chrome (--browser chrome), headful (no --headless)"

    local tmp runtime mock_dir log authfile
    tmp="$(mktemp -d)"
    runtime="${tmp}/run"
    mkdir -p "${runtime}"
    authfile="${runtime}/.mutter-Xwaylandauth.HEADF1"
    echo "fake-xauth" > "${authfile}"
    log="${tmp}/npx-calls.log"
    touch "${log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    NPX_CALL_LOG="${log}" XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        CHROME_MCP_PROFILE_BASE="${tmp}/profiles" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>&1

    local npx_line
    npx_line="$(grep '^npx ' "${log}" | head -1)"

    if ! printf '%s' "${npx_line}" | grep -qF -- "--browser chrome"; then
        fail "must launch the MCP server with --browser chrome (real Chrome)" \
            "npx line: ${npx_line}"
        return
    fi
    if printf '%s' "${npx_line}" | grep -qF -- "--headless"; then
        fail "must NEVER pass --headless (headful only, no headless fallback)" \
            "npx line: ${npx_line}"
        return
    fi

    pass "launches real Chrome (--browser chrome), headful (no --headless)"
}

#-------------------------------------------------------------------------------
# Test 5: profile freshness — two invocations produce two DIFFERENT
#         user-data-dir paths, and each is a real freshly-created directory, so
#         no cookies/permissions persist between runs (AC 4).
#-------------------------------------------------------------------------------
test_fresh_unique_profile_per_run() {
    echo "TEST: each run gets a fresh, unique user-data-dir"

    local tmp runtime mock_dir log1 log2 authfile d1 d2
    tmp="$(mktemp -d)"
    runtime="${tmp}/run"
    mkdir -p "${runtime}"
    authfile="${runtime}/.mutter-Xwaylandauth.FRESH1"
    echo "fake-xauth" > "${authfile}"
    log1="${tmp}/npx-1.log"
    log2="${tmp}/npx-2.log"
    touch "${log1}" "${log2}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    NPX_CALL_LOG="${log1}" XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        CHROME_MCP_PROFILE_BASE="${tmp}/profiles" \
        PATH="${mock_dir}:${PATH}" bash "${WRAPPER}" >/dev/null 2>&1
    NPX_CALL_LOG="${log2}" XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        CHROME_MCP_PROFILE_BASE="${tmp}/profiles" \
        PATH="${mock_dir}:${PATH}" bash "${WRAPPER}" >/dev/null 2>&1

    d1="$(user_data_dir_from_log "${log1}")"
    d2="$(user_data_dir_from_log "${log2}")"

    if [ -z "${d1}" ] || [ -z "${d2}" ]; then
        fail "wrapper must pass a --user-data-dir on every run" \
            "d1='${d1}' d2='${d2}'"
        return
    fi
    if [ "${d1}" = "${d2}" ]; then
        fail "each run must get a DIFFERENT user-data-dir" "both were '${d1}'"
        return
    fi
    if [ ! -d "${d1}" ] || [ ! -d "${d2}" ]; then
        fail "each user-data-dir must be a freshly-created directory" \
            "d1='${d1}' d2='${d2}'"
        return
    fi

    pass "each run gets a fresh, unique user-data-dir"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "chrome-mcp-wrapper.sh tests"
echo "=========================================="

test_resolves_present_auth_file
test_resolves_rotated_auth_file
test_absent_auth_file_errors_clearly
test_launches_real_chrome_headful
test_fresh_unique_profile_per_run

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
