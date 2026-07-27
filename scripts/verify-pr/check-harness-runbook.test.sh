#!/usr/bin/env bash
# Tests for scripts/verify-pr/check-harness-runbook.sh
#
# Run: bash scripts/verify-pr/check-harness-runbook.test.sh
#
# Strategy: the checker's public interface is (a) its exit code + report over a
# pair of definition files and (b) `--list`, the machine-readable table of the
# load-bearing runbook rules it enforces. Tests drive it against the REAL
# definitions (the shipped skill + agent text must satisfy every rule) and
# against mutated temp copies produced by deleting one rule phrase at a time —
# proving a future edit cannot silently drop a rule. No filesystem writes
# outside mktemp, no network, no docker.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CHECKER="${SCRIPT_DIR}/check-harness-runbook.sh"
SKILL_FILE="${REPO_ROOT}/.claude/skills/verify-pr/SKILL.md"
AGENT_FILE="${REPO_ROOT}/.claude/agents/manual-verifier.md"

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

if [ ! -f "${CHECKER}" ]; then
    echo "FATAL: ${CHECKER} not found"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test 1: the shipped skill + agent definitions carry every load-bearing rule.
#         (AC 1, AC 2 — the runbook actually lives in the harness brain.)
#-------------------------------------------------------------------------------
test_real_definitions_pass() {
    echo "TEST: shipped SKILL.md + manual-verifier.md satisfy every runbook rule"

    local out rc
    out="$(bash "${CHECKER}" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        pass "checker exits 0 on the shipped definitions"
    else
        fail "checker exits 0 on the shipped definitions" "exit ${rc}; output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Test 2: `--list` publishes the enforced rule table as `rule-id<TAB>pattern`
#         lines, covering every load-bearing runbook rule of PRD #387 item 4.
#-------------------------------------------------------------------------------
test_list_publishes_rule_table() {
    echo "TEST: --list publishes the rule table (rule-id<TAB>pattern)"

    local listing rc
    listing="$(bash "${CHECKER}" --list)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "--list exits 0" "exit ${rc}"
        return
    fi
    pass "--list exits 0"

    local malformed
    malformed="$(printf '%s\n' "${listing}" | grep -cv $'^[a-z-]\+\t.\+$')"
    if [ "${malformed}" -eq 0 ]; then
        pass "every --list line is rule-id<TAB>pattern"
    else
        fail "every --list line is rule-id<TAB>pattern" "${malformed} malformed line(s)"
    fi

    local expected id
    expected=(display-truth electron-path shell-drift stack-mutation emulator-feed dual-driver wifi-bound)
    local missing_ids=()
    for id in "${expected[@]}"; do
        if ! printf '%s\n' "${listing}" | cut -f1 | grep -qx "${id}"; then
            missing_ids+=("${id}")
        fi
    done
    if [ "${#missing_ids[@]}" -eq 0 ]; then
        pass "rule table covers every PRD #387 runbook rule"
    else
        fail "rule table covers every PRD #387 runbook rule" "missing: ${missing_ids[*]}"
    fi
}

# Write a copy of ${1} with every occurrence of the regex ${2} deleted. The copy
# is whitespace-normalized first so a phrase wrapped across markdown lines is
# still removed (the checker normalizes the same way).
mutate_without() {
    local src="$1" pattern="$2" out d
    out="$(mktemp)"
    d=$'\001'
    tr '\n' ' ' < "${src}" | tr -s '[:space:]' ' ' \
        | sed -E "s${d}${pattern}${d}${d}gI" > "${out}"
    echo "${out}"
}

# Shared body of tests 3 and 4: drop one rule phrase at a time from ${1}
# (`skill` or `agent`) and require the checker to fail, naming that rule.
assert_deletion_detected_in() {
    local which_file="$1"
    local rule pattern mutated skill_arg agent_arg out rc
    local undetected=()

    while IFS=$'\t' read -r rule pattern; do
        [ -n "${rule}" ] || continue
        if [ "${which_file}" = "skill" ]; then
            mutated="$(mutate_without "${SKILL_FILE}" "${pattern}")"
            skill_arg="${mutated}"
            agent_arg="${AGENT_FILE}"
        else
            mutated="$(mutate_without "${AGENT_FILE}" "${pattern}")"
            skill_arg="${SKILL_FILE}"
            agent_arg="${mutated}"
        fi

        out="$(bash "${CHECKER}" "${skill_arg}" "${agent_arg}" 2>&1)"
        rc=$?
        rm -f "${mutated}"

        if [ "${rc}" -ne 1 ] || ! printf '%s' "${out}" | grep -q "rule=${rule}"; then
            undetected+=("${rule}: ${pattern} (exit ${rc})")
        fi
    done < <(bash "${CHECKER}" --list)

    if [ "${#undetected[@]}" -eq 0 ]; then
        pass "deleting any single rule phrase from the ${which_file} definition fails the check"
    else
        fail "deleting any single rule phrase from the ${which_file} definition fails the check" \
            "undetected: ${undetected[*]}"
    fi
}

#-------------------------------------------------------------------------------
# Test 3: a rule silently dropped from the SKILL definition is caught (AC 3).
#-------------------------------------------------------------------------------
test_deletion_detected_in_skill() {
    echo "TEST: dropping a runbook rule from SKILL.md fails the check"
    assert_deletion_detected_in "skill"
}

#-------------------------------------------------------------------------------
# Test 4: a rule silently dropped from the AGENT definition is caught (AC 3) —
#         a rule surviving in only one of the two documents is still a failure.
#-------------------------------------------------------------------------------
test_deletion_detected_in_agent() {
    echo "TEST: dropping a runbook rule from manual-verifier.md fails the check"
    assert_deletion_detected_in "agent"
}

#-------------------------------------------------------------------------------
# Test 5: a missing definition file is an operator error (exit 2), clearly
#         distinguished from a missing rule (exit 1).
#-------------------------------------------------------------------------------
test_missing_file_is_usage_error() {
    echo "TEST: missing definition file exits 2 with the offending path"

    local out rc
    out="$(bash "${CHECKER}" "/nonexistent/SKILL.md" "${AGENT_FILE}" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 2 ]; then
        pass "missing definition file exits 2"
    else
        fail "missing definition file exits 2" "exit ${rc}; output: ${out}"
    fi

    if printf '%s' "${out}" | grep -q "/nonexistent/SKILL.md"; then
        pass "error names the missing path"
    else
        fail "error names the missing path" "output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Test 6: every smoker path the runbook names (the shell-drift detection paths)
#         is a real tracked path. A drift check pointing at files that do not
#         exist matches nothing, so a PR rewriting the Electron main process
#         would emit no drift note and its shell behavior would be silently
#         verified against the stale daemon-checkout build (AC 1).
#-------------------------------------------------------------------------------
test_named_smoker_paths_exist() {
    echo "TEST: every apps/smoker path named in the runbook is tracked in git"

    local doc path stale=()
    for doc in "${SKILL_FILE}" "${AGENT_FILE}"; do
        local found=0
        while IFS= read -r path; do
            # Only a path with something after the app dir names a real file or
            # directory; a bare `apps/smoker/` (all that survives a regex
            # alternation like `apps/smoker/(src/main|...)`) is unverifiable and
            # does not count as naming the shell.
            [ -n "${path#apps/smoker/}" ] || continue
            found=1
            # A trailing slash means "anything under this directory".
            if [ -z "$(git -C "${REPO_ROOT}" ls-files -- "${path%/}" "${path%/}/*" 2>/dev/null)" ]; then
                stale+=("${path} (named in $(basename "${doc}"))")
            fi
        done < <(grep -oE "apps/smoker/[A-Za-z0-9._/-]*" "${doc}" | sort -u)

        if [ "${found}" -eq 0 ]; then
            fail "runbook names the shell's paths in $(basename "${doc}")" \
                "no apps/smoker/... path found — the drift check cannot be pinned to real files"
        fi
    done

    if [ "${#stale[@]}" -eq 0 ]; then
        pass "every named apps/smoker path is tracked"
    else
        fail "every named apps/smoker path is tracked" "untracked: ${stale[*]}"
    fi
}

#-------------------------------------------------------------------------------
# Test 7: the shell-drift list covers every input the provisioner itself rebuilds
#         the shell from (`SMOKER_SHELL_SOURCES` in provision-box.sh) plus the
#         thin-mode entry document `config.forge.js` loads. Those are exactly the
#         files whose change makes the daemon-checkout shell stale, so a PR
#         touching one (e.g. webpack.renderer.config.js, which compiles the
#         preload) must produce a drift note instead of a silent PASS against the
#         old build (AC 1).
#-------------------------------------------------------------------------------
test_drift_list_covers_shell_build_inputs() {
    echo "TEST: shell-drift list covers every provisioner shell source"

    local provisioner="${SCRIPT_DIR}/provision-box.sh"
    local forge="${REPO_ROOT}/apps/smoker/config.forge.js"

    if [ ! -f "${provisioner}" ] || [ ! -f "${forge}" ]; then
        fail "shell build inputs are discoverable" \
            "missing ${provisioner} or ${forge}"
        return
    fi

    # The provisioner's default source list, with ${SMOKER_APP_DIR} resolved to
    # the repo-relative app dir the runbook names.
    local sources
    sources="$(grep '^SMOKER_SHELL_SOURCES=' "${provisioner}" \
        | sed -E -e 's/^SMOKER_SHELL_SOURCES="\$\{SMOKER_SHELL_SOURCES:-//' \
        -e 's/\}"$//' \
        -e 's|\$\{SMOKER_APP_DIR\}|apps/smoker|g')"

    # The html entry config.forge.js loads in thin mode — the first quoted path
    # in the entryPoints `html:` ternary, whose thin branch comes first.
    local thin_entry
    thin_entry="$(sed -n '/html:/,/js:/p' "${forge}" \
        | grep -oE "'\./[A-Za-z0-9._/-]+'" | head -1 | tr -d "'")"
    thin_entry="apps/smoker/${thin_entry#./}"

    if [ -z "${sources}" ] || [ "${thin_entry}" = "apps/smoker/" ]; then
        fail "shell build inputs are discoverable" \
            "sources='${sources}' thin_entry='${thin_entry}'"
        return
    fi

    local doc path uncovered=()
    for doc in "${SKILL_FILE}" "${AGENT_FILE}"; do
        for path in ${sources} "${thin_entry}"; do
            # A directory source counts as covered when the runbook names it or
            # a path beneath it (e.g. `apps/smoker/src` → `src/electron/`), so a
            # literal prefix match is the right test for both kinds.
            if ! grep -qF -- "${path}" "${doc}"; then
                uncovered+=("${path} (absent from $(basename "${doc}"))")
            fi
        done
    done

    if [ "${#uncovered[@]}" -eq 0 ]; then
        pass "every provisioner shell source and the thin entry are in both drift lists"
    else
        fail "every provisioner shell source and the thin entry are in both drift lists" \
            "uncovered: ${uncovered[*]}"
    fi
}

main() {
    echo "=========================================="
    echo "check-harness-runbook.sh tests"
    echo "=========================================="

    test_real_definitions_pass
    test_list_publishes_rule_table
    test_deletion_detected_in_skill
    test_deletion_detected_in_agent
    test_missing_file_is_usage_error
    test_named_smoker_paths_exist
    test_drift_list_covers_shell_build_inputs

    echo ""
    echo "=========================================="
    echo "Tests run: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
    echo "=========================================="

    if [ "${TESTS_FAILED}" -gt 0 ]; then
        echo "Failed tests:"
        for name in "${FAILED_NAMES[@]}"; do
            echo "  - ${name}"
        done
        exit 1
    fi
    exit 0
}

main "$@"
