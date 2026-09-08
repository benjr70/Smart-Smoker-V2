#!/usr/bin/env bash
# deps-lane.sh — the Dependabot gate-and-merge lane's pure text transforms.
#
# Sourceable library. Every mutation the lane makes to a bot PR — its title, its
# body, the hidden markers it leaves in comments — is a pure text transform, so
# it lives here and is tested, instead of being prose in a skill that an agent
# re-improvises each fire. The functions take args and stdin and print to
# stdout; none of them shells out to gh or git, none of them read repo state,
# and the checklist path is always an argument.
#
# Usage (sourced):
#   . scripts/claude-agent/lib/deps-lane.sh
#   deps_lane_retitle "<title>" true|false      # title may also come on stdin
#   deps_lane_inject_checklist <checklist-path> < body > new-body
#   deps_lane_marker_emit tierA|tierB|fix-attempt <sha> [N]
#   deps_lane_marker_parse <sha> < all-comment-bodies
#
# Usage (CLI, same argument order):
#   scripts/claude-agent/lib/deps-lane.sh retitle "<title>" true
#   scripts/claude-agent/lib/deps-lane.sh inject-checklist <path> < body
#   scripts/claude-agent/lib/deps-lane.sh marker-emit tierA <sha>
#   scripts/claude-agent/lib/deps-lane.sh marker-parse <sha> < bodies
#
# Env:
#   DEPS_LANE_FIX_CAP   fix attempts at which the lane stops retrying (3)

set -uo pipefail

: "${DEPS_LANE_FIX_CAP:=3}"

DEPS_LANE_CHECKLIST_MARKER='<!-- bot-pr-checklist v1 -->'
DEPS_LANE_CHECKLIST_END='<!-- /bot-pr-checklist -->'

#-------------------------------------------------------------------------------
# retitle
#-------------------------------------------------------------------------------
# deps_lane_retitle <title> <security> | deps_lane_retitle <security> < title
#
# A security bump must land as `fix(deps):` so release-please cuts a patch
# release and the user-visible changelog says a vulnerability was fixed; a
# routine bump stays `chore(deps):` and stays out of the notes. Only the prefix
# is rewritten — Dependabot's remaining text (dependency names, version ranges,
# multi-dep groups) is carried through byte-for-byte, because that text is the
# only record of what actually moved.
#
# Unchanged, always: non-security titles, titles already starting `fix(deps):`
# (so the transform is idempotent), and any foreign prefix such as
# `chore(deps-dev):` or `build:` — the lane only ever promotes the exact
# `chore(deps):` prefix it knows Dependabot emits for production dependencies.
#
# The security flag must be exactly `true` or `false`; anything else returns 2
# and prints nothing. That is what makes the one-argument misuse
# `deps_lane_retitle "<title>"` fail loudly instead of treating the title as a
# flag and then reading a title from a stdin nobody is piping — which would
# either rename the PR to an empty string or block forever on a tty. A merely
# unrecognised flag is refused too (`True`, `1`, `yes`): silently reading it as
# "not a security update" would leave a vulnerability fix titled `chore`.
deps_lane_retitle() {
    local title security
    if [ "$#" -ge 2 ]; then
        title="$1"
        security="$2"
    else
        security="${1:-}"
    fi

    if [ "${security}" != "true" ] && [ "${security}" != "false" ]; then
        echo "deps-lane: retitle needs a security flag of exactly true|false," \
            "got: ${security:-<none>}" >&2
        return 2
    fi

    # Only now is it safe to block on stdin: the flag is known-good, so this can
    # only be the documented `deps_lane_retitle <flag> < title` form.
    if [ "$#" -lt 2 ]; then
        title="$(cat)"
    fi

    if [ "${security}" != "true" ]; then
        printf '%s\n' "${title}"
        return 0
    fi

    case "${title}" in
        'chore(deps):'*) printf 'fix(deps):%s\n' "${title#chore(deps):}" ;;
        *)               printf '%s\n' "${title}" ;;
    esac
    return 0
}

