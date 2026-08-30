#!/usr/bin/env python3
"""agent-dashboard server — read-only tailnet status page for the agent pipeline.

Serves two routes on 0.0.0.0:8090:
  GET /            the single-page dashboard (index.html, same directory)
  GET /api/status  aggregated JSON: usage tiles + gate, daemon state, current
                   fire, pipeline snapshot, open PRs, last 10 fires, open
                   wayfinder maps + their frontier, Wayfinder tile counts

Binding all interfaces is deliberate: this box's ufw denies LAN inbound and
allows tailscale0, so any bound port is tailnet-only with no firewall change
(docs/CI-CD/claude-agent-vm.md). There are no POST routes — the read-only
guarantee is structural.

Data sources (no state files exist; everything is journal + logs + gh):
  - Claude usage: the same OAuth endpoint lib/usage-sensor.sh uses; the three
    user-facing tiles come from the response's limits[] (session / weekly_all /
    weekly_scoped-per-model). The gate verdict mirrors usage_gate: worst
    utilization across usable limits, fire threshold BUDGET_GATE_MIN_PCT (25).
  - Daemon state: journalctl SYSLOG_IDENTIFIER=agent-daemon (sudo-free), last
    matching state line wins. Fire logs stream nothing until the fire ends
    (claude --print buffers), so live state never reads the in-flight log body.
  - Pipeline snapshot: wp_scan from lib/work-probe.sh (pure gh, always exits 0).
  - Fire history: ~/claude-agent/logs/afk-pickup-<TS>.log (pre-rename fires
    kept the team-pickup- prefix; both are read), ordered by embedded
    timestamp. Each fire carries a `kind` derived from its block lines:
    slice / reconcile / resolve, the last narrowed to the wayfinder type it
    resolved (research / task / grilling / prototype).
  - Maps: one `gh api graphql` call for open `wayfinder:map` issues and their
    sub-issues, cached 5 minutes — the frontier moves on human time. A second
    call fires only when a sub-issue declares blockers in prose alone.

Every collector degrades independently: on failure the section keeps its last
good value flagged stale:true with the error string — /api/status never 500s.

Pure functions (parse_fire_log / fire_kind / shape_maps / shape_wayfinder /
is_docs_only) are kept separate from the IO collectors so dashboard-server.test.py
covers them with no network.

Env overrides (all optional): DASHBOARD_PORT, USAGE_CREDS_FILE, USAGE_API_URL,
DASHBOARD_LOG_DIR, DASHBOARD_REPO, DASHBOARD_GH_REPO.
"""

import glob
import json
import os
import re
import subprocess
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("DASHBOARD_PORT", "8090"))
REPO = os.environ.get("DASHBOARD_REPO", "/home/claude-agent-1/Smart-Smoker-V2")
LOG_DIR = os.environ.get(
    "DASHBOARD_LOG_DIR", os.path.expanduser("~/claude-agent/logs")
)
CREDS = os.environ.get(
    "USAGE_CREDS_FILE", os.path.expanduser("~/.claude/.credentials.json")
)
USAGE_URL = os.environ.get(
    "USAGE_API_URL", "https://api.anthropic.com/api/oauth/usage"
)
GH_REPO = os.environ.get("DASHBOARD_GH_REPO", "benjr70/Smart-Smoker-V2")
GATE_MIN_PCT = 25  # BUDGET_GATE_MIN_PCT default in lib/usage-sensor.sh
# systemd's default PATH has neither gh-adjacent tools nor nvm node; mirror the
# agent-daemon.service PATH so wp_scan's gh/jq resolve under the unit.
PATH_ENV = (
    "/home/claude-agent-1/.local/bin:"
    "/home/claude-agent-1/.nvm/versions/node/v24.7.0/bin:"
    "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)
HERE = os.path.dirname(os.path.abspath(__file__))


# Live transcripts of the fire (and its teammate subagents) — the only place
# an in-flight run's activity is visible, since claude --print buffers stdout.
CLAUDE_PROJECT_DIR = os.path.expanduser(
    "~/.claude/projects/-home-claude-agent-1-Smart-Smoker-V2"
)
HAIKU_MODEL = "claude-haiku-4-5-20251001"


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run(cmd, timeout, cwd=None):
    env = dict(os.environ, PATH=PATH_ENV)
    out = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, env=env, cwd=cwd
    )
    if out.returncode != 0:
        raise RuntimeError(
            f"{cmd[0]} exit {out.returncode}: {out.stderr.strip()[:200]}"
        )
    return out.stdout


