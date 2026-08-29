#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/pr-triage.sh
#
# Run: bash scripts/claude-agent/lib/pr-triage.test.sh
#
# Strategy: pr_triage_pick is a pure function of the `gh pr list --json` payload
# supplied on stdin plus PR_TRIAGE_AUTHOR. Each test builds a PR-list fixture
# and asserts the pick verdict (which PR, extracted issue number, reason) — the
# external behavior the reconcile phase acts on, never the jq internals.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/pr-triage.sh"

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

if [ ! -f "${LIB}" ]; then
    echo "FATAL: ${LIB} not found"
    exit 2
fi

# shellcheck source=/dev/null
. "${LIB}"

# pr_json <number> <branch> <mergeable> <createdAt> <labels-csv> [author] [isDraft] [state]
pr_json() {
    local number="$1" branch="$2" mergeable="$3" created="$4" labels_csv="${5:-}"
    local author="${6:-agent-bot}" is_draft="${7:-false}" state="${8:-OPEN}"
    local labels="[]"
    if [ -n "${labels_csv}" ]; then
        labels="$(printf '%s' "${labels_csv}" | jq -R 'split(",") | map({name: .})')"
    fi
    jq -n \
        --argjson number "${number}" \
        --arg branch "${branch}" \
        --arg mergeable "${mergeable}" \
        --arg created "${created}" \
        --argjson labels "${labels}" \
        --arg author "${author}" \
        --argjson isDraft "${is_draft}" \
        --arg state "${state}" \
        '{number: $number, headRefName: $branch, mergeable: $mergeable,
          createdAt: $created, labels: $labels, author: {login: $author},
          isDraft: $isDraft, state: $state}'
}

#-------------------------------------------------------------------------------
# Test 1: a conflicting team PR is picked with reason "conflict" and the issue
# number extracted from the branch name.
#-------------------------------------------------------------------------------
test_conflicting_pr_picked() {
    echo "TEST: conflicting team PR is picked"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 310 "feat/issue-281" "CONFLICTING" "2026-07-09T10:00:00Z" "") \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "conflicting PR must be picked (exit 0)" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "310" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.issue')" != "281" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "conflict" ]; then
        fail "verdict must carry pr=310 issue=281 reason=conflict" "out=${out}"
        return
    fi

    pass "conflicting team PR is picked"
}

#-------------------------------------------------------------------------------
# Test 2: AFK:revise beats a plain conflict, even when the conflicting PR is
# older — a human explicitly waiting on their review outranks mechanical drift.
#-------------------------------------------------------------------------------
test_revise_beats_conflict() {
    echo "TEST: AFK:revise outranks CONFLICTING"

    local out
    out="$(jq -s '.' \
        <(pr_json 310 "feat/issue-281" "CONFLICTING" "2026-07-01T10:00:00Z" "") \
        <(pr_json 311 "feat/issue-282" "MERGEABLE"   "2026-07-09T10:00:00Z" "AFK:revise") \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "311" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "revise" ]; then
        fail "revise-labeled PR must win over an older conflict" "out=${out}"
        return
    fi

    pass "AFK:revise outranks CONFLICTING"
}

#-------------------------------------------------------------------------------
# Test 3: within the same reason rank, the oldest PR wins.
#-------------------------------------------------------------------------------
test_oldest_wins_within_rank() {
    echo "TEST: oldest PR wins within the same reason"

    local out
    out="$(jq -s '.' \
        <(pr_json 312 "feat/issue-283" "MERGEABLE" "2026-07-09T10:00:00Z" "AFK:revise") \
        <(pr_json 311 "feat/issue-282" "MERGEABLE" "2026-07-05T10:00:00Z" "AFK:revise") \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "311" ]; then
        fail "older revise PR must be picked first" "out=${out}"
        return
    fi

    pass "oldest PR wins within the same reason"
}