#-------------------------------------------------------------------------------
# inject checklist
#-------------------------------------------------------------------------------
# deps_lane_inject_checklist <checklist-path> < body > new-body
#
# Appends the checklist's *injected unit* to a PR body that does not already
# carry the `<!-- bot-pr-checklist v1 -->` marker, and is a byte-level no-op on a
# body that does. The marker is the idempotence key: the lane may touch the same
# PR many times (rebase, re-fire, a second reviewer pass), and a body that grew a
# second copy of the checklist would also grow a second set of empty checkboxes
# — silently un-ticking the verification a maintainer already did.
#
# The injected unit is the checklist file's first line (the opening marker)
# through the `<!-- /bot-pr-checklist -->` line, inclusive. Everything after the
# closing marker is maintainer notes about the file itself and is deliberately
# dropped; a file with no closing marker is injected whole, so a checklist that
# forgets its terminator still works.
#
# The no-op path streams the body straight back, so a body with no trailing
# newline, CRLFs or trailing blank lines survives byte-for-byte. On the append
# path the body is separated from the unit by one blank line, and an empty body
# yields the unit alone (no leading blank lines).
deps_lane_inject_checklist() {
    local checklist="${1:-}"

    if [ -z "${checklist}" ] || [ ! -f "${checklist}" ]; then
        echo "deps-lane: checklist file not found: ${checklist:-<none>}" >&2
        return 2
    fi

    # Buffer the body in a file rather than a variable: `$(cat)` strips trailing
    # newlines, and the marker-present path must be byte-identical. The buffer is
    # removed explicitly on both exit paths rather than by a RETURN trap: a trap
    # set here outlives the call in the *caller's* shell (it is only
    # function-scoped under `set -o functrace`), and this lib is sourced into
    # other people's shells — leaving a stray trap behind is a worse bug than the
    # duplicated `rm` it would save. There are exactly two paths; both clean up.
    local body_file; body_file="$(mktemp)"
    cat > "${body_file}"

    if grep -qF "${DEPS_LANE_CHECKLIST_MARKER}" "${body_file}"; then
        cat "${body_file}"
        rm -f "${body_file}"
        return 0
    fi

    if [ -s "${body_file}" ]; then
        cat "${body_file}"
        # Guarantee exactly one blank line between the body and the unit,
        # whether or not the body ended with a newline.
        if [ "$(tail -c 1 "${body_file}" | wc -l)" -eq 0 ]; then
            printf '\n'
        fi
        printf '\n'
    fi
    rm -f "${body_file}"

    # Print the opening marker through the closing marker, inclusive; with no
    # closing marker this prints the whole file. The unit starts at file line 1
    # rather than at a search for the opening marker: the checklist file's own
    # guard test (PR #661) asserts the opening marker IS line 1, so line 1 is a
    # checked invariant of that file and not an assumption made here.
    awk -v end="${DEPS_LANE_CHECKLIST_END}" \
        '{ print } index($0, end) { exit }' "${checklist}"
    return 0
}

#-------------------------------------------------------------------------------
# markers
#-------------------------------------------------------------------------------
# deps_lane_marker_emit <tierA|tierB|fix-attempt> <sha> [N]
#
# Prints one hidden HTML comment — the lane's memory of what it has already done
# to this exact head sha:
#   <!-- deps-lane tierA=green sha=<sha> -->
#   <!-- deps-lane tierB=PASS sha=<sha> -->
#   <!-- deps-lane fix-attempt=<N> sha=<sha> -->
#
# Every marker carries the sha because the lane's memory must expire the moment
# the PR moves: a tier B PASS earned by an older push says nothing about the code
# that would actually merge. Comments are append-only on GitHub, so the sha —
# not the presence of the comment — is what makes a verdict current.
#
# An unknown state (or fix-attempt with no N) is a caller bug: nothing is printed
# on stdout and the function returns 2, so a typo can never be silently recorded
# as a marker the parser will not read.
deps_lane_marker_emit() {
    local state="${1:-}" sha="${2:-}" n="${3:-}"

    if [ -z "${sha}" ]; then
        echo "deps-lane: marker emit requires a sha" >&2
        return 2
    fi

    case "${state}" in
        tierA) printf '<!-- deps-lane tierA=green sha=%s -->\n' "${sha}" ;;
        tierB) printf '<!-- deps-lane tierB=PASS sha=%s -->\n' "${sha}" ;;
        fix-attempt)
            if ! [[ "${n}" =~ ^[0-9]+$ ]]; then
                echo "deps-lane: fix-attempt marker requires a numeric N" >&2
                return 2
            fi
            printf '<!-- deps-lane fix-attempt=%s sha=%s -->\n' "${n}" "${sha}"
            ;;
        *)
            echo "deps-lane: unknown marker state: ${state:-<none>}" >&2
            return 2
            ;;
    esac
    return 0
}

