#!/usr/bin/env bash
# Regression tests for issue #454 — pre-commit lint-staged broken for backend
# files because a workspace eslint config resolved `parserOptions.project`
# against the process cwd instead of the config's own directory.
#
# Run: bash scripts/eslint-tsconfig-root.test.sh
#
# Strategy: two complementary checks against the real repo (no mocks — the
# subject under test IS the checked-in config set).
#   1. Static: every workspace .eslintrc.js that sets `parserOptions.project`
#      must also set `tsconfigRootDir`, otherwise resolution is cwd-dependent
#      and breaks whenever eslint is invoked from a different directory
#      (lint-staged runs it from the repo root).
#   2. Behavioral: running eslint from the repo root on a type-aware workspace
#      file must exit clean with no "Parsing error" — the exact symptom of #454.
#
# The behavioral half must not be able to go green without actually linting, so
# it (a) refuses to run at all unless the repo's own eslint binary is installed
# (never `npx eslint`, which would silently fetch a flat-config ESLint that
# cannot read these .eslintrc.js files), (b) asserts eslint's exit status rather
# than only grepping stderr, and (c) proves a real lint pass happened by
# checking eslint's JSON report names the target file, and by planting a known
# violation in the backend source tree and requiring eslint to flag it from the
# repo root. A config-load crash or a missing binary fails these instead of
# quietly matching no substring.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ESLINT_BIN="${REPO_ROOT}/node_modules/.bin/eslint"

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

# Preconditions. The behavioral half is worthless without the repo's own eslint,
# so refuse to run rather than report a hollow pass.
if [ ! -x "${ESLINT_BIN}" ]; then
    echo "FATAL: ${ESLINT_BIN} missing — run 'npm run bootstrap' first"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test 1: any config with parserOptions.project also pins tsconfigRootDir