#-------------------------------------------------------------------------------
# Test 4: ours-filter — drafts, foreign branch names, foreign authors, and
# non-open PRs are never picked even when conflicting or revise-labeled.
#-------------------------------------------------------------------------------
test_ours_filter_excludes() {
    echo "TEST: ours-filter excludes drafts / foreign branches / foreign authors"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 320 "feat/issue-290" "CONFLICTING" "2026-07-01T10:00:00Z" "" "agent-bot" "true") \
        <(pr_json 321 "hotfix/human-branch" "CONFLICTING" "2026-07-01T10:00:00Z" "AFK:revise") \
        <(pr_json 322 "feat/issue-291" "CONFLICTING" "2026-07-01T10:00:00Z" "" "some-human") \
        <(pr_json 323 "feat/issue-292" "CONFLICTING" "2026-07-01T10:00:00Z" "" "agent-bot" "false" "MERGED") \
        | PR_TRIAGE_AUTHOR="agent-bot" pr_triage_pick)"
    rc=$?

    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "no draft/foreign/closed PR may be picked" "rc=${rc} out=${out}"
        return
    fi

    pass "ours-filter excludes drafts / foreign branches / foreign authors"
}

#-------------------------------------------------------------------------------
# Test 5: an empty author env disables the author check (any login accepted).
#-------------------------------------------------------------------------------
test_empty_author_env_accepts_any() {
    echo "TEST: empty PR_TRIAGE_AUTHOR disables the author filter"

    local out
    out="$(jq -s '.' \
        <(pr_json 324 "feat/issue-293" "CONFLICTING" "2026-07-01T10:00:00Z" "" "whoever") \
        | PR_TRIAGE_AUTHOR="" pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "324" ]; then
        fail "empty author env must accept any login" "out=${out}"
        return
    fi

    pass "empty PR_TRIAGE_AUTHOR disables the author filter"
}

#-------------------------------------------------------------------------------
# Test 6: MERGEABLE and UNKNOWN without AFK:revise are not attention-worthy;
# already-escalated PRs (revise-failed / rebase-failed) are parked for a human.
#-------------------------------------------------------------------------------
test_no_attention_no_pick() {
    echo "TEST: mergeable/unknown/escalated PRs are not picked"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 330 "feat/issue-294" "MERGEABLE" "2026-07-01T10:00:00Z" "") \
        <(pr_json 331 "feat/issue-295" "UNKNOWN"   "2026-07-01T10:00:00Z" "") \
        <(pr_json 332 "feat/issue-296" "CONFLICTING" "2026-07-01T10:00:00Z" "AFK:rebase-failed") \
        <(pr_json 333 "feat/issue-297" "MERGEABLE" "2026-07-01T10:00:00Z" "AFK:revise,AFK:revise-failed") \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "nothing here needs (auto-)attention" "rc=${rc} out=${out}"
        return
    fi

    pass "mergeable/unknown/escalated PRs are not picked"
}

#-------------------------------------------------------------------------------
# Test 7: empty list and malformed input both no-pick (exit 1) without crashing —
# the reconcile phase falls through to resume/pick.
#-------------------------------------------------------------------------------
test_empty_and_malformed_no_pick() {
    echo "TEST: empty list and malformed input degrade to no-pick"

    local out rc
    out="$(printf '[]' | pr_triage_pick)"
    rc=$?
    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "empty list must no-pick" "rc=${rc} out=${out}"
        return
    fi

    out="$(printf 'not json' | pr_triage_pick)"
    rc=$?
    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr' 2>/dev/null)" != "null" ]; then
        fail "malformed input must no-pick, not crash" "rc=${rc} out=${out}"
        return
    fi

    pass "empty list and malformed input degrade to no-pick"
}

