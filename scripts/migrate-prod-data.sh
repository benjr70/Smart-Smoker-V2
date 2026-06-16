#!/usr/bin/env bash
# migrate-prod-data.sh — one-time guarded MongoDB data migration (deep module)
#
# Dumps from the OLD prod mongo and restores into the NEW prod mongo. The dump is
# streamed directly into the restore (mongodump --archive | mongorestore
# --archive) so no intermediate dump file ever touches disk on the operator's
# machine.
#
# Real-env shape (learned during the #225 cutover — see
# docs/Infrastructure/guides/prod-cutover.md and #257):
#   - mongo runs INSIDE a container on each box, so the tools are invoked via
#     `docker exec <container> mongodump|mongorestore`, NOT on the host.
#   - the app DB NAME CHANGED between versions (old `test` → new `smartsmoker`),
#     so the restore cross-renames namespaces (--nsFrom/--nsTo).
#   - the NEW box mongo requires AUTH; credentials are sourced from an env file
#     ON the new box (never hardcoded, never passed on the command line from
#     here). The OLD box mongo is assumed auth-less (legacy 4.4).
#
# A run-once guard (sentinel file beside this script) prevents accidental
# re-execution: once a migration has completed, subsequent invocations are
# no-ops. This makes the script safe to wire into an automated cutover step
# that might be retried.
#
# All remote work runs over `ssh <user>@<host>`, so SSH is the single system
# boundary (mockable in tests by PATH-prepending an `ssh` stub).
#
# Usage:
#   scripts/migrate-prod-data.sh <old-host> <new-host> [options]
#
# Options:
#   --src-db NAME          Source database (default: test)
#   --dst-db NAME          Target database (default: smartsmoker)
#   --old-user USER        SSH user for old host (default: root)
#   --new-user USER        SSH user for new host (default: root)
#   --old-container NAME   Mongo container name on old host (default: mongo)
#   --new-container NAME   Mongo container name on new host (default: mongo)
#   --new-env-file PATH    Env file on new host holding the mongo password
#                          (default: /opt/smart-smoker-prod/.env)
#   --new-mongo-user USER  Target auth user (default: admin)
#   --new-pass-var NAME    Env var (in --new-env-file) holding the target
#                          password (default: MONGO_ROOT_PASSWORD)
#
# Example (the actual #225 cutover):
#   scripts/migrate-prod-data.sh smokecloud-legacy smokecloud \
#     --old-user ubuntu --src-db test --dst-db smartsmoker
#
# Exit codes:
#   0  migration completed (or already run — guard active)
#   1  invalid arguments or migration failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD_FILE="${SCRIPT_DIR}/.migrate-prod-data.done"

usage() {
    echo "Usage: $(basename "$0") <old-host> <new-host> [options]" >&2
    echo "  --src-db --dst-db --old-user --new-user --old-container" >&2
    echo "  --new-container --new-env-file --new-mongo-user --new-pass-var" >&2
}

#-------------------------------------------------------------------------------
# Argument parsing + validation
#-------------------------------------------------------------------------------
OLD_HOST="${1:-}"
NEW_HOST="${2:-}"

SRC_DB="test"
DST_DB="smartsmoker"
OLD_USER="root"
NEW_USER="root"
OLD_CONTAINER="mongo"
NEW_CONTAINER="mongo"
NEW_ENV_FILE="/opt/smart-smoker-prod/.env"
NEW_MONGO_USER="admin"
NEW_PASS_VAR="MONGO_ROOT_PASSWORD"

if [ -z "${OLD_HOST}" ] || [ -z "${NEW_HOST}" ]; then
    echo "migrate-prod-data: missing required <old-host> and/or <new-host>" >&2
    usage
    exit 1
fi

shift 2 || true

# Generic "flag requires a value" reader.
require_val() {
    if [ -z "${2:-}" ]; then
        echo "migrate-prod-data: $1 requires a value" >&2
        usage
        exit 1
    fi
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --src-db)         require_val "$1" "${2:-}"; SRC_DB="$2"; shift 2 ;;
        --dst-db)         require_val "$1" "${2:-}"; DST_DB="$2"; shift 2 ;;
        --old-user)       require_val "$1" "${2:-}"; OLD_USER="$2"; shift 2 ;;
        --new-user)       require_val "$1" "${2:-}"; NEW_USER="$2"; shift 2 ;;
        --old-container)  require_val "$1" "${2:-}"; OLD_CONTAINER="$2"; shift 2 ;;
        --new-container)  require_val "$1" "${2:-}"; NEW_CONTAINER="$2"; shift 2 ;;
        --new-env-file)   require_val "$1" "${2:-}"; NEW_ENV_FILE="$2"; shift 2 ;;
        --new-mongo-user) require_val "$1" "${2:-}"; NEW_MONGO_USER="$2"; shift 2 ;;
        --new-pass-var)   require_val "$1" "${2:-}"; NEW_PASS_VAR="$2"; shift 2 ;;
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
# Build the remote commands.
#
# Source: legacy mongo (auth-less) — plain `docker exec ... mongodump`.
# Target: new mongo (auth) — source the password from the box env file inside
#   the ssh session (so it is never visible to this process or its args), then
#   `docker exec -i ... mongorestore` with auth, --drop, and namespace rename.
#
# The `\$${NEW_PASS_VAR}` keeps the password expansion on the REMOTE side, after
# the env file is sourced — nothing sensitive is interpolated locally.
#-------------------------------------------------------------------------------
DUMP_CMD="docker exec ${OLD_CONTAINER} mongodump --db '${SRC_DB}' --archive --gzip"

RESTORE_CMD="set -a; . '${NEW_ENV_FILE}'; set +a; \
docker exec -i ${NEW_CONTAINER} mongorestore \
--username '${NEW_MONGO_USER}' --password \"\$${NEW_PASS_VAR}\" \
--authenticationDatabase admin \
--archive --gzip --drop \
--nsFrom '${SRC_DB}.*' --nsTo '${DST_DB}.*'"

echo "migrate-prod-data: migrating '${SRC_DB}' on ${OLD_USER}@${OLD_HOST}" \
     "-> '${DST_DB}' on ${NEW_USER}@${NEW_HOST}"

ssh "${OLD_USER}@${OLD_HOST}" "${DUMP_CMD}" \
    | ssh "${NEW_USER}@${NEW_HOST}" "${RESTORE_CMD}"

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
