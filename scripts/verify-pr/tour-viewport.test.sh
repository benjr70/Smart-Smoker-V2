#!/usr/bin/env bash
# Tests for scripts/verify-pr/tour-viewport.sh
#
# Run: bash scripts/verify-pr/tour-viewport.test.sh
#
# The load-bearing test here is the DRIFT one: the smoker tour viewport must
# equal the kiosk BrowserWindow size in apps/smoker/electron-app/index.ts. That
# file is the device's actual panel; if someone changes the panel and not this
# table, every later tour silently documents a shape the device does not have.
#
# Rules under test:
#   - frontend is portrait (a phone held upright), not a desktop landscape shape
#   - smoker matches the kiosk BrowserWindow width/height, parsed from source
#   - --list publishes the table; an unknown surface exits 2

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VIEWPORT="${SCRIPT_DIR}/tour-viewport.sh"
ELECTRON_MAIN="${REPO_ROOT}/apps/smoker/electron-app/index.ts"

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

if [ ! -f "${VIEWPORT}" ]; then
    echo "FATAL: ${VIEWPORT} not found"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test 1: the frontend tour is a portrait phone, not a landscape desktop.
#-------------------------------------------------------------------------------
test_frontend_is_portrait() {
    echo "TEST: frontend viewport is a portrait phone"

    local out w h
    out="$(bash "${VIEWPORT}" frontend)"

    if printf '%s' "${out}" | grep -Eq '^[0-9]+x[0-9]+$'; then
        pass "frontend prints WxH"
    else
        fail "frontend prints WxH" "got [${out}]"
        return
    fi

    w="${out%x*}"
    h="${out#*x}"

    if [ "${h}" -gt "${w}" ]; then
        pass "portrait (height ${h} > width ${w})"
    else
        fail "portrait (height > width)" "got ${w}x${h} — that is a landscape/desktop shape"
    fi

    # A phone, not a tablet or a narrow desktop window.
    if [ "${w}" -le 480 ]; then
        pass "phone-width viewport (${w} <= 480)"
    else
        fail "phone-width viewport (<= 480)" "got width ${w}"
    fi
}

#-------------------------------------------------------------------------------
# Test 2: DRIFT GUARD — smoker matches the kiosk BrowserWindow in source.
#-------------------------------------------------------------------------------
test_smoker_matches_device_panel() {
    echo "TEST: smoker viewport equals the kiosk BrowserWindow size in source"

    if [ ! -f "${ELECTRON_MAIN}" ]; then
        fail "electron main found" "missing ${ELECTRON_MAIN}"
        return
    fi

    local src width height
    src="$(tr '\n' ' ' < "${ELECTRON_MAIN}")"
    # The kiosk window literal: `new BrowserWindow({ height: 480, width: 800, …`
    width="$(printf '%s' "${src}" | grep -oE 'width:[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')"
    height="$(printf '%s' "${src}" | grep -oE 'height:[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')"

    if [ -z "${width}" ] || [ -z "${height}" ]; then
        fail "parsed BrowserWindow size from source" "width=[${width}] height=[${height}]"
        return
    fi
    pass "parsed BrowserWindow size from source (${width}x${height})"

    local out
    out="$(bash "${VIEWPORT}" smoker)"
    if [ "${out}" = "${width}x${height}" ]; then
        pass "smoker tour viewport matches the device panel"
    else
        fail "smoker tour viewport matches the device panel" \
            "tour says ${out}, apps/smoker/electron-app/index.ts says ${width}x${height} — update SMOKER_VIEWPORT"
    fi
}

#-------------------------------------------------------------------------------
# Test 3: interface — --list, unknown surface, missing arg.
#-------------------------------------------------------------------------------
test_interface() {
    echo "TEST: interface — --list, unknown surface, missing arg"

    local out rc
    out="$(bash "${VIEWPORT}" --list)"
    rc=$?
    if [ "${rc}" -eq 0 ] &&
        printf '%s' "${out}" | grep -q $'frontend\t' &&
        printf '%s' "${out}" | grep -q $'smoker\t'; then
        pass "--list publishes both surfaces"
    else
        fail "--list publishes both surfaces" "exit ${rc}, out [${out}]"
    fi

    bash "${VIEWPORT}" desktop >/dev/null 2>&1
    rc=$?
    if [ "${rc}" -eq 2 ]; then
        pass "unknown surface exits 2"
    else
        fail "unknown surface exits 2" "exit ${rc}"
    fi

    bash "${VIEWPORT}" >/dev/null 2>&1
    rc=$?
    if [ "${rc}" -eq 2 ]; then
        pass "missing surface exits 2"
    else
        fail "missing surface exits 2" "exit ${rc}"
    fi
}

#-------------------------------------------------------------------------------
# Test 4: every surface detect-ui-change can emit has a viewport.
#-------------------------------------------------------------------------------
test_covers_every_surface() {
    echo "TEST: every surface the UI-change gate emits has a viewport"

    local detected surface missing=0
    detected="$(printf '%s\n' \
        "apps/frontend/src/App.tsx" \
        "apps/smoker/src/components/Smoke/Smoke.tsx" \
        "packages/TemperatureChart/src/TemperatureChart.tsx" \
        | bash "${SCRIPT_DIR}/detect-ui-change.sh")"

    while IFS= read -r surface; do
        [ -n "${surface}" ] || continue
        if ! bash "${VIEWPORT}" "${surface}" >/dev/null 2>&1; then
            missing=$((missing + 1))
            echo "    no viewport for surface: ${surface}"
        fi
    done <<< "${detected}"

    if [ "${missing}" -eq 0 ]; then
        pass "all gate surfaces have a viewport"
    else
        fail "all gate surfaces have a viewport" "${missing} missing"
    fi
}

echo "=== tour-viewport.sh tests ==="
test_frontend_is_portrait
test_smoker_matches_device_panel
test_interface
test_covers_every_surface

echo
echo "=== ${TESTS_RUN} tests, ${TESTS_FAILED} failed ==="
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  - %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