# --- cache: each section keeps its last good value; a failing refresh serves
# --- the stale value with the error attached instead of breaking the page.
_cache = {}
_cache_locks = {}
_cache_guard = threading.Lock()


def cached(key, ttl, fn):
    with _cache_guard:
        lock = _cache_locks.setdefault(key, threading.Lock())
    with lock:
        entry = _cache.get(key)
        if entry and entry["expires"] > time.monotonic():
            return entry["value"]
        try:
            value = fn()
            value["asOf"] = now_iso()
            value["stale"] = False
            value["error"] = None
        except Exception as e:  # degrade, never 500
            value = dict(entry["value"]) if entry else {}
            value["stale"] = True
            value["error"] = str(e)[:300]
        _cache[key] = {"expires": time.monotonic() + ttl, "value": value}
        return value


# --- collectors -------------------------------------------------------------


def fetch_usage():
    with open(CREDS) as f:
        token = json.load(f)["claudeAiOauth"]["accessToken"]
    req = urllib.request.Request(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "anthropic-beta": "oauth-2025-04-20",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.load(resp)

    tiles = []
    for lim in data.get("limits") or []:
        kind = lim.get("kind")
        if kind == "session":
            label = "Session"
        elif kind == "weekly_all":
            label = "Weekly · all models"
        elif kind == "weekly_scoped":
            model = ((lim.get("scope") or {}).get("model") or {}).get(
                "display_name"
            ) or "scoped"
            label = f"Weekly · {model}"
        else:
            continue
        tiles.append(
            {
                "key": kind,
                "label": label,
                "percent": lim.get("percent"),
                "resetsAt": lim.get("resets_at"),
                "severity": lim.get("severity"),
            }
        )
    if not tiles:  # older payload shape: named fields only
        for key, label in (("five_hour", "Session"), ("seven_day", "Weekly · all models")):
            block = data.get(key)
            if isinstance(block, dict) and block.get("utilization") is not None:
                tiles.append(
                    {
                        "key": key,
                        "label": label,
                        "percent": block["utilization"],
                        "resetsAt": block.get("resets_at"),
                        "severity": None,
                    }
                )

    # Gate verdict, mirroring usage_gate: worst utilization across the named
    # fields plus active limits[] entries; fire while remaining >= threshold.
    candidates = []
    for key in ("five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"):
        block = data.get(key)
        if isinstance(block, dict) and isinstance(
            block.get("utilization"), (int, float)
        ):
            candidates.append(
                {"u": block["utilization"], "resetAt": block.get("resets_at")}
            )
    for lim in data.get("limits") or []:
        if isinstance(lim.get("percent"), (int, float)) and lim.get(
            "is_active"
        ) is not False:
            candidates.append({"u": lim["percent"], "resetAt": lim.get("resets_at")})
    gate = None
    if candidates:
        worst = max(candidates, key=lambda c: c["u"])
        remain = round(max(0.0, min(100.0, 100.0 - worst["u"])), 2)
        gate = {
            "remainPct": remain,
            "resetAt": worst["resetAt"],
            "shouldFire": remain >= GATE_MIN_PCT,
            "threshold": GATE_MIN_PCT,
        }
    return {"tiles": tiles, "gate": gate}


# Ordered daemon state table — exact marker lines from agent-daemon's log().
_STATE_RES = [
    ("firing", re.compile(r"^budget above min — firing agent-run$")),
    ("sleeping", re.compile(r"^sleeping (\d+)s until reset (\S+) \(work probe every (\d+)s\)$")),
    ("sleeping", re.compile(r"^sleeping (\d+)s until reset (\S+)$")),
    ("queue_empty", re.compile(r"^queue empty — sleeping until window reset")),
    ("woke_early", re.compile(r"^work appeared mid-window \((.+)\) — waking early$")),
    ("exhausted", re.compile(r"^run exhausted usage — sleeping until (\S+)$")),
    ("run_failed", re.compile(r"probe-sleeping \(fail (\d+)/(\d+)\)$")),
    ("fail_cap", re.compile(r"fail cap reached")),
    ("run_complete", re.compile(r"^run complete — re-checking budget$")),
    ("budget_poll", re.compile(r"^budget not yet replenished \(poll (\d+)/(\d+)\)")),
    ("degraded", re.compile(r"usage sensor and ccusage both degraded")),
    ("boot", re.compile(r"^starting \(")),
]
_PREFIX_RE = re.compile(r"^\[agent-daemon ([0-9TZ:.+-]+)\] (.*)$")
_SENSOR_RE = re.compile(
    r"^sensor=(\S+) remainPct=([\d.]+) shouldFire=(true|false) resetAt=(\S*)$"
)


def fetch_daemon():
    out = run(
        ["journalctl", "SYSLOG_IDENTIFIER=agent-daemon", "-n", "300",
         "--no-pager", "-o", "json"],
        timeout=10,
    )
    lines = []  # (at_iso, message) oldest -> newest
    for raw in out.splitlines():
        try:
            rec = json.loads(raw)
        except ValueError:
            continue
        m = _PREFIX_RE.match(rec.get("MESSAGE", ""))
        if m:
            lines.append((m.group(1), m.group(2)))

    state = stateDetail = stateAt = None
    sensor = None
    fail = None
    for at, msg in reversed(lines):
        if state is None:
            for key, rx in _STATE_RES:
                if rx.search(msg):
                    state, stateDetail, stateAt = key, msg, at
                    if key == "run_failed":
                        mm = rx.search(msg)
                        fail = {"count": int(mm.group(1)), "cap": int(mm.group(2))}
                    break
        if sensor is None:
            m = _SENSOR_RE.match(msg)
            if m:
                sensor = {
                    "sensor": m.group(1),
                    "remainPct": float(m.group(2)),
                    "shouldFire": m.group(3) == "true",
                    "resetAt": m.group(4) or None,
                    "at": at,
                }
        if state is not None and sensor is not None:
            break

    unit = {"active": "unknown", "mainPid": None, "since": None}
    try:
        unit["active"] = run(
            ["systemctl", "is-active", "agent-daemon"], timeout=5
        ).strip()
    except Exception as e:
        unit["active"] = str(e)[:40]
    try:
        show = run(
            ["systemctl", "show", "agent-daemon", "-p", "MainPID",
             "-p", "ActiveEnterTimestamp"],
            timeout=5,
        )
        for line in show.splitlines():
            k, _, v = line.partition("=")
            if k == "MainPID":
                unit["mainPid"] = int(v) or None
            elif k == "ActiveEnterTimestamp":
                unit["since"] = v or None
    except Exception:
        pass

    return {
        "unit": unit,
        "state": state or "unknown",
        "stateDetail": stateDetail,
        "stateAt": stateAt,
        "sensor": sensor,
        "fail": fail,
    }


# Dual prefix — historical: logs written before the team->AFK rename kept the
# team-pickup- prefix and are never renamed on disk.
_TS_RE = re.compile(r"(?:team|afk)-pickup-(\d{8}T\d{6}Z)\.log$")
_EXIT_RE = re.compile(r"^=== agent-run exit (\d+) ===$", re.M)
_BLOCK_LINE_RE = re.compile(
    r"^(picked|dispatch|pr|pr-watch|review|verify|shots|reconcile"
    r"|resolve|docs-merge):\s{1,}(.+)$",
    re.M,
)
# `resolve: #<n> <type> <slug>` — the word after the issue number is the
# wayfinder ticket type written by /afk-resolve. The repo has four non-map
# types; anything else (or an unparseable line) stays the generic "resolve"
# rather than being mislabelled as research.
_RESOLVE_TYPE_RE = re.compile(r"^#\d+\s+(\w+)")
WAYFINDER_TYPES = ("research", "task", "grilling", "prototype")
_HARD_FAIL_RE = re.compile(r"^agent-run: FAILED — exit (\d+)$", re.M)
_PAUSED_RE = re.compile(r"^agent-run: paused #(\d+)", re.M)
_RESET_RE = re.compile(r"^AGENT_RUN_RESET_AT=(\S+)$", re.M)


def fire_kind(steps):
    """What the fire WAS, from its block lines: slice/reconcile or the
    wayfinder type it resolved (research/task/grilling/prototype).

    `resolve:` wins over `docs-merge:` because /afk-resolve merges its own
    docs-only PR — such a fire is still the ticket it resolved. The type is
    read verbatim from the line and only accepted when it is one of the repo's
    wayfinder types; an unknown or unparseable type badges as the neutral
    "resolve" so the phone never claims research that did not happen.
    A bare `docs-merge:` (the pr-triage reason for an orphaned docs-only PR)
    and the existing `reconcile:` line are both PR reconciliation. Fires with
    no work block (no-work / crashed) have no kind at all.
    """
    resolve = steps.get("resolve")
    if resolve:
        m = _RESOLVE_TYPE_RE.match(resolve.strip())
        kind = m.group(1).lower() if m else ""
        return kind if kind in WAYFINDER_TYPES else "resolve"
    if steps.get("docs-merge") or steps.get("reconcile"):
        return "reconcile"
    if steps.get("picked") or steps.get("dispatch"):
        return "slice"
    return None


def parse_fire_log(path):
    ts = _TS_RE.search(path).group(1)
    started = datetime.strptime(ts, "%Y%m%dT%H%M%SZ").replace(
        tzinfo=timezone.utc
    )
    size = os.path.getsize(path)
    with open(path, errors="replace") as f:
        if size > 65536:
            f.seek(size - 65536)
        tail = f.read()

    exit_m = _EXIT_RE.search(tail)
    steps = {}
    for m in _BLOCK_LINE_RE.finditer(tail):
        steps[m.group(1)] = m.group(2).strip()
    no_work = "AGENT_RUN_NO_WORK=1" in tail
    hard = _HARD_FAIL_RE.search(tail)
    paused = _PAUSED_RE.search(tail)
    reset = _RESET_RE.search(tail)

    if steps.get("picked"):
        summary = steps["picked"]
    elif steps.get("resolve"):
        summary = "resolve " + steps["resolve"]
    elif steps.get("docs-merge"):
        summary = "docs-merge " + steps["docs-merge"]
    elif paused:
        summary = f"paused #{paused.group(1)} (usage exhausted)"
    elif no_work:
        summary = "no work — queue empty"
    elif hard:
        summary = f"FAILED — exit {hard.group(1)}"
    elif exit_m:
        summary = f"exit {exit_m.group(1)} (no output block)"
    else:
        summary = "in flight"

    return {
        "id": ts,
        "startedAt": started.isoformat(),
        "exit": int(exit_m.group(1)) if exit_m else None,
        "inFlight": exit_m is None,
        "summary": summary,
        "kind": fire_kind(steps),
        "steps": steps,
        "noWork": no_work,
        "resetAt": reset.group(1) if reset else None,
    }


def fetch_fires():
    # historical: pre-rename fires wrote team-pickup-<TS>.log; both names are
    # ordered by their embedded timestamp, never by filename ("afk" < "team").
    paths = sorted(
        (
            p
            for p in glob.glob(os.path.join(LOG_DIR, "*-pickup-*.log"))
            if _TS_RE.search(p)
        ),
        key=lambda p: _TS_RE.search(p).group(1),
    )
    fires = [parse_fire_log(p) for p in reversed(paths[-12:])]
    current = None
    if fires and fires[0]["inFlight"]:
        # Guard against an ancient crashed log looking in-flight forever.
        age = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(fires[0]["startedAt"])
        ).total_seconds()
        if age < 3 * 3600:
            current = fires[0]
    return {"items": fires[:10], "current": current}


