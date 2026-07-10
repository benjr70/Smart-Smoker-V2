#!/usr/bin/env bash
# thread-reconciler.sh — the Thread Reconciler: enumerate, answer, and close
# review-comment threads on a PR.
#
# Sourceable library wrapping the three GitHub operations the reconcile phase's
# comment loop needs, behind stable functions so the skill never hand-rolls
# GraphQL:
#
#   tr_unresolved_threads <owner/repo> <pr>
#       → JSON array on stdout, one element per UNRESOLVED review thread:
#         [ { "threadId": "<graphql node id>", "path": "<file|null>",
#             "line": <n|null>, "commentDatabaseId": <rest id>,
#             "body": "<first comment body>" } ]
#         Resolved and outdated-but-resolved threads are excluded — the loop
#         only ever works threads a human still considers open. Exit 0 even
#         when the array is empty; non-zero only when the API call itself fails.
#
#   tr_reply <owner/repo> <pr> <comment_database_id> <body>
#       → posts an in-thread reply (REST `in_reply_to`) so the answer lands on
#         the reviewer's comment, not as a detached PR comment.
#
#   tr_resolve <thread_id>
#       → marks the thread resolved (GraphQL resolveReviewThread). The human
#         reopens the thread if the fix missed — that reopening is the signal
#         to re-apply `team:revise`.
#
# All functions shell out through GH_BIN (default `gh`) so tests stub the
# network away; behavior under test is the arguments passed and the parse of
# the responses, never a live API.

GH_BIN="${GH_BIN:-gh}"

# tr_unresolved_threads <owner/repo> <pr>
tr_unresolved_threads() {
    local repo="$1" pr="$2" owner name resp
    owner="${repo%%/*}"
    name="${repo##*/}"

    resp="$("${GH_BIN}" api graphql \
        -f query='
query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 1) {
            nodes { databaseId body }
          }
        }
      }
    }
  }
}' \
        -F owner="${owner}" -F name="${name}" -F pr="${pr}")" || return 1

    printf '%s' "${resp}" | jq -c '
        [ .data.repository.pullRequest.reviewThreads.nodes[]?
          | select(.isResolved == false)
          | { threadId: .id,
              path: .path,
              line: .line,
              commentDatabaseId: (.comments.nodes[0].databaseId),
              body: (.comments.nodes[0].body // "") } ]'
}

# tr_reply <owner/repo> <pr> <comment_database_id> <body>
tr_reply() {
    local repo="$1" pr="$2" comment_id="$3" body="$4"
    "${GH_BIN}" api "repos/${repo}/pulls/${pr}/comments" \
        -f body="${body}" \
        -F in_reply_to="${comment_id}" >/dev/null
}

# tr_resolve <thread_id>
tr_resolve() {
    local thread_id="$1"
    "${GH_BIN}" api graphql \
        -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { id isResolved }
  }
}' \
        -F threadId="${thread_id}" >/dev/null
}
