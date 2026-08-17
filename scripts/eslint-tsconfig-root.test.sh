#!/usr/bin/env bash
# Regression tests for issue #454 — pre-commit lint-staged broken for backend
# files because a workspace eslint config resolved `parserOptions.project`
# against the process cwd instead of the config's own directory.
#
# Run: bash scripts/eslint-tsconfig-root.test.sh
#
# Strategy: two complementary checks against the real repo (no mocks — the
# subject under test IS the checked-in config set).
#   1. Static: EVERY eslintrc in the repo (root config included, any depth,
#      .js/.cjs/.json) that sets `parserOptions.project` — in the top-level
#      block or in any single `overrides` entry — must pin an absolute
#      `tsconfigRootDir` in that same block. The check loads the config with
#      node and inspects the resolved values, so it is block-scoped and accepts
#      any spelling that resolves to an absolute path (`__dirname`,
#      `path.resolve(__dirname, '..')`, …). Without such a pin, project
#      resolution is cwd-dependent and breaks whenever eslint is invoked from a
#      different directory (lint-staged runs it from the repo root).
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
#
# CI: run by the `lint-config` job in .github/workflows/ci-tests.yml. That
# workflow's path filter is a deliberate superset of this suite's discovery
# scope (it matches every `.eslintrc*` in the repo), so the two cannot drift
# into a config that is discovered but never CI-guarded.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ESLINT_BIN="${REPO_ROOT}/node_modules/.bin/eslint"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

# Files this suite creates in the working tree. Removed by the EXIT trap so an
# interrupt, a CI cancellation or any early exit can never leave a
# deliberately-lint-failing canary behind for someone else to `git add`.
CANARY_ABS=""
INSPECT_JS=""

cleanup() {
    [ -n "${CANARY_ABS}" ] && rm -f "${CANARY_ABS}"
    [ -n "${INSPECT_JS}" ] && rm -f "${INSPECT_JS}"
    return 0
}
trap cleanup EXIT INT TERM

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
if ! command -v node >/dev/null 2>&1; then
    echo "FATAL: node not on PATH — the static check loads eslint configs with node"
    exit 2
fi

# Config inspector: loads one eslintrc and reports, per config block, whether a
# block that sets `parserOptions.project` also pins an absolute
# `tsconfigRootDir`. Written to a temp file (cleaned up by the EXIT trap) rather
# than inlined, so quoting stays sane.
INSPECT_JS="$(mktemp "${TMPDIR:-/tmp}/eslint-config-inspect.XXXXXX.js")"
cat > "${INSPECT_JS}" <<'INSPECT'
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
let config;
try {
  if (/\.(js|cjs)$/.test(file)) {
    config = require(file);
  } else if (/\.json$/.test(file)) {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    console.log(`LOAD_ERROR unsupported config extension: ${file}`);
    process.exit(2);
  }
} catch (err) {
  console.log(`LOAD_ERROR ${err.message}`);
  process.exit(2);
}

const problems = [];
let typeAwareBlocks = 0;

// Walk the top-level block and every `overrides` entry independently: the pin
// only protects the block it lives in, so a second override adding `project`
// without its own pin must still be caught.
const visit = (block, label) => {
  if (!block || typeof block !== 'object') return;
  const parserOptions = block.parserOptions;
  if (parserOptions && parserOptions.project) {
    typeAwareBlocks += 1;
    const root = parserOptions.tsconfigRootDir;
    if (typeof root !== 'string' || root.length === 0) {
      problems.push(`${label}: sets parserOptions.project but no parserOptions.tsconfigRootDir`);
    } else if (!path.isAbsolute(root)) {
      problems.push(`${label}: tsconfigRootDir "${root}" is not absolute, so project resolution still depends on cwd`);
    } else if (!fs.existsSync(root)) {
      problems.push(`${label}: tsconfigRootDir "${root}" does not exist`);
    }
  }
  if (Array.isArray(block.overrides)) {
    block.overrides.forEach((entry, i) => visit(entry, `${label} > overrides[${i}]`));
  }
};

