#!/usr/bin/env bash
# Tests for the release-please manifest configuration (issue #500).
#
# release-please is config-only: there is no app to unit test, but the three
# ways this pipeline silently breaks are all statically checkable —
#   * the wrong set of package.json files gets version-bumped, so apps drift out
#     of lockstep with the repo version,
#   * a bumped workspace package is depended on elsewhere by a range that the
#     bump invalidates (temperaturechart at ^1.0.0 vs a 2.0.0 release), which
#     un-links the workspace and sends npm to the public registry, and
#   * the release workflow authenticates with GITHUB_TOKEN, whose Releases do
#     NOT trigger downstream `release: published` workflows (release.yml), so a
#     merged release PR tags the repo and then nothing deploys.
# These tests lock all three, plus the manifest bootstrap version and the tag
# shape (`vX.Y.Z`) that release.yml's set-version job parses.
#
# Parsed with jq/grep rather than by running release-please so the suite is
# fast, hermetic and needs no network.
#
# NOTE: no CI workflow executes this suite yet. Issue #500 is a new-files-only
# slice (its AC forbids editing existing workflows) and claude-agent-tests.yml
# is path-filtered to scripts/claude-agent/**, so wiring this into CI is a
# later slice. Until then, run it by hand when touching release config.
#
# Run: bash scripts/release/release-please-config.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${REPO_ROOT}/release-please-config.json"
MANIFEST_FILE="${REPO_ROOT}/.release-please-manifest.json"
WORKFLOW_FILE="${REPO_ROOT}/.github/workflows/release-please.yml"

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

#-------------------------------------------------------------------------------
# Behavior 1: the manifest bootstraps the single repo-wide version at the
# version the repo is actually on (root package.json / tag v1.7.0). A manifest
# that disagreed with the last tag would make release-please propose a version
# that has already shipped.
#-------------------------------------------------------------------------------
test_manifest_bootstraps_root_at_current_version() {
    echo "TEST: manifest pins the root component at the current repo version"

    if [ ! -f "${MANIFEST_FILE}" ]; then
        fail "manifest pins root at current version" "missing ${MANIFEST_FILE}"
        return
    fi

    if ! jq -e . "${MANIFEST_FILE}" >/dev/null 2>&1; then
        fail "manifest pins root at current version" "${MANIFEST_FILE} is not valid JSON"
        return
    fi

    local root_version repo_version
    root_version="$(jq -r '.["."] // empty' "${MANIFEST_FILE}")"
    repo_version="$(jq -r '.version' "${REPO_ROOT}/package.json")"

    if [ -z "${root_version}" ]; then
        fail "manifest pins root at current version" "manifest has no \".\" entry"
        return
    fi

    if [ "${root_version}" != "${repo_version}" ]; then
        fail "manifest pins root at current version" \
             "manifest \".\" is ${root_version}, root package.json is ${repo_version}"
        return
    fi

    # Single repo-wide version: no other components in the manifest.
    local entries
    entries="$(jq -r 'keys | length' "${MANIFEST_FILE}")"
    if [ "${entries}" != "1" ]; then
        fail "manifest pins root at current version" \
             "expected exactly 1 manifest entry (single repo-wide version), found ${entries}"
        return
    fi

    pass "manifest pins the root component at ${repo_version}"
}

#-------------------------------------------------------------------------------
# Behavior 1 (cont.): the config declares a single root package using the node
# release-type with the root CHANGELOG, and tags as `vX.Y.Z` — release.yml's
# set-version job strips a leading `v` and checks out that tag, so a
# component-prefixed tag would break every downstream release job.
#-------------------------------------------------------------------------------
test_config_declares_single_node_root_package() {
    echo "TEST: config declares one root package, node release-type, v-prefixed tag"

    if [ ! -f "${CONFIG_FILE}" ]; then
        fail "config declares single node root package" "missing ${CONFIG_FILE}"
        return
    fi

    if ! jq -e . "${CONFIG_FILE}" >/dev/null 2>&1; then
        fail "config declares single node root package" "${CONFIG_FILE} is not valid JSON"
        return
    fi

    local packages
    packages="$(jq -r '.packages | keys | join(",")' "${CONFIG_FILE}")"
    if [ "${packages}" != "." ]; then
        fail "config declares single node root package" \
             "expected exactly one package \".\", found [${packages}]"
        return
    fi

    local release_type
    release_type="$(jq -r '.packages["."]["release-type"] // .["release-type"] // empty' "${CONFIG_FILE}")"
    if [ "${release_type}" != "node" ]; then
        fail "config declares single node root package" \
             "expected release-type node, found '${release_type}'"
        return
    fi

    local changelog_path
    changelog_path="$(jq -r '.packages["."]["changelog-path"] // "CHANGELOG.md"' "${CONFIG_FILE}")"
    if [ "${changelog_path}" != "CHANGELOG.md" ]; then
        fail "config declares single node root package" \
             "expected root CHANGELOG.md, found '${changelog_path}'"
        return
    fi

    # include-component-in-tag must be explicitly false so tags are `v1.8.0`,
    # not `smart-smoker-v2-v1.8.0`.
    local include_component
    # NB: `// "unset"` would misfire here — jq's alternative operator treats
    # `false` as empty, so the key must be probed with has().
    include_component="$(jq -r '
        if (.packages["."] | has("include-component-in-tag")) then (.packages["."]["include-component-in-tag"] | tostring)
        elif has("include-component-in-tag") then (.["include-component-in-tag"] | tostring)
        else "unset" end' "${CONFIG_FILE}")"
    if [ "${include_component}" != "false" ]; then
        fail "config declares single node root package" \
             "include-component-in-tag must be false (tags must be vX.Y.Z), found '${include_component}'"
        return
    fi

    pass "config declares one root package, node release-type, v-prefixed tag"
}

