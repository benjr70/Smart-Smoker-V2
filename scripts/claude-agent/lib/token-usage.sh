#!/usr/bin/env bash
# token-usage.sh — per-issue Claude token accounting from session transcripts.
#
# Every assistant message in a Claude Code transcript line carries
# `message.usage` (output/cache-read/cache-write/input tokens) and the
# `gitBranch` the session was on when the message landed. Team branches are
# always `feat/issue-<N>`, so summing usage by branch attributes the whole
# fleet's spend — main session AND subagent transcripts under
# <session>/subagents/ — to the issue it was working.
#
# Lines on other branches (master pickup orchestration, human sessions) are
# aggregated under "overhead" so totals reconcile, but only issue rows are
# ever posted to GitHub.
#
# Usage:
#   token-usage.sh scan                      # all issues, JSON on stdout
#   token-usage.sh scan --issue 417          # one issue's row (JSON)
#   token-usage.sh markdown --issue 417      # the GitHub comment body
#   token-usage.sh post --issue 417          # create-or-update the issue's
#                                            #   token-usage comment (marker
#                                            #   <!-- token-usage -->)
#
# scan JSON shape:
#   { "issues": { "<N>": { "outputTokens": i, "cacheReadTokens": i,
#                          "cacheWriteTokens": i, "inputTokens": i,
#                          "turns": i, "sessions": i } , ... },
#     "overhead": { same fields } }
#
# post is idempotent: one marked comment per issue, PATCHed in place on
# re-runs — re-posting after a resume/reconcile updates the same comment.
#
# Exit codes: 0 ok; 2 usage error; 3 transcripts dir missing; 4 gh post failed.
#
# Env:
#   GH_BIN                 gh CLI (default: gh) — injectable for tests
#   TOKEN_USAGE_DIR        transcripts dir (default: derived from the repo
#                          checkout path — ~/.claude/projects/<encoded-cwd>)
#   TOKEN_USAGE_REPO       owner/repo for post (default: benjr70/Smart-Smoker-V2)

set -uo pipefail

_tu_default_dir() {
    local top
    top="$(git rev-parse --show-toplevel 2>/dev/null)" || top="$(pwd)"
    # Claude Code encodes the project cwd by replacing '/' and '.' with '-'.
    printf '%s/.claude/projects/%s' "${HOME}" "$(printf '%s' "${top}" | sed 's|[/.]|-|g')"
}

