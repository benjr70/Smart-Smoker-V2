#!/usr/bin/env bash
# docs-research-paths.sh — the one definition of "this path is a research doc".
#
# Two independent sensors must agree on it: `lib/pr-triage.sh` (which routes a
# PR to reason `docs-merge` from the `gh pr view --json files` list) and
# `lib/docs-only-gate.sh` (which re-checks the same rule against the real diff
# before the PR is merged). If the two ever drift, triage routes PRs the gate
# then refuses on every fire — burning an agent per fire — or docs PRs stop
# being routed at all. So the prefix lives here and both source this file.
#
# Overridable for tests only; production always uses the default.

: "${DOCS_RESEARCH_PREFIX:=docs/research/}"
