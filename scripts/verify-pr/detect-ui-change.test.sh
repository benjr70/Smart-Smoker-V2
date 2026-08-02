#!/usr/bin/env bash
# Tests for scripts/verify-pr/detect-ui-change.sh
#
# Run: bash scripts/verify-pr/detect-ui-change.test.sh
#
# Pure text transform: changed paths in, UI surfaces out. It gates whether a PR
# gets a screenshot tour posted into its description, so its false positives
# cost a whole browser round on the box and its false negatives silently drop
# the feature. Both directions are tested here rather than left to skill prose.
#
# Rules under test:
#   - a rendering file under an app source root emits that app's surface
#   - a shared package source file emits BOTH surfaces
#   - non-rendering extensions (.ts, .md, .yml, .json) emit nothing
#   - test / story / snapshot / mock files emit nothing even with a UI extension
#   - backend + infra + docs changes emit nothing
#   - output is deduped and sorted; a mixed diff emits each surface once
#   - empty stdin is legal and emits nothing (exit 0)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECT="${SCRIPT_DIR}/detect-ui-change.sh"

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

if [ ! -f "${DETECT}" ]; then
    echo "FATAL: ${DETECT} not found"
    exit 2
fi

# assert_surfaces <name> <expected-newline-separated> <paths...>
assert_surfaces() {
    local name="$1" expected="$2"
    shift 2

    local actual rc
    actual="$(printf '%s\n' "$@" | bash "${DETECT}")"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "${name}" "exit ${rc}"
        return
    fi
    if [ "${actual}" = "${expected}" ]; then
        pass "${name}"
    else
        fail "${name}" "expected [${expected}] got [${actual}]"
    fi
}

#-------------------------------------------------------------------------------
# Test 1: app source roots map to their own surface.
#-------------------------------------------------------------------------------
test_app_roots() {
    echo "TEST: a rendering file under an app source root emits that surface"

    assert_surfaces "frontend .tsx → frontend" "frontend" \
        "apps/frontend/src/components/Settings/Settings.tsx"
    assert_surfaces "frontend .css → frontend" "frontend" \
        "apps/frontend/src/App.css"
    assert_surfaces "smoker .tsx → smoker" "smoker" \
        "apps/smoker/src/components/Smoke/Smoke.tsx"
    assert_surfaces "smoker public html → smoker" "smoker" \
        "apps/smoker/public/thin.html"
}

#-------------------------------------------------------------------------------
# Test 2: a shared package renders inside both apps.
#-------------------------------------------------------------------------------
test_shared_package_fans_out() {
    echo "TEST: a shared package source file emits BOTH surfaces"

    assert_surfaces "TemperatureChart → both" "$(printf 'frontend\nsmoker')" \
        "packages/TemperatureChart/src/TemperatureChart.tsx"
    # A package that does not exist yet (PRD #424's packages/theme) is covered by
    # the same generic root — no edit needed when it lands.
    assert_surfaces "future packages/theme → both" "$(printf 'frontend\nsmoker')" \
        "packages/theme/src/tokens.css"
}

#-------------------------------------------------------------------------------
# Test 3: non-rendering extensions never trigger a tour.
#-------------------------------------------------------------------------------
test_non_rendering_extensions() {
    echo "TEST: non-rendering extensions emit nothing"

    assert_surfaces ".ts service layer" "" \
        "apps/frontend/src/api/smokeClient.ts"
    assert_surfaces "markdown" "" \
        "apps/frontend/README.md"
    assert_surfaces "json" "" \
        "apps/smoker/package.json"
    assert_surfaces "workflow yml" "" \
        ".github/workflows/test.yml"
}

#-------------------------------------------------------------------------------
# Test 4: tests/stories/snapshots ship no pixels.
#-------------------------------------------------------------------------------
test_test_files_excluded() {
    echo "TEST: test / story / snapshot / mock files emit nothing"

    assert_surfaces "component test" "" \
        "apps/frontend/src/components/Settings/Settings.test.tsx"
    assert_surfaces "spec file" "" \
        "apps/smoker/src/components/Smoke/Smoke.spec.tsx"
    assert_surfaces "__tests__ dir" "" \
        "apps/frontend/src/components/__tests__/App.tsx"
    assert_surfaces "__snapshots__ dir" "" \
        "apps/frontend/src/components/__snapshots__/App.tsx.svg"
}

#-------------------------------------------------------------------------------
# Test 5: backend / infra / docs are not UI.
#-------------------------------------------------------------------------------
test_non_ui_areas() {
    echo "TEST: backend, device-service, infra and docs emit nothing"

    assert_surfaces "backend service" "" \
        "apps/backend/src/notifications/notifications.service.ts"
    assert_surfaces "device-service" "" \
        "apps/device-service/src/serial/serial.service.ts"
    assert_surfaces "terraform" "" \
        "infra/proxmox/terraform/dev-cloud/main.tf"
    assert_surfaces "docs svg outside a source root" "" \
        "docs/architecture/diagram.svg"
}

#-------------------------------------------------------------------------------
# Test 6: a realistic mixed diff — deduped, sorted, one line per surface.
#-------------------------------------------------------------------------------
test_mixed_diff() {
    echo "TEST: a mixed diff emits each surface exactly once, sorted"

    assert_surfaces "mixed diff" "$(printf 'frontend\nsmoker')" \
        "apps/backend/src/settings/settings.controller.ts" \
        "apps/frontend/src/components/Settings/Settings.tsx" \
        "apps/frontend/src/components/Settings/Settings.css" \
        "apps/frontend/src/components/Settings/Settings.test.tsx" \
        "apps/smoker/src/components/Smoke/Smoke.tsx" \
        "README.md"

    assert_surfaces "frontend-only diff stays single-surface" "frontend" \
        "apps/frontend/src/components/Nav/Nav.tsx" \
        "apps/frontend/src/components/Nav/Nav.scss" \
        "apps/backend/src/state/state.gateway.ts"
}

#-------------------------------------------------------------------------------
# Test 7: interface hygiene — empty input, ./ prefixes, --list-globs, bad usage.
#-------------------------------------------------------------------------------
test_interface() {
    echo "TEST: interface — empty stdin, ./ prefix, --list-globs, usage error"

    local out rc
    out="$(printf '' | bash "${DETECT}")"
    rc=$?
    if [ "${rc}" -eq 0 ] && [ -z "${out}" ]; then
        pass "empty stdin → no surfaces, exit 0"
    else
        fail "empty stdin → no surfaces, exit 0" "exit ${rc}, out [${out}]"
    fi

    assert_surfaces "./-prefixed path still matches" "frontend" \
        "./apps/frontend/src/App.tsx"

    out="$(bash "${DETECT}" --list-globs)"
    rc=$?
    if [ "${rc}" -eq 0 ] && printf '%s' "${out}" | grep -q 'apps/frontend/src/'; then
        pass "--list-globs publishes the root table"
    else
        fail "--list-globs publishes the root table" "exit ${rc}, out [${out}]"
    fi

    bash "${DETECT}" --bogus >/dev/null 2>&1
    rc=$?
    if [ "${rc}" -eq 2 ]; then
        pass "unknown flag exits 2"
    else
        fail "unknown flag exits 2" "exit ${rc}"
    fi
}

echo "=== detect-ui-change.sh tests ==="
test_app_roots
test_shared_package_fans_out
test_non_rendering_extensions
test_test_files_excluded
test_non_ui_areas
test_mixed_diff
test_interface

echo
echo "=== ${TESTS_RUN} tests, ${TESTS_FAILED} failed ==="
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  - %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