def fetch_pipeline():
    out = run(
        ["bash", "-c",
         f"source '{REPO}/scripts/claude-agent/lib/work-probe.sh'; wp_scan"],
        timeout=90,
    )
    return {"scan": json.loads(out.strip())}


def is_docs_only(title):
    """A docs-only research PR — /afk-resolve's own output, which the daemon
    admin-merges without human review. Read from the title prefix: no extra
    API call (the file list would cost one `gh pr view` per PR)."""
    return (title or "").startswith("docs(research):")


def fetch_prs():
    out = run(
        ["gh", "pr", "list", "--state", "open", "--json",
         "number,title,headRefName,labels,mergeable,isDraft,url"],
        timeout=30,
    )
    items = [
        {
            "number": p["number"],
            "title": p["title"],
            "url": p.get("url"),
            "branch": p["headRefName"],
            "labels": [l["name"] for l in p.get("labels", [])],
            "mergeable": p.get("mergeable"),
            "isDraft": p.get("isDraft", False),
            "docsOnly": is_docs_only(p.get("title")),
        }
        for p in json.loads(out)
    ]
    return {"items": items}


# --- wayfinder maps ---------------------------------------------------------

# A map's Destination is written by /wayfinder as a `## Destination` heading
# (text on the following line) or, in older maps, an inline `**Destination**:`.
# The word must END the label — bare (heading form) or followed by a colon —
# so prose like "Destinations are still being scoped" is not a Destination.
_DEST_RE = re.compile(
    r"^(?:#{1,6}\s*)?\*{0,2}Destination\*{0,2}\s*(?::\s*(.*))?$", re.I
)
_WAYFINDER_TYPE_RE = re.compile(r"^wayfinder:(.+)$")
# Body-text dependency, still the only form prd-to-issues slices use — the
# native dependency graph is empty for them (docs/research/afk-planning-front-end
# /github-dependency-apis.md). Same regex the picker used: `Blocked by #N`.
_BODY_BLOCKER_RE = re.compile(r"Blocked by\s+#(\d+)", re.I)

