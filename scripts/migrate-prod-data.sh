#!/usr/bin/env bash
# migrate-prod-data.sh — one-time guarded MongoDB data migration (deep module)
#
# Dumps from old prod via SSH and restores into new prod via SSH. The dump is
# streamed directly into the restore (mongodump --archive | mongorestore
# --archive) so no intermediate dump file ever touches disk on the operator's
# machine.
#
# A run-once guard (sentinel file beside this script) prevents accidental
# re-execution: once a migration has completed, subsequent invocations are
# no-ops. This makes the script safe to wire into an automated cutover step
# that might be retried.
#
# All remote work runs over `ssh root@<host>`, so SSH is the single system
# boundary (mockable in tests by PATH-prepending an `ssh` stub).
#
# Usage:
#   scripts/migrate-prod-data.sh <old-host> <new-host> [--db <dbname>]
#
# Parameters:
#   old-host   SSH host of old prod (mongodump source), SSH'd as root@<host>.
#   new-host   SSH host of new prod (mongorestore target), SSH'd as root@<host>.
#   --db <n>   Database name (default: smart-smoker).
#
# Exit codes:
#   0  migration completed (or already run — guard active)
#   1  invalid arguments or migration failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD_FILE="${SCRIPT_DIR}/.migrate-prod-data.done"

usage() {
    echo "Usage: $(basename "$0") <old-host> <new-host> [--db <dbname>]" >&2
}

#-------------------------------------------------------------------------------
# Argument parsing + validation
#-------------------------------------------------------------------------------
OLD_HOST="${1:-}"
NEW_HOST="${2:-}"
DB_NAME="smart-smoker"

if [ -z "${OLD_HOST}" ] || [ -z "${NEW_HOST}" ]; then
    echo "migrate-prod-data: missing required <old-host> and/or <new-host>" >&2
    usage
    exit 1
fi

shift 2 || true
while [ "$#" -gt 0 ]; do
    case "$1" in
        --db)
            DB_NAME="${2:-}"
            if [ -z "${DB_NAME}" ]; then
                echo "migrate-prod-data: --db requires a value" >&2
                usage
                exit 1
            fi
            shift 2
            ;;
        *)
            echo "migrate-prod-data: unknown argument '$1'" >&2
            usage
            exit 1
            ;;
    esac
done

#-------------------------------------------------------------------------------
# Run-once guard
#-------------------------------------------------------------------------------
if [ -f "${GUARD_FILE}" ]; then
    echo "migrate-prod-data: already run — skipping"
    exit 0
fi

#-------------------------------------------------------------------------------
# Dump from old prod, restore into new prod (streamed).
#
# mongorestore --drop ensures the target collections are replaced rather than
# merged, giving a clean cutover. The pipeline status is checked via
# PIPESTATUS so a failure on either side fails the migration without creating
# the guard (allowing a retry).
#-------------------------------------------------------------------------------
echo "migrate-prod-data: migrating db '${DB_NAME}' from ${OLD_HOST} -> ${NEW_HOST}"

ssh "root@${OLD_HOST}" "mongodump --db '${DB_NAME}' --archive" \
    | ssh "root@${NEW_HOST}" "mongorestore --archive --drop --db '${DB_NAME}'"

# shellcheck disable=SC2206
PIPE_STATUS=("${PIPESTATUS[@]}")
DUMP_RC="${PIPE_STATUS[0]}"
RESTORE_RC="${PIPE_STATUS[1]}"

if [ "${DUMP_RC}" -ne 0 ] || [ "${RESTORE_RC}" -ne 0 ]; then
    echo "migrate-prod-data: migration FAILED (mongodump=${DUMP_RC}, mongorestore=${RESTORE_RC})" >&2
    echo "migrate-prod-data: guard NOT set — safe to retry" >&2
    exit 1
fi

#-------------------------------------------------------------------------------
# Success: set the run-once guard.
#-------------------------------------------------------------------------------
touch "${GUARD_FILE}"
echo "migrate-prod-data: migration completed — guard set at ${GUARD_FILE}"
exit 0