#-------------------------------------------------------------------------------
# Test 8: pr_triage_scan rides out async mergeability — first listing says
# UNKNOWN (GitHub still computing after a master push), the re-list says
# CONFLICTING → the pick lands on the SAME fire instead of stranding the PR
# for a whole no-work sleep (live 2026-07-10: #305 missed at 18:45).
#-------------------------------------------------------------------------------
test_scan_polls_unknown_to_resolution() {
    echo "TEST: scan polls UNKNOWN until resolved"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    jq -s '.' <(pr_json 305 "feat/issue-281" "UNKNOWN" "2026-07-09T10:00:00Z" "") \
        > "${dir}/list-1.json"
    jq -s '.' <(pr_json 305 "feat/issue-281" "CONFLICTING" "2026-07-09T10:00:00Z" "") \
        > "${dir}/list-2.json"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
n=\$(cat "${dir}/count" 2>/dev/null || echo 0)
n=\$((n + 1)); echo "\$n" > "${dir}/count"
if [ "\$n" -ge 2 ]; then cat "${dir}/list-2.json"; else cat "${dir}/list-1.json"; fi
EOF
    cat > "${dir}/sleep-stub" <<EOF
#!/usr/bin/env bash
echo "slept \$*" >> "${dir}/sleeps"
EOF
    chmod +x "${dir}/gh-stub" "${dir}/sleep-stub"

    local out rc
    out="$(GH_BIN="${dir}/gh-stub" PR_TRIAGE_SLEEP="${dir}/sleep-stub" pr_triage_scan)"
    rc=$?

    if [ "${rc}" -ne 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "305" ]; then
        fail "scan must pick once UNKNOWN resolves" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(wc -l < "${dir}/sleeps")" != "1" ]; then
        fail "scan must have slept exactly once" "sleeps: $(cat "${dir}/sleeps")"
        return
    fi

    pass "scan polls UNKNOWN until resolved"
}

#-------------------------------------------------------------------------------
# Test 9: pr_triage_scan retry cap — mergeability never resolves → after the
# cap it triages the last listing (UNKNOWN skips → no-pick exit 1) instead of
# hanging the fire.
#-------------------------------------------------------------------------------
test_scan_retry_cap_no_pick() {
    echo "TEST: scan retry cap yields no-pick"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    jq -s '.' <(pr_json 305 "feat/issue-281" "UNKNOWN" "2026-07-09T10:00:00Z" "") \
        > "${dir}/list.json"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
cat "${dir}/list.json"
EOF
    cat > "${dir}/sleep-stub" <<EOF
#!/usr/bin/env bash
echo "slept" >> "${dir}/sleeps"
EOF
    chmod +x "${dir}/gh-stub" "${dir}/sleep-stub"

    local out rc
    out="$(GH_BIN="${dir}/gh-stub" PR_TRIAGE_SLEEP="${dir}/sleep-stub" \
        PR_TRIAGE_UNKNOWN_RETRIES=3 pr_triage_scan)"
    rc=$?

    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "unresolved UNKNOWN must end in no-pick exit 1" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(wc -l < "${dir}/sleeps")" != "3" ]; then
        fail "scan must sleep once per retry (3)" "sleeps: $(wc -l < "${dir}/sleeps")"
        return
    fi

    pass "scan retry cap yields no-pick"
}


#-------------------------------------------------------------------------------
# Test 10: an enriched-clean PR whose bot tail never finished (missing review
# marker and/or verification round) is picked with reason "incomplete".
#-------------------------------------------------------------------------------
test_incomplete_pr_picked() {
    echo "TEST: bot-incomplete PR is picked"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-08-01T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: true}') \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -ne 0 ] \
        || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "400" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.issue')" != "350" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "incomplete" ]; then
        fail "missing review marker must pick reason=incomplete" "rc=${rc} out=${out}"
        return
    fi

    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-08-01T10:00:00Z" "" \
            | jq '. + {reviewDone: true, verifyDone: false}') \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.reason')" != "incomplete" ]; then
        fail "missing verification round must pick reason=incomplete" "out=${out}"
        return
    fi

    pass "bot-incomplete PR is picked"
}

#-------------------------------------------------------------------------------
# Test 11: a bot-complete PR (review marker + verification round both present)
# awaiting only a human merge is NOT picked — work-ahead stays.
#-------------------------------------------------------------------------------
test_bot_complete_pr_no_pick() {
    echo "TEST: bot-complete PR is not picked"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-08-01T10:00:00Z" "" \
            | jq '. + {reviewDone: true, verifyDone: true}') \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "bot-complete PR must no-pick" "rc=${rc} out=${out}"
        return
    fi

    pass "bot-complete PR is not picked"
}