# Page sizes are bounded by GitHub's static node budget: it multiplies every
# `first:` down each nesting path and rejects a query whose product exceeds
# 500,000 nodes (MAX_NODE_LIMIT_EXCEEDED) before it looks at any data — so
# GraphQL's per-page maximum of 100 everywhere is NOT usable here. These values
# cost 20 + 20x30 + 20x30x(5+10+10) = 15,620 nodes, generous for this repo and
# far under the ceiling. Truncation is never silent regardless of the sizes:
# totalCount is exact whatever page was returned, and pageInfo.hasNextPage
# flags a paged list, so the card marks its own view partial.
MAPS_QUERY = """
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 20, labels: ["wayfinder:map"], states: OPEN,
           orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage }
      nodes {
        number title url body
        subIssues(first: 30) {
          totalCount
          pageInfo { hasNextPage }
          nodes {
            number title url state body
            assignees(first: 5) { nodes { login } }
            labels(first: 10) { nodes { name } }
            blockedBy(first: 10) { nodes { number state } }
          }
        }
      }
    }
  }
}
"""


def _destination(body):
    """First Destination line of a map body, else ''.

    Handles both `## Destination` (value on the next non-empty line) and an
    inline `**Destination**: …`. Markdown emphasis is stripped so the phone
    reads a plain sentence.
    """
    lines = (body or "").splitlines()
    for i, line in enumerate(lines):
        m = _DEST_RE.match(line.strip())
        if not m:
            continue
        value = (m.group(1) or "").strip()
        if not value:  # heading form — the sentence is on a following line
            for nxt in lines[i + 1:]:
                nxt = nxt.strip()
                if not nxt:
                    continue
                # An empty Destination section: the next heading is the NEXT
                # section, never this map's destination.
                value = "" if nxt.startswith("#") else nxt
                break
        return value.replace("**", "").strip()
    return ""


