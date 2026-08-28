#!/usr/bin/env bash
# Tests for the repository's open-source shape (issue #567).
#
# The repo is published as a showcase project, which means a set of files and
# declarations have to be true of the tree itself rather than of any one app:
# a licence, the standard contributor documents, licence fields on every
# workspace manifest, agent guides free of the retired Ralph pipeline, and a
# web-push contact that comes from the deployment environment instead of the
# maintainer's inbox.
#
# These are checked as text facts about the checked-in files so the suite is
# hermetic: no Docker, no network, no npm install.
#
# Run: bash scripts/repo-shape.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

assert_file_exists() {
    local path="$1"
    local name="$2"
    if [ -f "${REPO_ROOT}/${path}" ]; then
        pass "${name}"
    else
        fail "${name}" "missing file: ${path}"
    fi
}

# Asserts a regex appears in a file, reporting the file when it does not.
assert_matches() {
    local path="$1"
    local pattern="$2"
    local name="$3"
    if [ ! -f "${REPO_ROOT}/${path}" ]; then
        fail "${name}" "missing file: ${path}"
        return
    fi
    if grep -Eq "${pattern}" "${REPO_ROOT}/${path}"; then
        pass "${name}"
    else
        fail "${name}" "${path} does not match /${pattern}/"
    fi
}

assert_not_matches() {
    local path="$1"
    local pattern="$2"
    local name="$3"
    if [ ! -f "${REPO_ROOT}/${path}" ]; then
        fail "${name}" "missing file: ${path}"
        return
    fi
    if grep -Eiq "${pattern}" "${REPO_ROOT}/${path}"; then
        fail "${name}" "${path} still matches /${pattern}/"
    else
        pass "${name}"
    fi
}

echo "TEST: licence"
assert_file_exists "LICENSE" "LICENSE exists at the repo root"
assert_matches "LICENSE" "MIT License" "LICENSE is the MIT licence"
assert_matches "LICENSE" "Copyright \(c\) 2026 Ben Rolf" "LICENSE names the copyright holder"

echo
echo "TEST: every workspace manifest declares MIT"
# One CODEOWNERS-style catch-all list: the root manifest plus every workspace
# npm resolves, so a new app cannot quietly ship without a licence field.
MANIFESTS=(
    "package.json"
    "apps/backend/package.json"
    "apps/device-service/package.json"
    "apps/frontend/package.json"
    "apps/smoker/package.json"
    "packages/TemperatureChart/package.json"
    "packages/api-transport/package.json"
    "packages/smoke-session/package.json"
    "packages/theme/package.json"
    "e2e/package.json"
)
for manifest in "${MANIFESTS[@]}"; do
    assert_matches "${manifest}" '"license"[[:space:]]*:[[:space:]]*"MIT"' \
        "${manifest} declares MIT"
done

echo
echo "TEST: contributor documents"
assert_file_exists "CONTRIBUTING.md" "CONTRIBUTING.md exists"
assert_file_exists "SECURITY.md" "SECURITY.md exists"
assert_file_exists "CODE_OF_CONDUCT.md" "CODE_OF_CONDUCT.md exists"
assert_file_exists "infra/README.md" "infra/README.md exists"
assert_matches "infra/README.md" "reference deployment" \
    "infra/README.md frames infra/proxmox as a reference deployment"

if [ -f "${REPO_ROOT}/CODEOWNERS" ] || [ -f "${REPO_ROOT}/.github/CODEOWNERS" ]; then
    pass "CODEOWNERS exists"
else
    fail "CODEOWNERS exists" "neither CODEOWNERS nor .github/CODEOWNERS found"
fi

echo
echo "TEST: agent guides no longer describe the retired Ralph pipeline"
assert_not_matches "CLAUDE.md" "ralph" "CLAUDE.md mentions no Ralph"
assert_not_matches "AGENTS.md" "ralph" "AGENTS.md mentions no Ralph"
# AGENTS.md's first table sends readers straight to the skills catalogue, so a
# guide that is clean itself but links to a page still presenting Ralph as the
# live workflow leaves the pipeline documented after all.
assert_not_matches ".claude/skills/SKILLS.md" "ralph" \
    "the skills catalogue AGENTS.md links to mentions no Ralph"

echo
echo "TEST: VAPID_CONTACT is plumbed through every cloud deployment path"
assert_matches "cloud.docker-compose.yml" "VAPID_CONTACT" \
    "prod cloud compose forwards VAPID_CONTACT"
assert_matches "cloud.docker-compose.dev.yml" "VAPID_CONTACT" \
    "dev cloud compose forwards VAPID_CONTACT"
assert_matches ".github/workflows/prod-deploy.yml" "VAPID_CONTACT" \
    "prod deploy workflow passes VAPID_CONTACT"
assert_matches ".github/workflows/dev-deploy.yml" "VAPID_CONTACT" \
    "dev deploy workflow passes VAPID_CONTACT"

echo
echo "TEST: the maintainer's address is not baked into backend source"
# Directory pathspecs, not globs: git's `**/*.ts` form skips files sitting
# directly in the directory (main.ts, app.module.ts, cors-origins.ts), which is
# exactly where a bootstrap-time contact address would be reintroduced.
if git -C "${REPO_ROOT}" grep -qI "benrolf70@gmail.com" -- 'apps/backend/src'; then
    fail "backend source contains no personal contact address" \
        "found benrolf70@gmail.com under apps/backend/src"
else
    pass "backend source contains no personal contact address"
fi

echo
echo "================================"
echo "Tests run: ${TESTS_RUN}"
echo "Failed:    ${TESTS_FAILED}"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failing tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi
echo "All repo-shape tests passed."