# deps_lane_marker_parse <sha> < all-comment-bodies
#
# Reads every comment body on the PR (concatenated, in any order; markers may sit
# anywhere in a body, prose above and below) and prints one compact JSON object:
#
#   {"sha":"<sha>","tierA":<bool>,"tierB":<bool>,
#    "fixAttempts":<int>,"capReached":<bool>}
#
# tierA / tierB are true only when a marker carrying THIS sha says so — markers
# from any other sha are ignored entirely, which is what makes the lane forget a
# stale verdict the instant the PR is pushed to.
#
# fixAttempts counts the `fix-attempt=` markers for this sha; the N each marker
# carries is not read back. Counting the markers is the honest measure of "how
# many times did the lane try" even if a fire crashed before it could number its
# attempt correctly, and it cannot be inflated by one attempt writing a large N.
# capReached is fixAttempts >= DEPS_LANE_FIX_CAP (default 3).
#
# Always exits 0 with a well-formed verdict: an unreadable pile of comments must
# not crash the lane, it must simply vouch for nothing.
deps_lane_marker_parse() {
    local sha="${1:-}"
    local bodies; bodies="$(cat)"

    if [ -z "${sha}" ]; then
        echo "deps-lane: marker parse requires a sha" >&2
        sha=''
    fi

    local tier_a=false tier_b=false attempts=0
    if [ -n "${sha}" ]; then
        if printf '%s' "${bodies}" \
            | grep -qF "<!-- deps-lane tierA=green sha=${sha} -->"; then
            tier_a=true
        fi
        if printf '%s' "${bodies}" \
            | grep -qF "<!-- deps-lane tierB=PASS sha=${sha} -->"; then
            tier_b=true
        fi
        # grep -o counts every marker, including several on one line. The sha is
        # interpolated into an ERE, so escape anything a caller's sha could carry
        # that the regex engine would otherwise read as syntax.
        local sha_re
        sha_re="$(printf '%s' "${sha}" | sed 's/[][\\.^$*+?(){}|\/]/\\&/g')"
        attempts="$(printf '%s' "${bodies}" \
            | grep -oE "<!-- deps-lane fix-attempt=[0-9]+ sha=${sha_re} -->" \
            | wc -l | tr -d ' ')"
    fi
    [ -n "${attempts}" ] || attempts=0

    local cap="${DEPS_LANE_FIX_CAP:-3}"
    [[ "${cap}" =~ ^[0-9]+$ ]] || cap=3

    local cap_reached=false
    [ "${attempts}" -ge "${cap}" ] && cap_reached=true

    jq -cn --arg sha "${sha}" \
        --argjson tierA "${tier_a}" --argjson tierB "${tier_b}" \
        --argjson fixAttempts "${attempts}" --argjson capReached "${cap_reached}" \
        '{sha: $sha, tierA: $tierA, tierB: $tierB,
          fixAttempts: $fixAttempts, capReached: $capReached}'
    return 0
}

#-------------------------------------------------------------------------------
# CLI
#-------------------------------------------------------------------------------
# Runnable directly so a skill step is one shell line rather than a source plus a
# call. Subcommands take the same arguments, in the same order, as the functions;
# the function's return code is the exit code.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    _cmd="${1:-}"
    shift || true
    case "${_cmd}" in
        retitle)          deps_lane_retitle "$@" ;;
        inject-checklist) deps_lane_inject_checklist "$@" ;;
        marker-emit)      deps_lane_marker_emit "$@" ;;
        marker-parse)     deps_lane_marker_parse "$@" ;;
        *)
            echo "usage: deps-lane.sh {retitle|inject-checklist|marker-emit|marker-parse} …" >&2
            exit 2
            ;;
    esac
    exit $?
fi
