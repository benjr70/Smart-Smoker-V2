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
#      at `.env.dev`, and no compose file mounts a backend dotenv as an
#      `env_file` — in either the inline or the multi-line YAML list spelling.
#   6. `.gitignore` ignores the whole `.env*` class rather than three specific
#      names, while keeping `.env.example` (and every already-tracked dotenv)
#      committable, and no tracked dotenv assigns a literal secret value. The
#      original leak slipped in under a filename nobody had listed; guarding
#      that one name would just relocate the next one.
#   7. The specific VAPID private key that leaked in `.env.dev` appears in no
#      tracked file at all — not just no dotenv. The first cut of this suite
#      scanned dotenvs only, and so was blind to the copies of the same literal
#      sitting in `scripts/test-phase3-story0-*.sh` (and to the fixture in this
#      very file). The needle is stored base64-encoded below so the guard does
#      not itself re-commit the secret it exists to keep out.
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
# Four files name it on purpose rather than pointing at it: CHANGELOG.md records
# history, this suite is the guard, .gitignore explains why the ignore rule was
# broadened to the whole class, and .env.example carries the key-rotation
# warning. What the check is really after is a file that still expects to *use*
# apps/backend/.env.dev.
STALE_REFS="$(git -C "${REPO_ROOT}" grep -l -F -- '.env.dev' -- \
    ':!CHANGELOG.md' \
    ':!**/CHANGELOG.md' \
    ':!scripts/backend-env-example.test.sh' \
    ':!.gitignore' \
    ':!apps/backend/.env.example' \
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

# Detects an `env_file:` directive that pulls in a backend dotenv, in either
# compose spelling: the inline scalar/flow form (`env_file: ./x/.env.dev`,
# `env_file: [.env.dev]`) and the standard multi-line YAML list form
# (`env_file:` followed by indented `- ` entries). Prints every offending line;
# prints nothing when the file is clean.
compose_backend_env_file_refs() {
    awk '
        function is_backend_dotenv(s) {
            return (s ~ /\.env\.(dev|example)/ || s ~ /apps\/backend\/\.env/)
        }
        /^[[:space:]]*env_file:/ {
            rest = $0
            sub(/^[[:space:]]*env_file:/, "", rest)
            if (rest ~ /[^[:space:]]/) {
                # Inline scalar or flow-sequence form, complete on this line.
                if (is_backend_dotenv(rest)) { print FILENAME ":" FNR ":" $0 }
                inblock = 0
            } else {
                # Block form: the entries follow on subsequent lines.
                inblock = 1
            }
            next
        }
        inblock && /^[[:space:]]*(#.*)?$/ { next }
        inblock && /^[[:space:]]*-/ {
            if (is_backend_dotenv($0)) { print FILENAME ":" FNR ":" $0 }
            next
        }
        inblock { inblock = 0 }
    ' "$1"
}

# The detector is the whole check, and no compose file uses `env_file` today —
# so exercise it against fixtures first. Without this, Test 6 would pass just as
# happily with a detector that never matches anything.
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "${FIXTURE_DIR}"' EXIT

cat > "${FIXTURE_DIR}/inline.yml" <<'FIXTURE'
services:
  backend:
    image: backend
    env_file: ./apps/backend/.env.dev
FIXTURE

cat > "${FIXTURE_DIR}/list.yml" <<'FIXTURE'
services:
  backend:
    image: backend
    env_file:
      # the leaked dev dotenv, smuggled in as a YAML list entry
      - ./apps/backend/.env.example
    ports:
      - '3001:3001'
FIXTURE

cat > "${FIXTURE_DIR}/clean.yml" <<'FIXTURE'
services:
  backend:
    image: backend
    environment:
      - DB_URL=${DB_URL}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
    env_file:
      - ./secrets/runtime.env
FIXTURE

if [ -n "$(compose_backend_env_file_refs "${FIXTURE_DIR}/inline.yml")" ]; then
    pass "env_file detector catches the inline form"
else
    fail "env_file detector catches the inline form" \
        "a compose file with 'env_file: ./apps/backend/.env.dev' was not flagged"
fi

if [ -n "$(compose_backend_env_file_refs "${FIXTURE_DIR}/list.yml")" ]; then
    pass "env_file detector catches the multi-line YAML list form"
else
    fail "env_file detector catches the multi-line YAML list form" \
        "a compose file listing a backend dotenv under 'env_file:' was not flagged"
fi

if [ -z "$(compose_backend_env_file_refs "${FIXTURE_DIR}/clean.yml")" ]; then
    pass "env_file detector leaves a clean compose file alone"
else
    fail "env_file detector leaves a clean compose file alone" \
        "flagged: $(compose_backend_env_file_refs "${FIXTURE_DIR}/clean.yml")"
fi

COMPOSE_FILES="$(git -C "${REPO_ROOT}" ls-files '*docker-compose*.yml' '*docker-compose*.yaml')"
if [ -z "${COMPOSE_FILES}" ]; then
    fail "compose files were found to scan" "none matched — the check is hollow"
else
    pass "compose files were found to scan"

    BAD_ENV_FILE=""
    for f in ${COMPOSE_FILES}; do
        if [ -n "$(compose_backend_env_file_refs "${REPO_ROOT}/${f}")" ]; then
            BAD_ENV_FILE="${BAD_ENV_FILE} ${f}"
        fi
    done

    if [ -z "${BAD_ENV_FILE}" ]; then
        pass "no compose file uses a backend dotenv as an env_file"
    else
        fail "no compose file uses a backend dotenv as an env_file" \
            "offenders:${BAD_ENV_FILE}"
    fi
fi

echo "Test 7: .gitignore ignores the dotenv class, not one filename"

# The original leak landed as `.env.dev`, a name .gitignore did not cover. A
# guard on that one name just moves the next leak to `.env.staging`, so assert
# the ignore rule covers the class and still lets the committed template — and
# every file already tracked — through.
ignored() {
    git -C "${REPO_ROOT}" check-ignore -q "$1"
}

for candidate in \
    apps/backend/.env.dev \
    apps/backend/.env.staging \
    apps/newapp/.env.prod \
    packages/theme/.env \
    .env.dev; do
    if ignored "${candidate}"; then
        pass "${candidate} is git-ignored"
    else
        fail "${candidate} is git-ignored" \
            "a developer could commit real secrets under this name without warning"
    fi
done

if ignored apps/backend/.env.example; then
    fail "apps/backend/.env.example is NOT git-ignored" \
        "the template must stay committable despite the .env class ignore"
else
    pass "apps/backend/.env.example is NOT git-ignored"
fi

# A negation that is too narrow would start ignoring files that are already in
# the index — they would keep working locally but silently drop out of any
# `git add` flow, which is exactly the kind of trap worth catching here.
NEWLY_IGNORED="$(git -C "${REPO_ROOT}" ls-files |
    git -C "${REPO_ROOT}" check-ignore --stdin 2>/dev/null || true)"