#-------------------------------------------------------------------------------
test_project_configs_pin_tsconfig_root_dir() {
    echo "TEST: workspace eslint configs using parserOptions.project pin tsconfigRootDir"

    # Search scope is mirrored by the path filter in
    # .github/workflows/lint-config-tests.yml — change both together.
    local configs=()
    while IFS= read -r cfg; do
        configs+=("${cfg}")
    done < <(cd "${REPO_ROOT}" && find apps packages e2e -maxdepth 2 -name '.eslintrc.js' \
        -not -path '*/node_modules/*' 2>/dev/null | sort)

    if [ ${#configs[@]} -eq 0 ]; then
        fail "found workspace eslint configs" "no apps/*/.eslintrc.js or packages/*/.eslintrc.js discovered"
        return
    fi
    pass "found ${#configs[@]} workspace eslint config(s)"

    local cfg
    for cfg in "${configs[@]}"; do
        if ! grep -q 'project:' "${REPO_ROOT}/${cfg}"; then
            # Config is not type-aware; cwd cannot affect project resolution.
            continue
        fi
        if grep -q 'tsconfigRootDir: __dirname' "${REPO_ROOT}/${cfg}"; then
            pass "${cfg} pins tsconfigRootDir: __dirname"
        else
            fail "${cfg} pins tsconfigRootDir: __dirname" \
                "sets parserOptions.project but not tsconfigRootDir — resolution is cwd-relative (issue #454)"
        fi
    done
}

# Run the repo's eslint from the repo root, JSON reporter, on one file.
# Sets RUN_STATUS and RUN_OUT globals. JSON keeps the assertions structural
# instead of relying on human-readable stylish output.
run_eslint_from_root() {
    local target="$1"
    RUN_OUT="$(cd "${REPO_ROOT}" && "${ESLINT_BIN}" --no-fix --format json "${target}" 2>&1)"
    RUN_STATUS=$?
}

#-------------------------------------------------------------------------------
# Test 2: eslint invoked from the repo root (as lint-staged does) lints
#         type-aware workspace files clean — no parsing error, exit 0, and a
#         report that proves the file was really visited
#-------------------------------------------------------------------------------
test_eslint_from_repo_root_parses_backend_file() {
    echo "TEST: eslint run from repo root lints backend/device-service files without a parsing error"

    local targets=(
        "apps/backend/src/app.module.ts"
        "apps/device-service/src/main.ts"
    )

    local target
    for target in "${targets[@]}"; do
        if [ ! -f "${REPO_ROOT}/${target}" ]; then
            fail "${target} lints from repo root" "file not found — update this test's target"
            continue
        fi

        run_eslint_from_root "${target}"

        # Exit 2 is an eslint-level failure (bad/unloadable config, bad CLI use).
        # Exit 1 means lint errors were reported — a parsing error lands here.
        if [ "${RUN_STATUS}" -ne 0 ]; then
            fail "${target} lints from repo root" \
                "eslint exited ${RUN_STATUS}: $(echo "${RUN_OUT}" | tr -d '\n' | cut -c1-400)"
            continue
        fi
        if echo "${RUN_OUT}" | grep -q 'Parsing error'; then
            fail "${target} lints from repo root" "reported a parsing error (issue #454)"
            continue
        fi
        # Positive evidence: the JSON report must contain a result entry for the
        # file we asked about. A crashed or no-op run cannot satisfy this.
        if ! echo "${RUN_OUT}" | grep -q "\"filePath\":\"${REPO_ROOT}/${target}\""; then
            fail "${target} lints from repo root" \
                "eslint produced no report entry for the file — it was not actually linted"
            continue
        fi
        pass "${target} lints from repo root (exit 0, file present in report)"
    done
}

#-------------------------------------------------------------------------------
# Test 3: canary — a deliberate rule violation planted in the backend source
#         tree must be reported when eslint runs from the repo root. This is the
#         guard's own guard: it fails if the config never loads, if the binary
#         is inert, or if the file is silently skipped, so Test 2 can no longer
#         pass by virtue of eslint doing nothing at all.
#-------------------------------------------------------------------------------
test_eslint_from_repo_root_reports_real_violations() {
    echo "TEST: eslint run from repo root reports a planted violation in backend source"

    local canary="apps/backend/src/__eslint-cwd-canary.ts"
    local canary_abs="${REPO_ROOT}/${canary}"

    # `let` that is never reassigned trips prefer-const from the backend config's
    # @typescript-eslint/recommended extend; the export keeps this valid TS.
    cat > "${canary_abs}" <<'CANARY'
let canaryUnreassigned = 1;
export const canaryValue = canaryUnreassigned;
CANARY

    run_eslint_from_root "${canary}"
    rm -f "${canary_abs}"

    if [ "${RUN_STATUS}" -eq 2 ]; then
        fail "planted violation is reported" \
            "eslint exited 2 (config could not be loaded): $(echo "${RUN_OUT}" | tr -d '\n' | cut -c1-400)"
        return
    fi
    if echo "${RUN_OUT}" | grep -q 'Parsing error'; then
        fail "planted violation is reported" \
            "parsing error instead of a rule report — project resolution is cwd-relative (issue #454)"
        return
    fi
    if echo "${RUN_OUT}" | grep -q '"ruleId":"prefer-const"'; then
        pass "planted violation is reported (prefer-const, exit ${RUN_STATUS})"
    else
        fail "planted violation is reported" \
            "expected a prefer-const report; got: $(echo "${RUN_OUT}" | tr -d '\n' | cut -c1-400)"
    fi
}

echo "=========================================="
echo "eslint tsconfigRootDir regression tests (#454)"
echo "=========================================="
echo ""

test_project_configs_pin_tsconfig_root_dir
echo ""
test_eslint_from_repo_root_parses_backend_file
echo ""
test_eslint_from_repo_root_reports_real_violations
echo ""

echo "=========================================="
echo "Tests run: ${TESTS_RUN}  Failed: ${TESTS_FAILED}"
if [ ${TESTS_FAILED} -gt 0 ]; then
    echo "Failures:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    echo "=========================================="
    exit 1
fi
echo "All tests passed"
echo "=========================================="