def body_blockers(body):
    """Issue numbers a body declares as blockers, in order, de-duplicated."""
    numbers = []
    for m in _BODY_BLOCKER_RE.finditer(body or ""):
        n = int(m.group(1))
        if n not in numbers:
            numbers.append(n)
    return numbers


def _payload_children(payload):
    """Every sub-issue node of every map in a GraphQL payload."""
    nodes = (
        ((payload or {}).get("data") or {}).get("repository") or {}
    ).get("issues") or {}
    for mp in nodes.get("nodes") or []:
        for child in ((mp.get("subIssues") or {}).get("nodes") or []):
            yield child


def _states_in_payload(payload):
    """number -> state for every issue the payload already reveals a state for.

    Sub-issues carry their own state and native blockers carry theirs, so a
    slice blocked by a sibling slice needs no extra API call.
    """
    states = {}
    for child in _payload_children(payload):
        if child.get("number") is not None and child.get("state"):
            states.setdefault(child["number"], child["state"])
        for b in ((child.get("blockedBy") or {}).get("nodes") or []):
            if b.get("number") is not None and b.get("state"):
                states.setdefault(b["number"], b["state"])
    return states


def unresolved_body_blockers(payload):
    """Body-declared blocker numbers whose state the payload does not reveal."""
    known = _states_in_payload(payload)
    wanted = []
    for child in _payload_children(payload):
        for n in body_blockers(child.get("body")):
            if n not in known and n not in wanted:
                wanted.append(n)
    return sorted(wanted)