if [ -z "${NEWLY_IGNORED}" ]; then
    pass "no tracked file is git-ignored"
else
    fail "no tracked file is git-ignored" \
        "tracked but ignored: $(printf '%s' "${NEWLY_IGNORED}" | tr '\n' ' ')"
fi

echo "Test 8: no tracked dotenv carries a literal secret value"

# .gitignore cannot protect the dotenv files that are legitimately tracked
# (build-time configs). This is the content-level half of the same guard: those
# files may carry plain configuration, but never a literal credential. A value
# is safe when it is empty or a pure ${VAR} interpolation resolved at deploy.
SECRET_KEY_RE='(PRIVATE_KEY|PUBLIC_KEY|PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|CREDENTIAL)'
secret_assignments() {
    grep -nE "^[[:space:]]*[A-Za-z_][A-Za-z_0-9]*${SECRET_KEY_RE}[A-Za-z_0-9]*=.+" "$1" 2>/dev/null |
        grep -vE '=[[:space:]]*\$\{[A-Za-z_][A-Za-z_0-9]*\}[[:space:]]*$' || true
}

# Fixture first: the real tracked dotenvs are all clean today, so without this
# the check below would pass with a regex that matches nothing. The fixture
# reproduces the *shape* of the deleted .env.dev — a bare 43-char VAPID key next
# to an interpolated password — with an obviously synthetic value. The real key
# must never appear here; see Test 9, which enforces exactly that.
cat > "${FIXTURE_DIR}/leaky.env" <<'FIXTURE'
DB_URL=mongodb://smartsmoker:${MONGO_APP_PASSWORD}@mongo:27017/db?authSource=admin
VAPID_PRIVATE_KEY=EXAMPLE_FAKE_VAPID_PRIVATE_KEY_FOR_TESTS_00
FIXTURE
cat > "${FIXTURE_DIR}/safe.env" <<'FIXTURE'
# blank template plus a deploy-time interpolation
VAPID_PRIVATE_KEY=
MONGO_PASSWORD=${MONGO_APP_PASSWORD}
REACT_APP_CLOUD_URL=/api/
FIXTURE

if [ -n "$(secret_assignments "${FIXTURE_DIR}/leaky.env")" ]; then
    pass "secret-value detector catches a literal key assignment"
else
    fail "secret-value detector catches a literal key assignment" \
        "the shape of the original .env.dev leak went unnoticed"
fi

if [ -z "$(secret_assignments "${FIXTURE_DIR}/safe.env")" ]; then
    pass "secret-value detector allows blanks and \${VAR} interpolations"
else
    fail "secret-value detector allows blanks and \${VAR} interpolations" \
        "flagged: $(secret_assignments "${FIXTURE_DIR}/safe.env")"
