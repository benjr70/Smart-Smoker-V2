#!/bin/bash
# Deployment Health Check Script
# Verifies all services are healthy after deployment
# Usage: ./scripts/deployment-health-check.sh [target_host] [retry_count]

set -euo pipefail

# Configuration
TARGET_HOST=${1:-localhost}
RETRY_COUNT=${2:-3}              # User preference: 3 retries
RETRY_DELAY=10                   # 10 seconds between retries

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check service health with retry
check_service() {
    local service=$1
    local url=$2
    local retries=$RETRY_COUNT

    echo -e "${YELLOW}Checking ${service}...${NC}"

    for i in $(seq 1 $retries); do
        # Use -k to allow self-signed/Tailscale certificates for HTTPS
        if curl -f -s -k --max-time 10 "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ ${service} is healthy${NC}"
            return 0
        fi

        if [ $i -lt $retries ]; then
            echo -e "${YELLOW}⏳ Retry $i/$retries for ${service}... (waiting ${RETRY_DELAY}s)${NC}"
            sleep $RETRY_DELAY
        fi
    done

    echo -e "${RED}❌ ${service} failed health check after ${retries} attempts${NC}"
    return 1
}

# Main health check logic
main() {
    echo "=========================================="
    echo "Deployment Health Check"
    echo "Target: ${TARGET_HOST}"
    echo "Retries: ${RETRY_COUNT}"
    echo "Delay: ${RETRY_DELAY}s"
    echo "=========================================="
    echo ""

    # For remote hosts, get the full Tailscale FQDN for HTTPS requests
    # Tailscale Serve requires the full FQDN for TLS SNI matching.
    # Resolution is delegated to scripts/smoke/resolve-host-cli.ts which
    # handles short names, FQDNs, suffix drift, and multi-peer disambiguation.
    if [ "${TARGET_HOST}" != "localhost" ] && [ "${TARGET_HOST}" != "127.0.0.1" ]; then
        echo -e "${YELLOW}Resolving Tailscale FQDN for ${TARGET_HOST}...${NC}"
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        # Invoke the locally-installed tsx binary directly. `node --import tsx/esm`
        # would resolve the `tsx` package from the process CWD, which is not the
        # repo root in CI and therefore fails with ERR_MODULE_NOT_FOUND. The tsx
        # binary is installed by `npm --prefix scripts/smoke ci`.
        TSX_BIN="${SCRIPT_DIR}/smoke/node_modules/.bin/tsx"
        if [ ! -x "${TSX_BIN}" ]; then
            echo -e "${RED}❌ tsx not found at ${TSX_BIN}. Run 'npm --prefix scripts/smoke ci' first.${NC}"
            exit 1
        fi
        if ! TAILSCALE_FQDN=$("${TSX_BIN}" "${SCRIPT_DIR}/smoke/resolve-host-cli.ts" "${TARGET_HOST}" 2>&1); then
            echo -e "${RED}❌ Failed to resolve Tailscale FQDN: ${TAILSCALE_FQDN}${NC}"
            exit 1
        fi
        if [ -z "${TAILSCALE_FQDN}" ]; then
            echo -e "${RED}❌ Tailscale FQDN resolved to empty string${NC}"
            exit 1
        fi
        echo -e "${GREEN}✅ Resolved to: ${TAILSCALE_FQDN}${NC}"
    else
        TAILSCALE_FQDN="${TARGET_HOST}"
    fi

    # Backend + Frontend reachability. On the deploy host itself (localhost),
    # Tailscale Serve/Funnel binds the tailnet IP — not 127.0.0.1 — so probing
    # https://localhost:8443 is refused. Check the container-published ports
    # directly over HTTP instead. For remote targets, verify the public
    # Tailscale HTTPS endpoints (Serve/Funnel on :443 / :8443).
    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        check_service "Backend API" "http://localhost:3001/api/health" || exit 1
        check_service "Frontend" "http://localhost:80" || exit 1
    else
        check_service "Backend API" "https://${TAILSCALE_FQDN}:8443/api/health" || exit 1
        check_service "Frontend" "https://${TAILSCALE_FQDN}" || exit 1
    fi

    # Check Docker container health status (if running locally)
    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        echo -e "${YELLOW}Checking Docker container health...${NC}"

        # Count healthy containers
        HEALTHY_COUNT=$(docker ps --filter health=healthy --format '{{.Names}}' | grep -E 'mongo|backend_cloud|frontend_cloud' | wc -l)

        if [ "$HEALTHY_COUNT" -eq 3 ]; then
            echo -e "${GREEN}✅ All Docker containers are healthy (3/3)${NC}"
        else
            echo -e "${RED}❌ Some containers are not healthy (${HEALTHY_COUNT}/3)${NC}"
            echo "Container status:"
            docker ps -a --filter name=mongo --filter name=backend_cloud --filter name=frontend_cloud
            exit 1
        fi
    else
        echo -e "${YELLOW}Skipping Docker health check (remote host)${NC}"
    fi

    # Disk usage is informational — high disk pressure is operational,
    # not a deploy gate. Container health (above) is the gate. A failed
    # probe (e.g. transient SSH error) must not block the deploy.
    echo -e "${YELLOW}Checking system resources...${NC}"

    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    else
        DISK_USAGE=$(ssh "root@${TARGET_HOST}" "df / | tail -1 | awk '{print \$5}' | sed 's/%//'" 2>/dev/null || true)
    fi

    if [ -z "${DISK_USAGE:-}" ] || ! [[ "${DISK_USAGE}" =~ ^[0-9]+$ ]]; then
        echo -e "${YELLOW}⚠️ Could not read disk usage on ${TARGET_HOST} — skipping (non-fatal)${NC}"
    elif [ "$DISK_USAGE" -gt 90 ]; then
        echo -e "${YELLOW}⚠️ High disk usage: ${DISK_USAGE}% (warning only, deploy not blocked)${NC}"
    else
        echo -e "${GREEN}✅ Disk usage acceptable: ${DISK_USAGE}%${NC}"
    fi

    echo ""
    echo -e "${GREEN}=========================================="
    echo "🎉 All health checks passed"
    echo "==========================================${NC}"
    exit 0
}

# Run main function
main