def shape_maps(payload, states=None):
    """Pure: GraphQL payload -> open maps, each with its frontier tickets.

    Frontier = sub-issues that are open, unassigned (a human claim keeps the
    daemon and this card out of it) and not blocked by an open issue — i.e.
    exactly what could be worked next.

    Blockers are read from BOTH GitHub's native dependency graph and the
    body-text `Blocked by #N` form, because prd-to-issues slices declare their
    dependencies only in prose (the research note above). `states` supplies the
    state of prose blockers the payload itself does not reveal; an unknown
    blocker counts as OPEN — the card fails safe (hides work) rather than
    calling blocked work "ready to be worked next".

    The map list and each frontier list are also flagged when GitHub paged the
    result, so a partial view is never shown as the whole truth.
    """
    nodes = (
        ((payload or {}).get("data") or {}).get("repository") or {}
    ).get("issues") or {}
    known = dict(_states_in_payload(payload))
    for n, state in (states or {}).items():
        known[n] = state
    items = []
    for mp in nodes.get("nodes") or []:
        frontier = []
        subs = mp.get("subIssues") or {}
        for child in (subs.get("nodes") or []):
            if child.get("state") != "OPEN":
                continue
            if (child.get("assignees") or {}).get("nodes"):
                continue
            blockers = (child.get("blockedBy") or {}).get("nodes") or []
            if any(b.get("state") == "OPEN" for b in blockers):
                continue
            if any(
                known.get(n, "OPEN") == "OPEN"
                for n in body_blockers(child.get("body"))
            ):
                continue
            labels = [
                l.get("name") for l in ((child.get("labels") or {}).get("nodes") or [])
            ]
            kind = None
            for name in labels:
                m = _WAYFINDER_TYPE_RE.match(name or "")
                if m:
                    kind = m.group(1)
                    break
            frontier.append(
                {
                    "number": child.get("number"),
                    "title": child.get("title"),
                    "url": child.get("url"),
                    "type": kind,
                    "badge": "AFK" if "AFK" in labels else
                             "HITL" if "HITL" in labels else None,
                }
            )
        sub_total = subs.get("totalCount")
        sub_partial = bool((subs.get("pageInfo") or {}).get("hasNextPage")) or (
            isinstance(sub_total, int) and sub_total > len(subs.get("nodes") or [])
        )
        items.append(
            {
                "number": mp.get("number"),
                "title": mp.get("title"),
                "url": mp.get("url"),
                "destination": _destination(mp.get("body")),
                "frontier": frontier,
                "partial": sub_partial,
            }
        )
    total = nodes.get("totalCount")
    truncated = bool((nodes.get("pageInfo") or {}).get("hasNextPage")) or any(
        m["partial"] for m in items
    )
    return {
        "items": items,
        # totalCount is exact even when the node list was paged, so the tile's
        # map count and this card's list can never disagree silently.
        "total": total if isinstance(total, int) else len(items),
        "truncated": truncated,
    }


