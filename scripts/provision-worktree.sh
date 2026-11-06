#!/usr/bin/env bash
# provision-worktree.sh — make a fresh Paperclip execution worktree runnable.
#
# Paperclip runs this automatically (as `bash ./scripts/provision-worktree.sh`,
# cwd = the new worktree) after `git worktree add`, before the agent's first
# run. A worktree has no node_modules; a full `npm run bootstrap` is minutes and
# a few GB per tree, so this hardlinks every node_modules directory from the
# base checkout instead (same inodes, no extra disk, seconds). npm replaces files
# rather than editing them in place, so a later `npm install` in the worktree
# cannot corrupt the base checkout.
#
# Env (set by Paperclip): PAPERCLIP_WORKSPACE_BASE_CWD — the base checkout.
# Falls back to `npm run bootstrap` when there is nothing to link from.
# Exit codes: 0 ok · 1 bootstrap failed.

set -euo pipefail

base="${PAPERCLIP_WORKSPACE_BASE_CWD:-}"
linked=0

if [ -n "${base}" ] && [ -d "${base}/node_modules" ]; then
    while IFS= read -r dir; do
        rel="${dir#"${base}"/}"
        [ -e "${rel}" ] && continue
        mkdir -p "$(dirname "${rel}")"
        cp -al "${dir}" "${rel}"
        linked=$((linked + 1))
    done < <(find "${base}" -maxdepth 3 -type d -name node_modules -not -path '*/node_modules/*' | sort)
    echo "provision-worktree: hardlinked ${linked} node_modules directories from ${base}"
fi

if [ ! -d node_modules ]; then
    echo "provision-worktree: nothing to link, running npm run bootstrap"
    npm run bootstrap
fi
