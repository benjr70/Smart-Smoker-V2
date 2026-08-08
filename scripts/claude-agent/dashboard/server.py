#!/usr/bin/env python3
"""agent-dashboard server — read-only tailnet status page for the agent pipeline.

Serves two routes on 0.0.0.0:8090:
  GET /            the single-page dashboard (index.html, same directory)
  GET /api/status  aggregated JSON: usage tiles + gate, daemon state, current
                   fire, pipeline snapshot, open PRs, last 10 fires

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
  - Fire history: ~/claude-agent/logs/team-pickup-<TS>.log, name-sorted.

Every collector degrades independently: on failure the section keeps its last
good value flagged stale:true with the error string — /api/status never 500s.

Env overrides (all optional): DASHBOARD_PORT, USAGE_CREDS_FILE, USAGE_API_URL,
DASHBOARD_LOG_DIR, DASHBOARD_REPO.
"""

import glob
import json
import os
import re
import subprocess
import threading
import time
import urllib.request
from datetime import datetime, timezone
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
GATE_MIN_PCT = 25  # BUDGET_GATE_MIN_PCT default in lib/usage-sensor.sh
# systemd's default PATH has neither gh-adjacent tools nor nvm node; mirror the
# agent-daemon.service PATH so wp_scan's gh/jq resolve under the unit.
PATH_ENV = (
    "/home/claude-agent-1/.local/bin:"
    "/home/claude-agent-1/.nvm/versions/node/v24.7.0/bin:"
    "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)
HERE = os.path.dirname(os.path.abspath(__file__))


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run(cmd, timeout):
    env = dict(os.environ, PATH=PATH_ENV)
    out = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, env=env
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


_TS_RE = re.compile(r"team-pickup-(\d{8}T\d{6}Z)\.log$")
_EXIT_RE = re.compile(r"^=== agent-run exit (\d+) ===$", re.M)
_BLOCK_LINE_RE = re.compile(
    r"^(picked|dispatch|pr|pr-watch|review|verify|shots|reconcile):\s{1,}(.+)$", re.M
)
_HARD_FAIL_RE = re.compile(r"^agent-run: FAILED — exit (\d+)$", re.M)
_PAUSED_RE = re.compile(r"^agent-run: paused #(\d+)", re.M)
_RESET_RE = re.compile(r"^AGENT_RUN_RESET_AT=(\S+)$", re.M)


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
        "steps": steps,
        "noWork": no_work,
        "resetAt": reset.group(1) if reset else None,
    }


def fetch_fires():
    paths = sorted(glob.glob(os.path.join(LOG_DIR, "team-pickup-*.log")))
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


def fetch_prs():
    out = run(
        ["gh", "pr", "list", "--state", "open", "--json",
         "number,title,headRefName,labels,mergeable,isDraft"],
        timeout=30,
    )
    items = [
        {
            "number": p["number"],
            "title": p["title"],
            "branch": p["headRefName"],
            "labels": [l["name"] for l in p.get("labels", [])],
            "mergeable": p.get("mergeable"),
            "isDraft": p.get("isDraft", False),
        }
        for p in json.loads(out)
    ]
    return {"items": items}


def build_status():
    return {
        "generatedAt": now_iso(),
        "usage": cached("usage", 60, fetch_usage),
        "daemon": cached("daemon", 10, fetch_daemon),
        "fires": cached("fires", 10, fetch_fires),
        "pipeline": cached("pipeline", 60, fetch_pipeline),
        "openPrs": cached("prs", 60, fetch_prs),
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