#-------------------------------------------------------------------------------
# Behavior 2 (critical): every app/package package.json is bumped in lockstep
# with the repo version. The root package.json is bumped by the node
# release-type itself; the other five are only bumped if they are listed as
# json extra-files with a $.version jsonpath. A missing entry means that app
# ships a stale version forever, and nothing else would catch it.
#
# Scoped to the $.version entries: the same files also carry dependency-range
# entries (see the dependent-range test below), which are checked separately.
#
# packages/theme, packages/api-transport, packages/smoke-session and e2e are
# deliberately NOT bumped — they are internal, never published, and pinning them
# to the repo version buys nothing while adding churn to every release PR.
#-------------------------------------------------------------------------------
test_extra_files_cover_every_app_package_json() {
    echo "TEST: extra-files bump exactly the five app/package package.jsons"

    if [ ! -f "${CONFIG_FILE}" ]; then
        fail "extra-files cover every app package.json" "missing ${CONFIG_FILE}"
        return
    fi

    local expected actual
    expected="$(printf '%s\n' \
        "apps/backend/package.json" \
        "apps/device-service/package.json" \
        "apps/frontend/package.json" \
        "apps/smoker/package.json" \
        "packages/TemperatureChart/package.json" | sort)"

    actual="$(jq -r '.packages["."]["extra-files"] // [] | .[] | select(.jsonpath == "$.version") | .path' "${CONFIG_FILE}" | sort)"

    if [ "${actual}" != "${expected}" ]; then
        fail "extra-files cover every app package.json" \
             "extra-files \$.version paths were [$(echo "${actual}" | tr '\n' ' ')], expected [$(echo "${expected}" | tr '\n' ' ')]"
        return
    fi

    # Every entry must be a json rewrite (the generic-json updater is what
    # preserves semver range operators).
    local bad
    bad="$(jq -r '.packages["."]["extra-files"][] | select(.type != "json") | .path' "${CONFIG_FILE}")"
    if [ -n "${bad}" ]; then
        fail "extra-files cover every app package.json" \
             "these entries are not type json: $(echo "${bad}" | tr '\n' ' ')"
        return
    fi

    # Every listed file must exist, and the root package.json must NOT be an
    # extra-file (the node release-type already owns it — listing it too would
    # double-write).
    local path
    while IFS= read -r path; do
        if [ ! -f "${REPO_ROOT}/${path}" ]; then
            fail "extra-files cover every app package.json" "extra-file ${path} does not exist"
            return
        fi
    done <<< "${actual}"

    pass "extra-files bump exactly the five app/package package.jsons"
}

#-------------------------------------------------------------------------------
# Behavior 2b (critical): a bumped workspace package that is depended on by
# another workspace must have that dependent RANGE bumped too. temperaturechart
# sits at ^1.0.0 in apps/frontend and apps/smoker; the first major release moves
# packages/TemperatureChart to 2.0.0, ^1.0.0 stops matching, npm refuses to
# link the workspace and instead resolves the generic public name
# `temperaturechart` from registry.npmjs.org — `npm ci` then fails (or worse,
# silently installs a stranger's package). release-please's generic-json updater
# preserves the range operator, so a `$.dependencies.<name>` extra-file rewrites
# ^1.0.0 -> ^2.0.0 and keeps the link. Multiple extra-files on one path are
# chained (CompositeUpdater), so this coexists with the file's $.version entry.
#
# This test derives the requirement instead of hardcoding temperaturechart:
# any future package added to extra-files gets the same protection for free.
#-------------------------------------------------------------------------------
workspace_manifests() {
    # Every package.json release-please could have to keep consistent.
    local f
    for f in "${REPO_ROOT}/package.json" "${REPO_ROOT}"/apps/*/package.json \
        "${REPO_ROOT}"/packages/*/package.json "${REPO_ROOT}/e2e/package.json"; do
        [ -f "${f}" ] && echo "${f#"${REPO_ROOT}"/}"
    done
}