#-------------------------------------------------------------------------------
# Test 12: rank order — revise beats conflict beats incomplete even when the
# incomplete PR is oldest; two incompletes resolve oldest-first.
#-------------------------------------------------------------------------------
test_revise_and_conflict_beat_incomplete() {
    echo "TEST: revise > conflict > incomplete rank order"

    local out
    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-07-01T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false}') \
        <(pr_json 401 "feat/issue-351" "CONFLICTING" "2026-07-05T10:00:00Z" "") \
        <(pr_json 402 "feat/issue-352" "MERGEABLE" "2026-07-09T10:00:00Z" "AFK:revise") \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "402" ]; then
        fail "revise must beat conflict and incomplete" "out=${out}"
        return
    fi

    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-07-01T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false}') \
        <(pr_json 401 "feat/issue-351" "CONFLICTING" "2026-07-05T10:00:00Z" "") \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "401" ]; then
        fail "conflict must beat an older incomplete" "out=${out}"
        return
    fi

    out="$(jq -s '.' \
        <(pr_json 405 "feat/issue-355" "MERGEABLE" "2026-07-08T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false}') \
        <(pr_json 404 "feat/issue-354" "MERGEABLE" "2026-07-02T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false}') \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "404" ]; then
        fail "oldest incomplete must win within rank" "out=${out}"
        return
    fi

    pass "revise > conflict > incomplete rank order"
}

#-------------------------------------------------------------------------------
# Test 13: pr_triage_enrich probes ONLY clean candidates (skips conflicting /
# revise-labeled / draft / foreign-author PRs) and merges both signals into the
# probed PR.
#-------------------------------------------------------------------------------
test_enrich_merges_signals_and_probes_only_clean_candidates() {
    echo "TEST: enrich probes only clean candidates"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${dir}/calls"
printf '%s\n' '{"comments":[{"body":"just chatter"}]}'
EOF
    chmod +x "${dir}/gh-stub"
    : > "${dir}/calls"

    local out
    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-07-01T10:00:00Z" "") \
        <(pr_json 401 "feat/issue-351" "CONFLICTING" "2026-07-01T10:00:00Z" "") \
        <(pr_json 402 "feat/issue-352" "MERGEABLE" "2026-07-01T10:00:00Z" "AFK:revise") \
        <(pr_json 403 "feat/issue-353" "MERGEABLE" "2026-07-01T10:00:00Z" "" "agent-bot" "true") \
        <(pr_json 404 "feat/issue-354" "MERGEABLE" "2026-07-01T10:00:00Z" "" "some-human") \
        | GH_BIN="${dir}/gh-stub" PR_TRIAGE_AUTHOR="agent-bot" pr_triage_enrich)"

    if grep -qv "^pr view 400 " "${dir}/calls" \
        || ! grep -q "^pr view 400 --json comments$" "${dir}/calls" \
        || ! grep -q "^pr view 400 --json files$" "${dir}/calls"; then
        fail "only the clean candidate may be probed, for comments and files" \
            "calls: $(cat "${dir}/calls")"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.[] | select(.number == 400) | .reviewDone')" != "false" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.[] | select(.number == 400) | .verifyDone')" != "false" ]; then
        fail "probed PR must carry both merged signals" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.[] | select(.number == 401) | has("reviewDone")')" != "false" ]; then
        fail "unprobed PRs must stay untouched" "out=${out}"
        return
    fi

    pass "enrich probes only clean candidates"
}

#-------------------------------------------------------------------------------
# Test 14: enrich fails SAFE — a gh error leaves the fields absent, so the pick
# reads the PR as complete and no-picks (a broken sensor must never pick-loop).
#-------------------------------------------------------------------------------
test_enrich_gh_error_fails_safe() {
    echo "TEST: enrich gh error fails safe as complete"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/gh-stub" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
    chmod +x "${dir}/gh-stub"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-07-01T10:00:00Z" "") \
        | GH_BIN="${dir}/gh-stub" pr_triage_enrich | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "gh error must degrade to no-pick" "rc=${rc} out=${out}"
        return
    fi

    pass "enrich gh error fails safe as complete"
}

