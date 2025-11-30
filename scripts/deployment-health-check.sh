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
        if curl -f -s --max-time 10 "$url" > /dev/null 2>&1; then
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

    # Check Backend API
    check_service "Backend API" "http://${TARGET_HOST}:8443/api/health" || exit 1

    # Check Frontend
    check_service "Frontend" "http://${TARGET_HOST}:80" || exit 1

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

    # Check system resources
    echo -e "${YELLOW}Checking system resources...${NC}"

    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    else
        DISK_USAGE=$(ssh "root@${TARGET_HOST}" "df / | tail -1 | awk '{print \$5}' | sed 's/%//'")
    fi

    if [ "$DISK_USAGE" -gt 90 ]; then
        echo -e "${RED}⚠️ High disk usage: ${DISK_USAGE}%${NC}"
        exit 1
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