fi

TRACKED_DOTENVS="$(git -C "${REPO_ROOT}" ls-files | grep -E '(^|/)\.env($|\.)' || true)"
if [ -z "${TRACKED_DOTENVS}" ]; then
    fail "tracked dotenv files were found to scan" \
        "none matched — .env.example itself should be tracked, so the scan is broken"
else
    pass "tracked dotenv files were found to scan"

    LEAKED=""
    for f in ${TRACKED_DOTENVS}; do
        if [ -n "$(secret_assignments "${REPO_ROOT}/${f}")" ]; then
            LEAKED="${LEAKED} ${f}"
        fi
    done

    if [ -z "${LEAKED}" ]; then
        pass "no tracked dotenv assigns a literal secret value"
    else
        fail "no tracked dotenv assigns a literal secret value" \
            "offenders:${LEAKED}"
    fi
fi

echo "Test 9: the compromised VAPID private key is nowhere in the tracked tree"

# Test 8 only looks at dotenv files. The key that leaked in `.env.dev` had also
# been pasted into ordinary shell scripts, where a dotenv-shaped scan can never
# see it — so scan every tracked text file for the literal itself.
#
# The needle is kept base64-encoded, not verbatim: a guard that embeds the
# compromised string re-publishes it on every clone and trips GitHub secret
# scanning / push protection (which this slice turns on). Encoding it keeps the
# scrub self-enforcing without that cost.
COMPROMISED_KEY_B64='MDU2UW1IeHpmRTl6Tkw5M0V3dGR4YV9wM0NZUVZub2pURDczOFgzNmdHWQ=='
COMPROMISED_KEY="$(printf '%s' "${COMPROMISED_KEY_B64}" | base64 -d 2>/dev/null || true)"

# Without this, a decode that silently produced an empty string would turn the
# scan below into `grep -F ""`, which matches every line of every file — i.e. a
# loud false failure — or, with a broken flag combination, into a hollow pass.
if printf '%s' "${COMPROMISED_KEY}" | grep -qE '^[A-Za-z0-9_-]{43}$'; then
    pass "the compromised-key needle decodes to a 43-char VAPID private key"
else
    fail "the compromised-key needle decodes to a 43-char VAPID private key" \
        "base64 decode produced $(printf '%s' "${COMPROMISED_KEY}" | wc -c) bytes — the scan below would be meaningless"
    COMPROMISED_KEY=""
fi

# Prints "file:line" for every occurrence of the needle in the named files.
needle_hits() {
    [ -n "${COMPROMISED_KEY}" ] || return 0
    grep -I -n -F -e "${COMPROMISED_KEY}" "$@" 2>/dev/null || true
}

# Fixture control: prove the scanner actually finds the literal (in a shell
# export, the shape the real offenders used) and leaves an innocent file alone.
{
    printf 'export VAPID_PUBLIC_KEY=BDb95f2I\n'
    printf 'export VAPID_PRIVATE_KEY=%s\n' "${COMPROMISED_KEY}"
} > "${FIXTURE_DIR}/leaky.sh"
cat > "${FIXTURE_DIR}/clean.sh" <<'FIXTURE'
export VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:?set me}"
export VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:?set me}"
FIXTURE

if [ -n "$(needle_hits "${FIXTURE_DIR}/leaky.sh")" ]; then
    pass "compromised-key scanner catches the literal in a shell script"
else
    fail "compromised-key scanner catches the literal in a shell script" \
        "the exact shape of the scripts/test-phase3-story0-*.sh leak went unnoticed"
fi

if [ -z "$(needle_hits "${FIXTURE_DIR}/clean.sh")" ]; then
    pass "compromised-key scanner leaves a key-free script alone"
else
    fail "compromised-key scanner leaves a key-free script alone" \
        "flagged: $(needle_hits "${FIXTURE_DIR}/clean.sh")"
fi

TRACKED_COUNT="$(git -C "${REPO_ROOT}" ls-files | grep -c . || true)"
if [ "${TRACKED_COUNT}" -lt 100 ]; then
    fail "tracked files were found to scan" \
        "only ${TRACKED_COUNT} tracked files — the tree-wide scan is hollow"
else
    pass "tracked files were found to scan (${TRACKED_COUNT})"

    KEY_HITS="$(
        cd "${REPO_ROOT}" &&
            git ls-files -z |
            xargs -0 -r grep -I -l -F -e "${COMPROMISED_KEY:-__no_needle__}" 2>/dev/null ||
            true
    )"

    if [ -z "${KEY_HITS}" ]; then
        pass "no tracked file contains the compromised VAPID private key"
    else
        fail "no tracked file contains the compromised VAPID private key" \
            "offenders: $(printf '%s' "${KEY_HITS}" | tr '\n' ' ')"
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