test_dependent_ranges_bumped_with_their_package() {
    echo "TEST: dependents of every bumped workspace package have their range bumped too"

    if [ ! -f "${CONFIG_FILE}" ]; then
        fail "dependent ranges bumped with their package" "missing ${CONFIG_FILE}"
        return
    fi

    # Packages whose version this release rewrites: the root (owned by the node
    # release-type) plus every extra-file that targets $.version.
    local bumped_paths bumped_names=() path name
    bumped_paths="$(jq -r '.packages["."]["extra-files"] // [] | .[] | select(.jsonpath == "$.version") | .path' "${CONFIG_FILE}")"
    bumped_paths="$(printf 'package.json\n%s\n' "${bumped_paths}")"

    while IFS= read -r path; do
        [ -z "${path}" ] && continue
        [ -f "${REPO_ROOT}/${path}" ] || continue
        name="$(jq -r '.name // empty' "${REPO_ROOT}/${path}")"
        [ -n "${name}" ] && bumped_names+=("${name}")
    done <<< "${bumped_paths}"

    if [ "${#bumped_names[@]}" -eq 0 ]; then
        fail "dependent ranges bumped with their package" "no bumped packages resolved from config"
        return
    fi

    local missing=() manifest section dep required covered
    while IFS= read -r manifest; do
        for section in dependencies devDependencies peerDependencies optionalDependencies; do
            for name in "${bumped_names[@]}"; do
                dep="$(jq -r --arg s "${section}" --arg n "${name}" '.[$s][$n] // empty' "${REPO_ROOT}/${manifest}")"
                [ -z "${dep}" ] && continue

                # A path/protocol range (workspace:*, file:.., link:..) already
                # pins the local copy and survives any version bump.
                case "${dep}" in
                    workspace:* | file:* | link:* | portal:* | '*') continue ;;
                esac

                required="\$.${section}.${name}"
                covered="$(jq -r --arg p "${manifest}" --arg j "${required}" \
                    '.packages["."]["extra-files"] // [] | map(select(.path == $p and .jsonpath == $j)) | length' \
                    "${CONFIG_FILE}")"
                if [ "${covered}" = "0" ]; then
                    missing+=("${manifest} ${section}.${name} (${dep})")
                fi
            done
        done
    done <<< "$(workspace_manifests)"

    if [ "${#missing[@]}" -gt 0 ]; then
        fail "dependent ranges bumped with their package" \
             "these dependents would break on a major bump — add extra-files entries: ${missing[*]}"
        return
    fi

    pass "dependents of every bumped workspace package have their range bumped too"
}

#-------------------------------------------------------------------------------
# Behavior 3 (critical): the workflow runs on push to master and authenticates
# the release-please action with the runner PAT. Releases created with the
# default GITHUB_TOKEN do not emit `release: published` events, so release.yml
# (and every job it fans out to) would never fire.
#-------------------------------------------------------------------------------
test_workflow_uses_pat_on_push_to_master() {
    echo "TEST: workflow runs on push to master and uses RUNNER_PAT, not GITHUB_TOKEN"

    if [ ! -f "${WORKFLOW_FILE}" ]; then
        fail "workflow uses RUNNER_PAT on push to master" "missing ${WORKFLOW_FILE}"
        return
    fi

    if ! grep -qE '^\s+push:' "${WORKFLOW_FILE}" || ! grep -qE '^\s+branches:\s*\[?\s*master' "${WORKFLOW_FILE}"; then
        fail "workflow uses RUNNER_PAT on push to master" \
             "workflow does not trigger on push to master"
        return
    fi

    if ! grep -qE 'uses:\s*googleapis/release-please-action@v4' "${WORKFLOW_FILE}"; then
        fail "workflow uses RUNNER_PAT on push to master" \
             "workflow does not use googleapis/release-please-action@v4"
        return
    fi

    if ! grep -qE 'token:\s*\$\{\{\s*secrets\.RUNNER_PAT\s*\}\}' "${WORKFLOW_FILE}"; then
        fail "workflow uses RUNNER_PAT on push to master" \
             "release-please step must pass token: \${{ secrets.RUNNER_PAT }}"
        return
    fi

    # GITHUB_TOKEN must not be wired into the action at all (a leftover
    # `token: ${{ secrets.GITHUB_TOKEN }}` would silently win).
    if grep -vE '^\s*#' "${WORKFLOW_FILE}" | grep -q 'secrets.GITHUB_TOKEN'; then
        fail "workflow uses RUNNER_PAT on push to master" \
             "workflow references secrets.GITHUB_TOKEN — GITHUB_TOKEN Releases do not trigger release: published workflows"
        return
    fi

    # The action must be pointed at the manifest-mode files this slice adds.
    if ! grep -qE 'config-file:\s*release-please-config\.json' "${WORKFLOW_FILE}" ||
        ! grep -qE 'manifest-file:\s*\.release-please-manifest\.json' "${WORKFLOW_FILE}"; then
        fail "workflow uses RUNNER_PAT on push to master" \
             "release-please step must set config-file + manifest-file (manifest mode)"
        return
    fi

    pass "workflow runs on push to master and uses RUNNER_PAT, not GITHUB_TOKEN"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "release-please config tests"
echo "=========================================="

test_manifest_bootstraps_root_at_current_version
test_config_declares_single_node_root_package
test_extra_files_cover_every_app_package_json
test_dependent_ranges_bumped_with_their_package
test_workflow_uses_pat_on_push_to_master

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
