# GitHub sub-issue + dependency APIs for this repo and tokens

Research ticket: [#576](https://github.com/benjr70/Smart-Smoker-V2/issues/576) (part of wayfinder map #575). Probed live on 2026-08-29.

## TL;DR

- **Both APIs work on `benjr70/Smart-Smoker-V2` with the tokens we already have.** The local `gh` token and the daemon's token are the same kind of thing (classic PAT for `benjr70`, scopes include `repo` + `project`), and every probe below returned `200`.
- **No extra scope is needed for sub-issues or dependencies.** The REST endpoints answer with `X-Accepted-Oauth-Scopes:` *(empty)*, i.e. any token that can read the repo's issues (classic `repo`; fine-grained "Issues: read") can read them. Only the Project `Priority` field still needs `project`/`read:project`.
- **The repo's native dependency graph is currently empty for `team` slices.** #561 says "Blocked by #559 / #560" in its body but `blockedBy.totalCount == 0` natively; the new wayfinder tickets (#576-#581) *do* use native `blocked_by` + sub-issues (#578 is natively blocked by #576 and #577). A frontier query must keep the body-regex fallback until slices are created with native dependencies.
- **One GraphQL call** returns Priority, open-blocker count and parent per candidate (query shape below, cost 1 rate-limit point for 100 issues). It replaces the per-blocker `gh issue view` loop in `pickup-triage.sh` §2.

## 1. Endpoints and what they need

### REST (all under `/repos/{owner}/{repo}/issues/{issue_number}/...`, API version `2022-11-28`)

| Endpoint | Purpose | Fine-grained permission (docs) | Live on this repo |
| --- | --- | --- | --- |
| `GET .../sub_issues` | list sub-issues | Issues: read | 200, #575 → six children (#576-#581) |
| `GET .../parent` | parent issue | Issues: read | not probed (GraphQL `parent` used instead) |
| `POST/DELETE/PATCH .../sub_issues[...]` | add / remove / reprioritize | Issues: write | not probed |
| `GET .../dependencies/blocked_by` | issues blocking this one | Issues: read | 200, #578 → `[576, 577]` (both `open`) |
| `GET .../dependencies/blocking` | issues this one blocks | Issues: read | not probed |
| `POST/DELETE .../dependencies/blocked_by` | add / remove a blocker | Issues: write | not probed |
| `GET /issues/{n}` | includes `sub_issues_summary` and `issue_dependencies_summary` | Issues: read | 200: `{"blocked_by":2,"blocking":0,"total_blocked_by":2,"total_blocking":0}` on #578 |

Sources: [REST: Sub-issues](https://docs.github.com/en/rest/issues/sub-issues?apiVersion=2022-11-28), [REST: Issue dependencies](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2022-11-28). Each endpoint's "Fine-grained access tokens" section states the token must have the `"Issues"` repository permission (read for `GET`, write for mutations). Note the docs URL is `issue-dependencies`, not `dependencies` (that one 404s).

Header evidence (`gh api -i .../issues/576/dependencies/blocked_by`):

```
HTTP/2.0 200 OK
X-Accepted-Oauth-Scopes:            <- empty: no specific classic scope required
X-Github-Api-Version-Selected: 2022-11-28
X-Oauth-Scopes: ... project, repo, ...
```

`issue_dependencies_summary` counts do **not** distinguish open from closed blockers (`blocked_by` vs `total_blocked_by` differ only by visibility to the caller, not by state); to get an *open* blocker count you must list the blockers and filter on `state`.

### GraphQL

The `Issue` object exposes `blockedBy`, `blocking`, `issueDependenciesSummary`, `parent`, `subIssues`, `subIssuesSummary` (confirmed by `__type(name:"Issue")` introspection on api.github.com and in the [GraphQL objects reference](https://docs.github.com/en/graphql/reference/objects#issue)). No preview header is needed.

`projectItems { fieldValueByName(name:"Priority") }` requires `read:project` (queries) or `project` (queries + mutations): [Using the API to manage Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects), [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

## 2. Tokens

| Token | Where it comes from | Scopes (live `gh auth status`) | Sub-issues / deps | Project Priority |
| --- | --- | --- | --- | --- |
| (a) local `gh` | `GITHUB_TOKEN` env (active) and the keyring, both `benjr70` classic PATs | `repo, project, workflow, admin:org, ...` | yes | yes |
| (b) daemon | `infra/systemd/agent-daemon.service`: the `gh` keyring on the box, optionally overridden by `GH_TOKEN` in `~/.config/agent-daemon/env` | must include `project` (that is what `pickup-triage.sh` §0 greps for; without it it emits `pick-mcp`) | yes with `repo` | yes with `project` |

Minimum scope set for a frontier-query token: classic `repo` + `read:project` (or `project`); fine-grained: `Issues: read` + `Projects: read`. The daemon's current token already exceeds this.

## 3. Frontier query shape (Project #1 Priority + open blocker count)

Tested live with `gh api graphql` (cost = 1 point):

```graphql
query($owner:String!, $name:String!, $labels:[String!]) {
  repository(owner:$owner, name:$name) {
    issues(first:100, labels:$labels, states:OPEN) {
      nodes {
        number title body createdAt
        labels(first:30) { nodes { name } }
        parent { number }
        blockedBy(first:50) { totalCount nodes { number state } }
        issueDependenciesSummary { blockedBy totalBlockedBy }
        projectItems(first:10) {
          nodes {
            project { number }
            fieldValueByName(name:"Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }
}
```

jq post-processing (drop-in for `pickup-triage.sh` §2; adds native `openBlockers` next to the existing body-regex list and sorts the frontier):

```jq
def prio_rank: if .=="P0" then 0 elif .=="P1" then 1 else 2 end;
[.data.repository.issues.nodes[]
  | . as $i
  | ($i.projectItems.nodes | map(select(.project.number == $pn)) | first) as $pi
  | select($pi != null)
  | ($pi.fieldValueByName.name // "P2") as $prio
  | { number, title, createdAt, parent: $i.parent.number, priority: $prio,
      prio_rank: ($prio | prio_rank),
      openBlockers: ([$i.blockedBy.nodes[] | select(.state == "OPEN")] | length),
      bodyBlockers: ([$i.body // "" | scan("Blocked by[[:space:]]+#([0-9]+)") | .[0] | tonumber]) }]
| sort_by([.prio_rank, .createdAt])
| map(select(.openBlockers == 0))
```

Live output on the current `AFK`-labelled tickets (`-f labels=AFK`), after the same jq:

```json
[{"n":576,"parent":575,"prio":null,"openBlockers":0},
 {"n":577,"parent":575,"prio":null,"openBlockers":0}]
```

and #578 (label `wayfinder:grilling`) shows `blockedBy.nodes = [577 OPEN, 576 OPEN]`, `issueDependenciesSummary = {blockedBy:2}`, so it correctly falls off the frontier.

Notes for the implementer:

- `bodyBlockers` still needs the existing per-issue `gh issue view --json state` check until every slice is created with native `blocked_by`; once `prd-to-issues` posts native dependencies, drop the regex path.
- `blockedBy(first:50)` is plenty for this repo (max observed: 2). `states:OPEN` on the outer list already filters closed candidates; the inner `state` filter handles closed blockers.
- Issues not on Project #1 have `fieldValueByName == null` (e.g. #561 today); keep the `// "P2"` default.
- `issues(labels:[...])` is an AND filter; pass the single label the pickup routes on (`team` today, `AFK` after #581).

## 4. Method

Live probes: `gh api repos/.../issues/{575,576,578}{,/sub_issues,/dependencies/blocked_by}`, `gh api -i` for headers, `gh api graphql` with the query above and `__type` introspection, `gh auth status` for scopes; read `scripts/claude-agent/lib/pickup-triage.sh` §0/§2 and `infra/systemd/agent-daemon.service` (neither modified). Docs pages fetched with curl on 2026-08-29.