# tu_scan [issue] — aggregate usage by issue; prints the scan JSON.
tu_scan() {
    local only_issue="${1:-}"
    local dir="${TOKEN_USAGE_DIR:-$(_tu_default_dir)}"
    [ -d "${dir}" ] || { echo "token-usage: transcripts dir not found: ${dir}" >&2; return 3; }

    # One pass: per file (main sessions + subagents), emit one compact record
    # per usage-bearing line, tagged with the source file for session counting.
    find "${dir}" -name '*.jsonl' -type f -print0 \
    | while IFS= read -r -d '' f; do
        jq -c --arg file "${f}" '
            select(.message.usage? != null)
            | ((.gitBranch // "" | capture("^feat/issue-(?<n>[0-9]+)$") | .n)?
               // "overhead") as $key
            | { key: $key, file: $file,
                out: (.message.usage.output_tokens // 0),
                cr:  (.message.usage.cache_read_input_tokens // 0),
                cw:  (.message.usage.cache_creation_input_tokens // 0),
                inp: (.message.usage.input_tokens // 0) }' "${f}" 2>/dev/null
    done \
    | jq -s --arg only "${only_issue}" '
        group_by(.key)
        | map({ key: .[0].key,
                value: { outputTokens: (map(.out) | add),
                         cacheReadTokens: (map(.cr) | add),
                         cacheWriteTokens: (map(.cw) | add),
                         inputTokens: (map(.inp) | add),
                         turns: length,
                         sessions: (map(.file) | unique | length) } })
        | from_entries
        | { issues: (to_entries | map(select(.key != "overhead")
                        | select($only == "" or .key == $only)) | from_entries),
            overhead: (.overhead // { outputTokens: 0, cacheReadTokens: 0,
                                      cacheWriteTokens: 0, inputTokens: 0,
                                      turns: 0, sessions: 0 }) }'
}

# tu_fmt <int> — humanize a token count (1234 → "1.2k", 45012345 → "45.0M").
tu_fmt() {
    awk -v n="$1" 'BEGIN {
        if (n >= 1000000)      printf "%.1fM", n / 1000000
        else if (n >= 1000)    printf "%.1fk", n / 1000
        else                   printf "%d", n
    }'
}

# tu_markdown <issue> [scanJson] — the comment body for one issue.
tu_markdown() {
    local issue="$1" scan="${2:-}"
    [ -n "${scan}" ] || scan="$(tu_scan "${issue}")" || return $?
    local row
    row="$(printf '%s' "${scan}" | jq -c --arg n "${issue}" '.issues[$n] // empty')"
    if [ -z "${row}" ]; then
        echo "token-usage: no transcript data for issue #${issue}" >&2
        return 2
    fi
    local out cr cw turns sessions
    out="$(printf '%s' "${row}" | jq -r '.outputTokens')"
    cr="$(printf '%s' "${row}" | jq -r '.cacheReadTokens')"
    cw="$(printf '%s' "${row}" | jq -r '.cacheWriteTokens')"
    turns="$(printf '%s' "${row}" | jq -r '.turns')"
    sessions="$(printf '%s' "${row}" | jq -r '.sessions')"
    cat <<EOF
<!-- token-usage -->
### 🔢 Token usage (agent transcripts)

| metric       | value |
| ------------ | ----- |
| output       | $(tu_fmt "${out}") |
| cache reads  | $(tu_fmt "${cr}") |
| cache writes | $(tu_fmt "${cw}") |
| API turns    | ${turns} |
| sessions     | ${sessions} |

_Summed over every \`feat/issue-${issue}\` transcript line (main session +
subagents) on the agent box. Updated $(date -u +%Y-%m-%dT%H:%M:%SZ)._
EOF
}

# tu_post <issue> [scanJson] — create-or-update the marked comment.
tu_post() {
    local issue="$1" scan="${2:-}"
    local gh="${GH_BIN:-gh}" repo="${TOKEN_USAGE_REPO:-benjr70/Smart-Smoker-V2}"
    local body existing_id
    body="$(tu_markdown "${issue}" "${scan}")" || return $?

    existing_id="$("${gh}" api "repos/${repo}/issues/${issue}/comments" --paginate \
        --jq '[.[] | select(.body | contains("<!-- token-usage -->"))][0].id // empty' \
        2>/dev/null || echo '')"

    if [ -n "${existing_id}" ]; then
        "${gh}" api --method PATCH "repos/${repo}/issues/comments/${existing_id}" \
            -f body="${body}" >/dev/null \
            || { echo "token-usage: PATCH failed for issue #${issue}" >&2; return 4; }
        echo "token-usage: updated comment on #${issue}"
    else
        "${gh}" api --method POST "repos/${repo}/issues/${issue}/comments" \
            -f body="${body}" >/dev/null \
            || { echo "token-usage: POST failed for issue #${issue}" >&2; return 4; }
        echo "token-usage: posted comment on #${issue}"
    fi
}

_tu_main() {
    local cmd="${1:-}"; shift || true
    local issue=''
    while [ $# -gt 0 ]; do
        case "$1" in
            --issue) issue="${2:-}"; shift 2 ;;
            *) echo "token-usage: unknown arg $1" >&2; exit 2 ;;
        esac
    done
    case "${cmd}" in
        scan)     tu_scan "${issue}" ;;
        markdown) [ -n "${issue}" ] || { echo "token-usage: markdown needs --issue" >&2; exit 2; }
                  tu_markdown "${issue}" ;;
        post)     [ -n "${issue}" ] || { echo "token-usage: post needs --issue" >&2; exit 2; }
                  tu_post "${issue}" ;;
        *) echo "usage: token-usage.sh scan|markdown|post [--issue N]" >&2; exit 2 ;;
    esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    _tu_main "$@"
    exit $?
fi
