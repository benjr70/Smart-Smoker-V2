#!/usr/bin/env bash
# review-poster.sh — the Review Poster: render, post, and track the automated
# one-time code review's footprint on a PR (skill: pr-review, team-pickup
# §6a.1b).
#
# Sourceable library owning the two machine markers that distinguish the
# automated review from human activity, behind stable functions so the skill
# never hand-rolls REST calls or marker strings. thread-reconciler.sh stays the
# only owner of thread enumeration/reply/resolve; this lib composes with it
# (`tr_unresolved_threads … | rp_filter_agent_threads`).
#
#   rp_render_finding <axis> <category> <severity> <summary> <failure_scenario>
#       → stdout: the uniform inline-comment body — RP_MARKER first line, then
#         the visible 🤖 header (axis · category · severity), summary, failure
#         scenario, dispute footer.
#
#   rp_post_inline <owner/repo> <pr> <commit_sha> <path> <line> <body>
#       → posts one inline review comment anchored to a right-hand diff line
#         (REST pulls/comments with commit_id/path/line/side=RIGHT). Non-zero
#         on API failure — the skill's 422 fallback keys off this.
#
#   rp_filter_agent_threads
#       → pure stdin filter over tr_unresolved_threads' JSON array: keeps only
#         elements whose first-comment body contains RP_MARKER. The ONLY thread
#         set the fix loop may touch; human threads never pass.
#
#   rp_done_marker_present <owner/repo> <pr>
#       → exit 0 iff any top-level PR comment carries RP_DONE_MARKER. The
#         once-per-PR idempotency gate (checked by team-pickup §6a.1b and
#         re-checked by the skill's pre-flight).
#
#   rp_post_done_marker <owner/repo> <pr> <n_findings> <m_fixed> <reviewed_sha> <fix_sha>
#       → posts the top-level completion comment: machine marker with both
#         SHAs (`fixes=none` when nothing was pushed) + human-readable tally.
#
# All functions shell out through GH_BIN (default `gh`) so tests stub the
# network away; behavior under test is the arguments passed and the parse of
# the responses, never a live API.

GH_BIN="${GH_BIN:-gh}"

RP_MARKER='<!-- pr-review-bot -->'
RP_DONE_MARKER='<!-- pr-review-done'

# rp_render_finding <axis> <category> <severity> <summary> <failure_scenario>
rp_render_finding() {
    local axis="$1" category="$2" severity="$3" summary="$4" scenario="$5"
    printf '%s\n' \
        "${RP_MARKER}" \
        "🤖 **pr-review** · ${axis} · ${category} · ${severity}" \
        "" \
        "${summary}" \
        "" \
        "**Failure scenario:** ${scenario}" \
        "" \
        "_Automated one-time review (team-pickup §6a.1b). A fix round follows; reply to dispute._"
}

# rp_post_inline <owner/repo> <pr> <commit_sha> <path> <line> <body>
rp_post_inline() {
    local repo="$1" pr="$2" commit="$3" path="$4" line="$5" body="$6"
    "${GH_BIN}" api "repos/${repo}/pulls/${pr}/comments" \
        -f body="${body}" \
        -f commit_id="${commit}" \
        -f path="${path}" \
        -F line="${line}" \
        -f side=RIGHT >/dev/null
}

# rp_filter_agent_threads  (stdin: tr_unresolved_threads JSON array)
rp_filter_agent_threads() {
    jq -c --arg marker "${RP_MARKER}" \
        '[ .[] | select(.body | contains($marker)) ]'
}

# rp_done_marker_present <owner/repo> <pr>
rp_done_marker_present() {
    local repo="$1" pr="$2" resp
    resp="$("${GH_BIN}" api "repos/${repo}/issues/${pr}/comments" --paginate)" || return 1
    printf '%s' "${resp}" | jq -e --arg marker "${RP_DONE_MARKER}" \
        '[ .[] | select(.body | contains($marker)) ] | length > 0' >/dev/null
}

# rp_post_done_marker <owner/repo> <pr> <n_findings> <m_fixed> <reviewed_sha> <fix_sha>
rp_post_done_marker() {
    local repo="$1" pr="$2" n="$3" m="$4" reviewed="$5" fix="$6" body
    body="$(printf '%s\n' \
        "${RP_DONE_MARKER} reviewed=${reviewed} fixes=${fix} -->" \
        "🤖 pr-review: ${n} findings, ${m} fixed (reviewed ${reviewed})")"
    "${GH_BIN}" api "repos/${repo}/issues/${pr}/comments" \
        -f body="${body}" >/dev/null
}