#-------------------------------------------------------------------------------
# Test 15: enrich passes malformed (non-array) input through untouched, exit 0.
#-------------------------------------------------------------------------------
test_enrich_malformed_passthrough() {
    echo "TEST: enrich passes malformed input through"

    local out rc
    out="$(printf 'not json' | pr_triage_enrich)"
    rc=$?

    if [ "${rc}" -ne 0 ] || [ "${out}" != "not json" ]; then
        fail "malformed input must pass through with exit 0" "rc=${rc} out=${out}"
        return
    fi

    pass "enrich passes malformed input through"
}

#-------------------------------------------------------------------------------
# Test 16: pr_triage_scan end-to-end — the listing is clean but the PR's bot
# tail never finished → the scan verdict is reason "incomplete".
#-------------------------------------------------------------------------------
test_scan_picks_incomplete() {
    echo "TEST: scan picks a bot-incomplete PR"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    jq -s '.' <(pr_json 400 "feat/issue-350" "MERGEABLE" "2026-08-01T10:00:00Z" "") \
        > "${dir}/list.json"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
case "\$*" in
    *"pr list"*) cat "${dir}/list.json" ;;
    *"pr view"*) printf '%s\n' '{"comments":[]}' ;;
    *)           exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"

    local out rc
    out="$(GH_BIN="${dir}/gh-stub" pr_triage_scan)"
    rc=$?

    if [ "${rc}" -ne 0 ] \
        || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "400" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "incomplete" ]; then
        fail "scan must pick the incomplete PR" "rc=${rc} out=${out}"
        return
    fi

    pass "scan picks a bot-incomplete PR"
}

#-------------------------------------------------------------------------------
# Test 17: a docs-only PR (every changed file under docs/research/) with no
# finished bot tail is reason "docs-merge", not "incomplete" — a research PR
# never gets review/verify rounds, so the tail markers are the wrong signal.
#-------------------------------------------------------------------------------
test_docs_only_pr_picked_as_docs_merge() {
    echo "TEST: docs-only PR picks reason docs-merge"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 590 "feat/issue-577" "MERGEABLE" "2026-08-28T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false, docsOnly: true}') \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -ne 0 ] \
        || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "590" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.issue')" != "577" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "docs-merge" ]; then
        fail "docs-only PR must pick reason=docs-merge" "rc=${rc} out=${out}"
        return
    fi

    pass "docs-only PR picks reason docs-merge"
}

#-------------------------------------------------------------------------------
# Test 18: precedence — a docs-only PR that also CONFLICTS is "conflict" (the
# merge cannot happen until master is caught up), and one carrying AFK:revise
# is "revise" (a human is waiting on their own review); a non-docs PR with an
# unfinished tail is still "incomplete".
#-------------------------------------------------------------------------------
test_docs_merge_precedence() {
    echo "TEST: revise > conflict > docs-merge > incomplete"

    local out
    out="$(jq -s '.' \
        <(pr_json 590 "feat/issue-577" "CONFLICTING" "2026-08-28T10:00:00Z" "" \
            | jq '. + {docsOnly: true}') \
        | pr_triage_pick)"
    if [ "$(printf '%s' "${out}" | jq -r '.reason')" != "conflict" ]; then
        fail "a conflicting docs PR must triage as conflict" "out=${out}"
        return
    fi

    out="$(jq -s '.' \
        <(pr_json 590 "feat/issue-577" "MERGEABLE" "2026-08-28T10:00:00Z" "AFK:revise" \
            | jq '. + {docsOnly: true}') \
        | pr_triage_pick)"
    if [ "$(printf '%s' "${out}" | jq -r '.reason')" != "revise" ]; then
        fail "a revise-labeled docs PR must triage as revise" "out=${out}"
        return
    fi

    out="$(jq -s '.' \
        <(pr_json 591 "feat/issue-578" "MERGEABLE" "2026-08-28T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false, docsOnly: false}') \
        | pr_triage_pick)"
    if [ "$(printf '%s' "${out}" | jq -r '.reason')" != "incomplete" ]; then
        fail "a non-docs unfinished PR must stay incomplete" "out=${out}"
        return
    fi

    out="$(jq -s '.' \
        <(pr_json 591 "feat/issue-578" "MERGEABLE" "2026-08-20T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false, docsOnly: false}') \
        <(pr_json 590 "feat/issue-577" "MERGEABLE" "2026-08-28T10:00:00Z" "" \
            | jq '. + {reviewDone: false, verifyDone: false, docsOnly: true}') \
        | pr_triage_pick)"
    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "590" ]; then
        fail "docs-merge must beat an older incomplete" "out=${out}"
        return
    fi

    pass "revise > conflict > docs-merge > incomplete"
}