def fetch_blocker_states(numbers):
    """State of issues referenced only as prose `Blocked by #N`, in one call."""
    if not numbers:
        return {}
    owner, _, name = GH_REPO.partition("/")
    fields = " ".join(
        f"i{n}: issue(number: {n}) {{ number state }}" for n in numbers[:80]
    )
    query = (
        "query($owner: String!, $name: String!) { "
        f"repository(owner: $owner, name: $name) {{ {fields} }} }}"
    )
    out = run(
        ["gh", "api", "graphql",
         "-f", f"query={query}",
         "-F", f"owner={owner}", "-F", f"name={name}"],
        timeout=30,
    )
    repo = ((json.loads(out).get("data") or {}).get("repository") or {})
    return {
        v["number"]: v["state"]
        for v in repo.values()
        if isinstance(v, dict) and v.get("number") is not None and v.get("state")
    }


def fetch_maps():
    owner, _, name = GH_REPO.partition("/")
    out = run(
        ["gh", "api", "graphql",
         "-f", f"query={MAPS_QUERY}",
         "-F", f"owner={owner}", "-F", f"name={name}"],
        timeout=30,
    )
    payload = json.loads(out)
    try:
        # Only fires when a slice declares blockers in prose alone.
        states = fetch_blocker_states(unresolved_body_blockers(payload))
    except Exception:
        states = {}  # unknown blockers read as OPEN: hide, never over-promise
    return shape_maps(payload, states)


def shape_wayfinder(scan, maps):
    """Pure: the one-line Wayfinder tile — "N maps · M frontier · K AFK".

    When the maps call failed (cached() hands back {} or a stale value with
    `error` set) the counts are UNKNOWN, not zero: they come back as None with
    `unknown: true` so the tile renders "?" instead of telling the maintainer
    the frontier is clear when the truth was never fetched. `truncated` says
    the fetched list itself was partial.
    """
    maps = maps or {}
    unknown = bool(maps.get("error")) or maps.get("items") is None
    items = maps.get("items") or []
    frontier = [t for m in items for t in m.get("frontier") or []]
    total = maps.get("total")
    open_maps = total if isinstance(total, int) else (scan or {}).get("openMaps")
    return {
        "maps": open_maps if isinstance(open_maps, int) else None,
        "frontier": None if unknown else len(frontier),
        "afk": None if unknown
               else len([t for t in frontier if t.get("badge") == "AFK"]),
        "unknown": unknown,
        "truncated": bool(maps.get("truncated")),
        "queueSlices": (scan or {}).get("slices"),
        "queueWayfinder": (scan or {}).get("wayfinder"),
    }


