#!/usr/bin/env python3
"""Tests for the dashboard server's pure parsing/shaping functions.

Run: python3 scripts/claude-agent/dashboard/dashboard-server.test.py
(also discovered automatically by scripts/claude-agent/run-tests.sh)

Everything under test here is pure: fire-log parsing reads a temp log file,
maps shaping reads a literal GraphQL payload. No network, no gh, no journal —
the IO collectors (fetch_maps, fetch_prs) are thin wrappers around these.
"""

import importlib.util
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load_server():
    """Import server.py by path — it is import-safe (HTTP only under __main__)."""
    spec = importlib.util.spec_from_file_location(
        "dash_server", os.path.join(HERE, "server.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


srv = load_server()


def write_log(dirpath, name, body):
    path = os.path.join(dirpath, name)
    with open(path, "w") as f:
        f.write(body)
    return path


HEADER = "=== agent-run 20260101T000000Z ===\n"
FOOTER = "=== agent-run exit 0 ===\n"


class FireKindTests(unittest.TestCase):
    """A fire's `kind` is what the maintainer reads off the phone: slice /
    research / task / reconcile."""

    def parse(self, block, name="afk-pickup-20260101T000000Z.log"):
        with tempfile.TemporaryDirectory() as d:
            path = write_log(d, name, HEADER + block + FOOTER)
            return srv.parse_fire_log(path)

    def test_picked_slice_is_kind_slice(self):
        fire = self.parse("picked:   #589 dashboard fire kinds\n")
        self.assertEqual(fire["kind"], "slice")

    def test_resolve_research_line_is_kind_research(self):
        fire = self.parse("resolve:  #576 research github-dependency-apis\n")
        self.assertEqual(fire["kind"], "research")
        self.assertEqual(fire["steps"]["resolve"], "#576 research github-dependency-apis")

    def test_resolve_task_line_is_kind_task(self):
        fire = self.parse("resolve:  #590 task rotate-vapid-keys\n")
        self.assertEqual(fire["kind"], "task")

    def test_docs_merge_line_is_kind_reconcile(self):
        fire = self.parse("docs-merge: PR #601 deadbeef\n")
        self.assertEqual(fire["kind"], "reconcile")
        self.assertEqual(fire["steps"]["docs-merge"], "PR #601 deadbeef")

    def test_existing_reconcile_line_is_kind_reconcile(self):
        fire = self.parse("reconcile: PR #588 AFK:revise\n")
        self.assertEqual(fire["kind"], "reconcile")

    def test_resolve_wins_over_its_own_docs_merge(self):
        # /afk-resolve merges its own docs-only PR, so a resolve fire also
        # carries a docs-merge line; the resolve is what the fire WAS.
        fire = self.parse(
            "resolve:  #576 research github-dependency-apis\n"
            "docs-merge: PR #601 deadbeef\n"
        )
        self.assertEqual(fire["kind"], "research")

    def test_no_work_fire_has_no_kind(self):
        fire = self.parse("AGENT_RUN_NO_WORK=1\n")
        self.assertIsNone(fire["kind"])


class LogNamePrefixTests(unittest.TestCase):
    """Fires written before the team->AFK rename keep the team-pickup- name on
    disk forever; both prefixes must parse and order by embedded timestamp."""

    def test_both_prefixes_parse_and_order_newest_first(self):
        with tempfile.TemporaryDirectory() as d:
            write_log(
                d,
                "afk-pickup-20260101T000000Z.log",
                HEADER + "picked:   #101 new-name slice\n" + FOOTER,
            )
            write_log(
                d,
                "team-pickup-20260102T000000Z.log",  # historical name, NEWER
                HEADER + "picked:   #102 old-name slice\n" + FOOTER,
            )
            srv.LOG_DIR = d
            fires = srv.fetch_fires()["items"]
        self.assertEqual(
            [(f["id"], f["summary"], f["kind"]) for f in fires],
            [
                ("20260102T000000Z", "#102 old-name slice", "slice"),
                ("20260101T000000Z", "#101 new-name slice", "slice"),
            ],
        )


MAPS_PAYLOAD = {
    "data": {
        "repository": {
            "issues": {
                "nodes": [
                    {
                        "number": 575,
                        "title": "Wayfinder: adopt AFK planning front-end",
                        "url": "https://github.com/o/r/issues/575",
                        "body": (
                            "## Destination\n\n"
                            "**Reached:** a spec ready for /to-tickets.\n\n"
                            "## Notes\n- something else\n"
                        ),
                        "subIssues": {
                            "nodes": [
                                {   # frontier: open, unassigned, unblocked, AFK
                                    "number": 590,
                                    "title": "Research: rotate VAPID keys",
                                    "url": "https://github.com/o/r/issues/590",
                                    "state": "OPEN",
                                    "assignees": {"nodes": []},
                                    "labels": {"nodes": [
                                        {"name": "AFK"},
                                        {"name": "wayfinder:research"},
                                    ]},
                                    "blockedBy": {"nodes": []},
                                },
                                {   # frontier: HITL grilling, closed blocker only
                                    "number": 591,
                                    "title": "Decide: theming tokens",
                                    "url": "https://github.com/o/r/issues/591",
                                    "state": "OPEN",
                                    "assignees": {"nodes": []},
                                    "labels": {"nodes": [
                                        {"name": "HITL"},
                                        {"name": "wayfinder:grilling"},
                                    ]},
                                    "blockedBy": {"nodes": [
                                        {"number": 576, "state": "CLOSED"},
                                    ]},
                                },
                                {   # NOT frontier: open blocker
                                    "number": 592,
                                    "title": "Blocked ticket",
                                    "url": "https://github.com/o/r/issues/592",
                                    "state": "OPEN",
                                    "assignees": {"nodes": []},
                                    "labels": {"nodes": [{"name": "AFK"}]},
                                    "blockedBy": {"nodes": [
                                        {"number": 590, "state": "OPEN"},
                                    ]},
                                },
                                {   # NOT frontier: a human claimed it
                                    "number": 593,
                                    "title": "Claimed ticket",
                                    "url": "https://github.com/o/r/issues/593",
                                    "state": "OPEN",
                                    "assignees": {"nodes": [{"login": "benjr70"}]},
                                    "labels": {"nodes": [{"name": "AFK"}]},
                                    "blockedBy": {"nodes": []},
                                },
                                {   # NOT frontier: already resolved
                                    "number": 576,
                                    "title": "Done ticket",
                                    "url": "https://github.com/o/r/issues/576",
                                    "state": "CLOSED",
                                    "assignees": {"nodes": []},
                                    "labels": {"nodes": [{"name": "AFK"}]},
                                    "blockedBy": {"nodes": []},
                                },
                            ]
                        },
                    }
                ]
            }
        }
    }
}


class MapsShapingTests(unittest.TestCase):
    """The Maps card answers "what needs me?" — only the frontier of each open
    map: open, unassigned, unblocked children."""

    def setUp(self):
        self.maps = srv.shape_maps(MAPS_PAYLOAD)["items"]

    def test_one_map_with_title_and_destination(self):
        self.assertEqual(len(self.maps), 1)
        m = self.maps[0]
        self.assertEqual(m["number"], 575)
        self.assertEqual(m["title"], "Wayfinder: adopt AFK planning front-end")
        self.assertEqual(m["destination"], "Reached: a spec ready for /to-tickets.")

    def test_frontier_excludes_blocked_assigned_and_closed_children(self):
        self.assertEqual([t["number"] for t in self.maps[0]["frontier"]], [590, 591])

    def test_frontier_ticket_carries_type_and_badge(self):
        research, grilling = self.maps[0]["frontier"]
        self.assertEqual((research["type"], research["badge"]), ("research", "AFK"))
        self.assertEqual((grilling["type"], grilling["badge"]), ("grilling", "HITL"))

    def test_destination_falls_back_to_empty(self):
        payload = {"data": {"repository": {"issues": {"nodes": [
            {"number": 1, "title": "No destination", "url": "u",
             "body": "## Notes\n- nothing here\n", "subIssues": {"nodes": []}},
        ]}}}}
        self.assertEqual(srv.shape_maps(payload)["items"][0]["destination"], "")

    def test_inline_destination_line_is_read(self):
        payload = {"data": {"repository": {"issues": {"nodes": [
            {"number": 2, "title": "Inline", "url": "u",
             "body": "**Destination**: ship the thing\n", "subIssues": {"nodes": []}},
        ]}}}}
        self.assertEqual(
            srv.shape_maps(payload)["items"][1 - 1]["destination"], "ship the thing"
        )

    def test_empty_payload_yields_no_maps(self):
        empty = {"data": {"repository": {"issues": {"nodes": []}}}}
        self.assertEqual(srv.shape_maps(empty)["items"], [])


class DocsOnlyBadgeTests(unittest.TestCase):
    """A `docs(research):` PR is merged by the daemon itself (docs-only gate),
    so the maintainer can tell at a glance it is not waiting on them."""

    def test_docs_research_prefix_is_docs_only(self):
        self.assertTrue(srv.is_docs_only("docs(research): github dependency apis (#576)"))

    def test_other_titles_are_not_docs_only(self):
        for title in (
            "feat(agent): dashboard fire kinds",
            "docs(monorepo): README rewrite",
            "chore: bump deps",
            "",
        ):
            self.assertFalse(srv.is_docs_only(title), title)


if __name__ == "__main__":
    unittest.main(verbosity=2)
