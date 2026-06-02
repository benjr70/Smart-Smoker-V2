#!/usr/bin/env bash
# deploy-cloud.sh — parameterized cloud deploy orchestration (deep module)
#
# Encapsulates the full cloud deploy flow, modeled on the proven dev-cloud
# inline logic in .github/workflows/dev-deploy.yml:
#
#   backup → pull → down → up --force-recreate → wait → health-check
#            → auto-rollback to previous version on health-check failure
#
# All remote work runs over `ssh root@<host>` so the deploy host is the single
# system boundary (mockable in tests by PATH-prepending an `ssh` stub).
#
# Usage:
#   scripts/deploy-cloud.sh <host> <deploy_dir> <compose_file> <version> <expose_mode>
#
# Parameters:
#   host         Target host (Tailscale name or IP). SSH'd as root@<host>.
#   deploy_dir   Remote directory containing the compose file + scripts/.
#   compose_file Compose file name (relative to deploy_dir).
#   version      Image version/tag to deploy (exported as VERSION on remote).
#   expose_mode  "serve" → tailscale serve | "funnel" → tailscale funnel.
#
# Environment overrides:
#   DEPLOY_WAIT_SECONDS  Seconds to wait after `up` before health-check (default 60).
#   HEALTH_RETRIES       Retry count passed to deployment-health-check.sh (default 3).
#
# Exit codes:
#   0  deploy succeeded and health-check passed
#   1  invalid arguments, or deploy failed (rollback attempted on health failure)
#   2  rollback itself failed after a health-check failure

set -uo pipefail

#-------------------------------------------------------------------------------
# Argument parsing + validation
#-------------------------------------------------------------------------------
HOST="${1:-}"
DEPLOY_DIR="${2:-}"
COMPOSE_FILE="${3:-}"
VERSION="${4:-}"
EXPOSE_MODE="${5:-}"

DEPLOY_WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-60}"
HEALTH_RETRIES="${HEALTH_RETRIES:-3}"

usage() {
    echo "Usage: $0 <host> <deploy_dir> <compose_file> <version> <expose_mode>" >&2
    echo "  expose_mode: serve | funnel" >&2
}

if [ -z "${HOST}" ] || [ -z "${DEPLOY_DIR}" ] || [ -z "${COMPOSE_FILE}" ] \
    || [ -z "${VERSION}" ] || [ -z "${EXPOSE_MODE}" ]; then
    echo "ERROR: missing required argument(s)" >&2
    usage
    exit 1
fi

case "${EXPOSE_MODE}" in
    serve | funnel) ;;
    *)
        echo "ERROR: expose_mode must be 'serve' or 'funnel' (got: ${EXPOSE_MODE})" >&2
        usage
        exit 1
        ;;
esac

SSH_TARGET="root@${HOST}"

#-------------------------------------------------------------------------------
# Remote command helpers — `ssh` is the single system boundary.
#-------------------------------------------------------------------------------

# Run a raw command on the remote host.
remote() {
    ssh -o PasswordAuthentication=no -o StrictHostKeyChecking=accept-new \
        "${SSH_TARGET}" "$@"
}

# Run a command on the remote host with the working directory set to the
# deploy dir. Keeps the orchestration body free of repeated `cd` boilerplate.
remote_in_dir() {
    remote "cd '${DEPLOY_DIR}' && $1"
}

log() { echo "[deploy-cloud] $*"; }

#-------------------------------------------------------------------------------
# Orchestration
#-------------------------------------------------------------------------------
main() {
    log "=========================================="
    log "Cloud deploy → ${SSH_TARGET}"
    log "Dir: ${DEPLOY_DIR} | Compose: ${COMPOSE_FILE} | Version: ${VERSION} | Expose: ${EXPOSE_MODE}"
    log "=========================================="

    # 1. Pre-deploy backup (remote, operates on the host's docker + data).
    #    Fail-fast: if the backup fails we must NOT tear down the running
    #    deployment — there would be no safe rollback point. Abort before
    #    `compose down`.
    log "Step 1/7: pre-deploy backup"
    if ! remote_in_dir "COMPOSE_FILE='${COMPOSE_FILE}' bash scripts/deployment-backup.sh"; then
        log "❌ Pre-deploy backup failed — aborting before any container change"
        return 1
    fi

    # 2. Pull the requested version.
    #    Fail-fast: a failed pull means the new images are not present; tearing
    #    the stack down now would leave the host without a working deployment.
    #    Abort before `compose down`.
    log "Step 2/7: pull images (version ${VERSION})"
    if ! remote_in_dir "export VERSION='${VERSION}' && docker compose -f '${COMPOSE_FILE}' pull"; then
        log "❌ Image pull failed — aborting before any container change"
        return 1
    fi

    # 3. Stop existing containers (preserve volumes).
    log "Step 3/7: compose down"
    remote_in_dir "docker compose -f '${COMPOSE_FILE}' down || true"

    # 4. Start new containers.
    log "Step 4/7: compose up --force-recreate"
    remote_in_dir "export VERSION='${VERSION}' && docker compose -f '${COMPOSE_FILE}' up -d --force-recreate"

    # 5. Wait for services to initialize.
    log "Step 5/7: wait ${DEPLOY_WAIT_SECONDS}s for services to initialize"
    if [ "${DEPLOY_WAIT_SECONDS}" -gt 0 ]; then
        sleep "${DEPLOY_WAIT_SECONDS}"
    fi

    # 6. Expose the services via Tailscale. `expose_mode` selects the verb:
    #    serve  → tailscale serve  (tailnet-private HTTPS)
    #    funnel → tailscale funnel (publicly reachable HTTPS)
    #    Frontend: port 80 → HTTPS 443. Backend: port 3001 → HTTPS 8443.
    #    Reset is always via `tailscale serve reset` — that clears both serve
    #    and funnel state; `tailscale funnel reset` is not a valid subcommand.
    log "Step 6/7: configure tailscale ${EXPOSE_MODE}"
    remote "tailscale serve reset || true"
    remote "tailscale ${EXPOSE_MODE} --bg 80"
    remote "tailscale ${EXPOSE_MODE} --bg --https=8443 3001"

    # 7. Health-check (remote, against the deployed host). On failure, roll the
    #    deployment back to the previous (last-good) version, then report
    #    failure to the caller.
    log "Step 7/7: health-check"
    if remote_in_dir "bash scripts/deployment-health-check.sh localhost '${HEALTH_RETRIES}'"; then
        log "✅ Cloud deploy complete"
        return 0
    fi

    log "❌ Health-check failed — rolling back to previous version"
    if remote_in_dir "COMPOSE_FILE='${COMPOSE_FILE}' bash scripts/rollback.sh"; then
        log "↩️  Rollback complete — deploy reported as failed"
        return 1
    fi

    log "🛑 Rollback FAILED — manual intervention required"
    return 2
}

main "$@"