visit(config, 'top level');

if (problems.length > 0) {
  problems.forEach((problem) => console.log(`PROBLEM ${problem}`));
  process.exit(1);
}
console.log(`OK type-aware blocks: ${typeAwareBlocks}`);
INSPECT

#-------------------------------------------------------------------------------
# Test 1: any config block with parserOptions.project pins an absolute
#         tsconfigRootDir — repo-wide, root config included
#-------------------------------------------------------------------------------
test_project_configs_pin_tsconfig_root_dir() {
    echo "TEST: every eslint config using parserOptions.project pins an absolute tsconfigRootDir"

    # Repo-wide discovery: no directory allow-list and no depth cap, so a config
    # added anywhere (including the repo root, which the previous scope missed)
    # is covered. Build output and dependencies are pruned.
    local configs=()
    while IFS= read -r cfg; do
        configs+=("${cfg}")
    done < <(cd "${REPO_ROOT}" && find . \
        \( -name node_modules -o -name dist -o -name build -o -name coverage -o -name .git -o -name .webpack \) -prune -o \
        -type f \( -name '.eslintrc.js' -o -name '.eslintrc.cjs' -o -name '.eslintrc.json' \) -print 2>/dev/null \
        | sed 's|^\./||' | sort)

    if [ ${#configs[@]} -eq 0 ]; then
        fail "found eslint configs" "no .eslintrc.{js,cjs,json} discovered under ${REPO_ROOT}"
        return
    fi
    pass "found ${#configs[@]} eslint config(s), repo-wide"

    local cfg out status total_type_aware=0 blocks
    for cfg in "${configs[@]}"; do
        out="$(node "${INSPECT_JS}" "${REPO_ROOT}/${cfg}" 2>&1)"
        status=$?

        if [ "${status}" -eq 2 ]; then
            fail "${cfg} pins tsconfigRootDir for every type-aware block" \
                "config could not be loaded: $(echo "${out}" | tr -d '\n' | cut -c1-300)"
            continue
        fi
        if [ "${status}" -ne 0 ]; then
            fail "${cfg} pins tsconfigRootDir for every type-aware block" \
                "$(echo "${out}" | sed 's/^PROBLEM //' | tr '\n' ';') (issue #454)"
            continue
        fi

        blocks="$(echo "${out}" | sed -n 's/^OK type-aware blocks: //p')"
        blocks="${blocks:-0}"
        total_type_aware=$((total_type_aware + blocks))
        if [ "${blocks}" -eq 0 ]; then
            # Not type-aware; cwd cannot affect project resolution here.
            continue
        fi
        pass "${cfg} pins an absolute tsconfigRootDir in all ${blocks} type-aware block(s)"
    done

    # Guard against a vacuous pass: if nothing in the repo is type-aware any
    # more, the check above asserted nothing and the suite must say so.
    if [ "${total_type_aware}" -eq 0 ]; then
        fail "at least one config is type-aware" \
            "no config sets parserOptions.project — the static check asserted nothing"
    else
        pass "static check exercised ${total_type_aware} type-aware config block(s)"
    fi
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

    if [ -e "${REPO_ROOT}/${canary}" ]; then
        fail "planted violation is reported" \
            "${canary} already exists — refusing to overwrite (stray canary from an earlier run?)"
        return
    fi

    # Registered with the EXIT trap *before* the file is created, so an
    # interrupt between here and the explicit rm still removes it.
    CANARY_ABS="${REPO_ROOT}/${canary}"

    # `let` that is never reassigned trips prefer-const from the backend config's
    # @typescript-eslint/recommended extend; the export keeps this valid TS.
    cat > "${CANARY_ABS}" <<'CANARY'
let canaryUnreassigned = 1;
export const canaryValue = canaryUnreassigned;
CANARY

    run_eslint_from_root "${canary}"
    rm -f "${CANARY_ABS}"
    CANARY_ABS=""

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
