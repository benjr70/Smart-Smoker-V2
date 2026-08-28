#!/usr/bin/env bash
# Repo-shape tests for the backend environment contract (issue #568).
#
# Background: `apps/backend/.env.dev` was committed with a REAL VAPID private
# key while being dead weight — the dev and prod deploy workflows export
# VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY from GitHub secrets and the cloud compose
# files read them from the shell environment; nothing `env_file`s it. It is
# replaced by a committed, value-free `apps/backend/.env.example` that documents
# every variable the backend reads.
#
# Run: bash scripts/backend-env-example.test.sh
# Or:  ./scripts/backend-env-example.test.sh
#
# The subject under test IS the checked-in file set, so there is nothing to
# mock. The checks are:
#   1. `apps/backend/.env.dev` is gone from the working tree AND from git's
#      index (a file that is merely untracked would still leak on a fresh
#      clone of a stale branch, and an ignored-but-present file would still be
#      readable in the deploy checkout).
#   2. `apps/backend/.env.example` exists and is tracked.
#   3. Every `process.env.<VAR>` read by non-test backend source appears as a
#      key in `.env.example`. This is the check that keeps the example honest
#      as the backend grows; it derives its expectations from the source
#      rather than from a hardcoded list, and refuses to pass if the
#      extraction turns up nothing (which would make the assertion hollow).
#   4. Every assignment in `.env.example` has an EMPTY value — an example file
#      is documentation, not a credential store. This is the regression guard
#      for the original leak.
#   5. No tracked file (outside CHANGELOG history and this suite) still points
#      at `.env.dev`, and no compose file uses it (or the example) as an
#      `env_file`.
#
# CI: run by the `backend-env-contract` job in .github/workflows/ci-tests.yml.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/apps/backend"
ENV_DEV="${BACKEND_DIR}/.env.dev"
ENV_EXAMPLE="${BACKEND_DIR}/.env.example"

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
if [ ! -d "${BACKEND_DIR}/src" ]; then
    echo "FATAL: ${BACKEND_DIR}/src not found — run from a full repo checkout"
    exit 2
fi
if ! git -C "${REPO_ROOT}" rev-parse --git-dir > /dev/null 2>&1; then
    echo "FATAL: ${REPO_ROOT} is not a git checkout"
    exit 2
fi

echo "Test 1: the leaked apps/backend/.env.dev is gone"

if [ -e "${ENV_DEV}" ]; then
    fail "apps/backend/.env.dev absent from the working tree" \
        "still present at ${ENV_DEV}"
else
    pass "apps/backend/.env.dev absent from the working tree"
fi

if [ -n "$(git -C "${REPO_ROOT}" ls-files -- apps/backend/.env.dev)" ]; then
    fail "apps/backend/.env.dev absent from the git index" \
        "still tracked by git"
else
    pass "apps/backend/.env.dev absent from the git index"
fi

echo "Test 2: apps/backend/.env.example is committed"

if [ -f "${ENV_EXAMPLE}" ]; then
    pass "apps/backend/.env.example exists"
else
    fail "apps/backend/.env.example exists" "missing at ${ENV_EXAMPLE}"
fi

if [ -n "$(git -C "${REPO_ROOT}" ls-files -- apps/backend/.env.example)" ]; then
    pass "apps/backend/.env.example is tracked by git"
else
    fail "apps/backend/.env.example is tracked by git" \
        "file is untracked, so a fresh clone would not get it"
fi

echo "Test 3: every backend env var the source reads is documented"

# Variables read by shipped backend source. Spec files set env vars for their
# own fixtures, so they are excluded — documenting a test-only variable would
# be noise, and missing one would not break a deployment.
read_vars() {
    grep -rhoE 'process\.env\.[A-Za-z_][A-Za-z_0-9]*' "${BACKEND_DIR}/src" \
        --include='*.ts' \
        --exclude='*.spec.ts' \
        --exclude='*.test.ts' \
        --exclude-dir=coverage \
        2>/dev/null |
        sed 's/^process\.env\.//' |
        sort -u
}

# Keys assigned in the example file, ignoring comments and blank lines.
example_keys() {
    [ -f "${ENV_EXAMPLE}" ] || return 0
    grep -E '^[[:space:]]*[A-Za-z_][A-Za-z_0-9]*=' "${ENV_EXAMPLE}" |
        sed -E 's/^[[:space:]]*([A-Za-z_][A-Za-z_0-9]*)=.*/\1/' |
        sort -u
}

SOURCE_VARS="$(read_vars)"
EXAMPLE_KEYS="$(example_keys)"

# Guard against a hollow pass: if the extraction found nothing, the
# "all documented" assertion below would trivially succeed.
SOURCE_VAR_COUNT=$(printf '%s\n' "${SOURCE_VARS}" | grep -c . || true)
if [ "${SOURCE_VAR_COUNT}" -ge 3 ]; then
    pass "backend source yields env vars to check (${SOURCE_VAR_COUNT} found)"
