#!/usr/bin/env bash
# Aggregate test runner for the claude-agent daemon bash suites (#304).
#
# Run: bash scripts/claude-agent/run-tests.sh [ROOT_DIR]
#
# Discovers every *.test.sh under ROOT_DIR (default: this script's directory)
# and runs each one in its own bash process. Every suite is run even if an
# earlier one fails; the aggregate exit code is non-zero if ANY suite failed,
# so a mid-list failure is never masked by later-passing suites (AC3). This is
# the single entry point CI calls, so newly added *.test.sh files are picked up
# automatically with no workflow edit.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${1:-${SCRIPT_DIR}}"

if [ ! -d "${ROOT_DIR}" ]; then
    echo "FATAL: root directory not found: ${ROOT_DIR}" >&2
    exit 2
fi

# Discover suites deterministically (sorted) so run order is stable across
# platforms. Exclude this runner's own name defensively — it is not a *.test.sh
# so it never matches, but be explicit about intent.
suites=()
while IFS= read -r suite; do
    suites+=("${suite}")
done < <(find "${ROOT_DIR}" -type f -name '*.test.sh' | sort)

if [ "${#suites[@]}" -eq 0 ]; then
    echo "No *.test.sh suites found under ${ROOT_DIR}"
    exit 0
fi

total=0
failed=0
failed_suites=()

for suite in "${suites[@]}"; do
    total=$((total + 1))
    echo ""
    echo ">>> RUN ${suite}"
    if bash "${suite}"; then
        echo "<<< PASS ${suite}"
    else
        rc=$?
        echo "<<< FAIL ${suite} (exit ${rc})"
        failed=$((failed + 1))
        failed_suites+=("${suite}")
    fi
done

echo ""
echo "=========================================="
echo "Suites: ${total} | Failed: ${failed}"
echo "=========================================="

if [ "${failed}" -gt 0 ]; then
    echo "Failed suites:"
    for name in "${failed_suites[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi

exit 0