#-------------------------------------------------------------------------------
# Test 19: pr_triage_enrich reads the changed-file list and flags docsOnly —
# true only when every path is under docs/research/ and there is at least one.
#-------------------------------------------------------------------------------
test_enrich_flags_docs_only() {
    echo "TEST: enrich flags docsOnly from the file list"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
case "\$*" in
    *"--json files"*)
        case "\$*" in
            *" 590 "*) printf '%s\\n' '{"files":[{"path":"docs/research/577.md"}]}' ;;
            *)         printf '%s\\n' '{"files":[{"path":"docs/research/577.md"},{"path":"apps/backend/src/x.ts"}]}' ;;
        esac ;;
    *"--json comments"*) printf '%s\\n' '{"comments":[]}' ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"

    local out
    out="$(jq -s '.' \
        <(pr_json 590 "feat/issue-577" "MERGEABLE" "2026-08-28T10:00:00Z" "") \
        <(pr_json 591 "feat/issue-578" "MERGEABLE" "2026-08-28T10:00:00Z" "") \
        | GH_BIN="${dir}/gh-stub" pr_triage_enrich)"

    if [ "$(printf '%s' "${out}" | jq -r '.[] | select(.number == 590) | .docsOnly')" != "true" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.[] | select(.number == 591) | .docsOnly')" != "false" ]; then
        fail "enrich must flag docsOnly per PR" "out=${out}"
        return
    fi

    pass "enrich flags docsOnly from the file list"
}

#-------------------------------------------------------------------------------
# Test 20: enrich fails SAFE on the file probe — a gh error leaves docsOnly
# absent, which the pick reads as "not docs-only" (never auto-merge on a broken
# sensor); the comment signals still land.
#-------------------------------------------------------------------------------
test_enrich_docs_only_fails_safe() {
    echo "TEST: enrich docsOnly probe fails safe"

    local dir; dir="$(mktemp -d)"
    trap "rm -rf '${dir}'" RETURN

    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
case "\$*" in
    *"--json files"*)    exit 1 ;;
    *"--json comments"*) printf '%s\\n' '{"comments":[]}' ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 590 "feat/issue-577" "MERGEABLE" "2026-08-28T10:00:00Z" "") \
        | GH_BIN="${dir}/gh-stub" pr_triage_enrich)"

    if [ "$(printf '%s' "${out}" | jq -r '.[0] | has("docsOnly")')" != "false" ]; then
        fail "a failed file probe must leave docsOnly absent" "out=${out}"
        return
    fi

    out="$(printf '%s' "${out}" | pr_triage_pick)"
    rc=$?
    if [ "${rc}" -ne 0 ] || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "incomplete" ]; then
        fail "an absent docsOnly must fall back to the incomplete class" "rc=${rc} out=${out}"
        return
    fi

    pass "enrich docsOnly probe fails safe"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "pr-triage.sh tests"
echo "=========================================="

test_conflicting_pr_picked
test_revise_beats_conflict
test_oldest_wins_within_rank
test_ours_filter_excludes
test_empty_author_env_accepts_any
test_no_attention_no_pick
test_empty_and_malformed_no_pick
test_scan_polls_unknown_to_resolution
test_scan_retry_cap_no_pick
test_incomplete_pr_picked
test_bot_complete_pr_no_pick
test_revise_and_conflict_beat_incomplete
test_enrich_merges_signals_and_probes_only_clean_candidates
test_enrich_gh_error_fails_safe
test_enrich_malformed_passthrough
test_scan_picks_incomplete
test_docs_only_pr_picked_as_docs_merge
test_docs_merge_precedence
test_enrich_flags_docs_only
test_enrich_docs_only_fails_safe

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