def _recent_transcript_events(since, max_events=40):
    """Compact activity lines from every transcript active since the fire began.

    Each teammate subagent writes its own JSONL in the project dir, so scanning
    all recently-modified files captures which agents are working, not just the
    top-level fire. Reads only the tail of each file; malformed lines skipped.
    """
    def born_after(path):
        # A transcript belongs to the fire only if its FIRST entry postdates
        # the fire's start — mtime alone also matches unrelated interactive
        # sessions running in the same project (observed: the summary described
        # the dashboard-building session instead of the fire).
        try:
            with open(path, errors="replace") as f:
                first = json.loads(f.readline())
            ts = first.get("timestamp") or ""
            born = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return born >= since - timedelta(seconds=60)
        except Exception:
            return False

    paths = [
        p
        for p in glob.glob(os.path.join(CLAUDE_PROJECT_DIR, "*.jsonl"))
        if os.path.getmtime(p) >= since.timestamp() and born_after(p)
    ]
    paths.sort(key=os.path.getmtime)
    events = []
    for p in paths[-6:]:
        size = os.path.getsize(p)
        with open(p, errors="replace") as f:
            if size > 131072:
                f.seek(size - 131072)
            lines = f.read().splitlines()[1:] if size > 131072 else f.read().splitlines()
        for raw in lines[-80:]:
            try:
                rec = json.loads(raw)
            except ValueError:
                continue
            content = (rec.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            ts = rec.get("timestamp") or ""
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use":
                    inp = block.get("input") or {}
                    hint = (
                        inp.get("description")
                        or inp.get("command")
                        or inp.get("prompt")
                        or inp.get("file_path")
                        or inp.get("skill")
                        or ""
                    )
                    events.append(
                        (ts, f"tool {block.get('name')}: {str(hint)[:110]}")
                    )
                elif block.get("type") == "text" and rec.get("type") == "assistant":
                    text = (block.get("text") or "").strip()
                    if text:
                        events.append((ts, f"says: {text[:110]}"))
    events.sort(key=lambda e: e[0])
    return [line for _, line in events[-max_events:]]


def fetch_fire_summary():
    """Haiku-written title + description of the in-flight fire.

    Only source rich enough is the live transcript tail; the fire's own log is
    header-only until it exits (claude --print buffers). One cheap haiku call
    per cache window, and only while a fire is actually running.
    """
    fires = cached("fires", 10, fetch_fires)
    cur = fires.get("current")
    if not cur:
        return {"forFire": None, "title": None, "description": None}

    started = datetime.fromisoformat(cur["startedAt"])
    events = _recent_transcript_events(started)
    issue = None
    try:
        items = json.loads(
            run(
                ["gh", "issue", "list", "--label", "AFK:in-progress",
                 "--state", "open", "--json", "number,title"],
                timeout=15,
            )
        )
        if items:
            issue = f"issue #{items[0]['number']}: {items[0]['title']}"
    except Exception:
        pass
    if not events and not issue:
        return {"forFire": cur["id"], "title": None, "description": None}

    context = "\n".join(
        filter(
            None,
            [
                f"Fire started {cur['startedAt']} (log {cur['id']}).",
                f"Locked issue: {issue}" if issue else None,
                "Recent activity (oldest first):",
                *events,
            ],
        )
    )
    prompt = (
        "You are labeling a status card for an autonomous coding-agent run "
        "(a '/afk-pickup' fire: it picks a GitHub issue or reconciles a PR, "
        "spawns implementer/reviewer/verifier subagents, runs CI and manual "
        "verification). Based on the activity below, reply with ONLY a JSON "
        'object {"title": "...", "description": "..."} — title under 60 chars '
        "naming the work item and phase; description 1-2 plain sentences on "
        "what is happening right now and which agent/step is active. No "
        "markdown, no code fences.\n\n" + context[:8000]
    )
    out = run(
        ["claude", "--model", HAIKU_MODEL, "-p", prompt],
        timeout=120,
        cwd="/tmp",  # neutral cwd: don't load the repo's project context
    )
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        raise RuntimeError(f"haiku reply unparseable: {out.strip()[:120]}")
    parsed = json.loads(m.group(0))
    return {
        "forFire": cur["id"],
        "title": str(parsed.get("title") or "")[:80] or None,
        "description": str(parsed.get("description") or "")[:400] or None,
        "issue": issue,
    }


def build_status():
    # Maps are one GraphQL call: 5-minute cache (the frontier moves on human
    # time, not fire time). The Wayfinder tile joins it to the queue split the
    # work probe already computes, so it costs nothing extra.
    maps = cached("maps", 300, fetch_maps)
    pipeline = cached("pipeline", 60, fetch_pipeline)
    return {
        "generatedAt": now_iso(),
        "usage": cached("usage", 60, fetch_usage),
        "daemon": cached("daemon", 10, fetch_daemon),
        "fires": cached("fires", 10, fetch_fires),
        "pipeline": pipeline,
        "openPrs": cached("prs", 60, fetch_prs),
        "maps": maps,
        "wayfinder": shape_wayfinder((pipeline or {}).get("scan"), maps),
        "fireSummary": cached("fireSummary", 90, fetch_fire_summary),
    }


# --- HTTP -------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = "agent-dashboard"

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            try:
                with open(os.path.join(HERE, "index.html"), "rb") as f:
                    body = f.read()
            except OSError:
                self.send_error(500, "index.html missing")
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/status":
            body = json.dumps(build_status()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            self.send_error(404)

    def do_HEAD(self):
        if self.path in ("/", "/index.html", "/api/status"):
            self.send_response(200)
            self.end_headers()
        else:
            self.send_error(404)

    def log_message(self, fmt, *args):  # journal stays quiet per request
        pass


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"agent-dashboard listening on 0.0.0.0:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