else
    fail "backend source yields env vars to check" \
        "only ${SOURCE_VAR_COUNT} found — the extraction is broken, so the next check is meaningless"
fi

MISSING=""
for var in ${SOURCE_VARS}; do
    if ! printf '%s\n' "${EXAMPLE_KEYS}" | grep -qx "${var}"; then
        MISSING="${MISSING} ${var}"
    fi
done

if [ -z "${MISSING}" ]; then
    pass "every process.env.* read in backend source is listed in .env.example"
else
    fail "every process.env.* read in backend source is listed in .env.example" \
        "undocumented:${MISSING}"
fi

# CORS_EXTRA_ORIGINS is read through a helper that takes `env` as a parameter
# (apps/backend/src/cors-origins.ts), so the textual `process.env.` scan above
# cannot see it. It is a real deployment knob (hermetic per-PR stacks set it),
# so pin it explicitly.
if printf '%s\n' "${EXAMPLE_KEYS}" | grep -qx 'CORS_EXTRA_ORIGINS'; then
    pass "CORS_EXTRA_ORIGINS is listed in .env.example"
else
    fail "CORS_EXTRA_ORIGINS is listed in .env.example" \
        "the backend appends it to its CORS allow-list at boot"
fi

echo "Test 4: .env.example carries no values"

if [ -f "${ENV_EXAMPLE}" ]; then
    NON_BLANK="$(grep -E '^[[:space:]]*[A-Za-z_][A-Za-z_0-9]*=.+' "${ENV_EXAMPLE}" || true)"
    if [ -z "${NON_BLANK}" ]; then
        pass "every key in .env.example has an empty value"
    else
        fail "every key in .env.example has an empty value" \
            "assignments with values: $(printf '%s' "${NON_BLANK}" | tr '\n' ' ')"
    fi

    # Every documented key should carry a one-line comment above it so the
    # example is self-describing for a first-time contributor.
    UNCOMMENTED="$(awk '
        /^[[:space:]]*#/ { commented = 1; next }
        /^[[:space:]]*$/ { commented = 0; next }
        /^[[:space:]]*[A-Za-z_][A-Za-z_0-9]*=/ {
            if (!commented) { sub(/=.*/, ""); print }
            commented = 0
            next
        }
        { commented = 0 }
    ' "${ENV_EXAMPLE}")"
    if [ -z "${UNCOMMENTED}" ]; then
        pass "every key in .env.example is preceded by a comment"
    else
        fail "every key in .env.example is preceded by a comment" \
            "undocumented keys: $(printf '%s' "${UNCOMMENTED}" | tr '\n' ' ')"
    fi
else
    fail "every key in .env.example has an empty value" "file missing"
    fail "every key in .env.example is preceded by a comment" "file missing"
fi

echo "Test 5: nothing in the repo still points at .env.dev"

# Search tracked files only (a stray local artifact is not the repo's problem).
# CHANGELOG.md records history and this suite names the file on purpose.
STALE_REFS="$(git -C "${REPO_ROOT}" grep -l -F -- '.env.dev' -- \
    ':!CHANGELOG.md' \
    ':!**/CHANGELOG.md' \
    ':!scripts/backend-env-example.test.sh' \
    2>/dev/null || true)"
# `.env.development*` lines in .gitignore/docs are a different file entirely.
STALE_REFS="$(
    for f in ${STALE_REFS}; do
        if git -C "${REPO_ROOT}" grep -h -F -- '.env.dev' -- "${f}" |
            grep -qE '\.env\.dev([^a-zA-Z]|$)'; then
            echo "${f}"
        fi
    done
)"

if [ -z "${STALE_REFS}" ]; then
    pass "no tracked file references .env.dev"
else
    fail "no tracked file references .env.dev" \
        "referenced by: $(printf '%s' "${STALE_REFS}" | tr '\n' ' ')"
fi

echo "Test 6: no compose file mounts a backend dotenv as env_file"

COMPOSE_FILES="$(git -C "${REPO_ROOT}" ls-files '*docker-compose*.yml' '*docker-compose*.yaml')"
if [ -z "${COMPOSE_FILES}" ]; then
    fail "compose files were found to scan" "none matched — the check is hollow"
else
    pass "compose files were found to scan"

    BAD_ENV_FILE=""
    for f in ${COMPOSE_FILES}; do
        if grep -nE 'env_file' "${REPO_ROOT}/${f}" | grep -qE '\.env\.(dev|example)'; then
            BAD_ENV_FILE="${BAD_ENV_FILE} ${f}"
        fi
    done

    if [ -z "${BAD_ENV_FILE}" ]; then
        pass "no compose file uses .env.dev/.env.example as an env_file"
    else
        fail "no compose file uses .env.dev/.env.example as an env_file" \
            "offenders:${BAD_ENV_FILE}"
    fi
fi

echo ""
echo "Ran ${TESTS_RUN} checks, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -ne 0 ]; then
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi
exit 0
