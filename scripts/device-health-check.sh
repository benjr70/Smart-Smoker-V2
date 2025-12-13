#!/bin/bash
# Device Health Check Script
# Verifies all services are healthy on virtual smoker device
# Phase 3 Story 2/3 - Virtual Smoker Device Infrastructure & Deployment
#
# Usage: ./scripts/device-health-check.sh [target_host] [retry_count]
# Examples:
#   ./scripts/device-health-check.sh                    # Check localhost
#   ./scripts/device-health-check.sh virtual-smoker     # Check via Tailscale
#   ./scripts/device-health-check.sh 10.20.0.40 5       # Check IP with 5 retries
#
# Environment Variables:
#   SSH_USER - SSH user for remote connections (default: smoker)
#   CLOUD_BACKEND_URL - Cloud backend URL for connectivity test
#                       (default: https://smoker-dev-cloud.tail74646.ts.net:8443)

set -euo pipefail

# Configuration
TARGET_HOST=${1:-localhost}
RETRY_COUNT=${2:-3}
RETRY_DELAY=10

# Device service ports (match virtual-smoker.docker-compose.yml)
DEVICE_SERVICE_PORT=3003
FRONTEND_PORT=8080

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Function to check Docker container status
check_containers() {
    local host=$1
    local expected_containers=("device_service" "frontend_smoker" "watchtower")
    local healthy_count=0
    local total=${#expected_containers[@]}

    echo -e "${YELLOW}Checking Docker container status...${NC}"

    for container in "${expected_containers[@]}"; do
        local status
        if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
            status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        else
            status=$(ssh "${SSH_USER}@${host}" "docker inspect --format='{{.State.Status}}' '$container'" 2>/dev/null || echo "not_found")
        fi

        if [ "$status" = "running" ]; then
            echo -e "${GREEN}  ✅ ${container}: running${NC}"
            ((healthy_count++)) || true
        else
            echo -e "${RED}  ❌ ${container}: ${status}${NC}"
        fi
    done

    if [ "$healthy_count" -eq "$total" ]; then
        echo -e "${GREEN}✅ All containers running (${healthy_count}/${total})${NC}"
        return 0
    else
        echo -e "${RED}❌ Some containers not running (${healthy_count}/${total})${NC}"
        return 1
    fi
}

# Function to check system resources
check_resources() {
    local host=$1

    echo -e "${YELLOW}Checking system resources...${NC}"

    # Get resource info
    if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
        local memory_info=$(free -h | grep Mem)
        local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
        local swap_info=$(swapon --show --noheadings 2>/dev/null || echo "none")
        local cpu_count=$(nproc)
    else
        local memory_info=$(ssh "${SSH_USER}@${host}" "free -h | grep Mem")
        local disk_usage=$(ssh "${SSH_USER}@${host}" "df / | tail -1 | awk '{print \$5}' | sed 's/%//'")
        local swap_info=$(ssh "${SSH_USER}@${host}" "swapon --show --noheadings 2>/dev/null || echo 'none'")
        local cpu_count=$(ssh "${SSH_USER}@${host}" "nproc")
    fi

    # Check disk usage
    if [ "$disk_usage" -gt 90 ]; then
        echo -e "${RED}  ⚠️  Disk usage: ${disk_usage}% (HIGH)${NC}"
    else
        echo -e "${GREEN}  ✅ Disk usage: ${disk_usage}%${NC}"
    fi

    # Display CPU info
    echo -e "${GREEN}  ✅ CPU cores: ${cpu_count}${NC}"

    # Display memory info
    echo -e "${BLUE}  ℹ️  Memory: ${memory_info}${NC}"

    # Check swap
    if [ "$swap_info" != "none" ] && [ -n "$swap_info" ]; then
        echo -e "${GREEN}  ✅ Swap configured${NC}"
    else
        echo -e "${YELLOW}  ⚠️  No swap configured${NC}"
    fi

    return 0
}

# Function to check Tailscale connectivity
check_tailscale() {
    local host=$1

    echo -e "${YELLOW}Checking Tailscale status...${NC}"

    local tailscale_status
    if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
        tailscale_status=$(tailscale status --self --json 2>/dev/null || echo "not_running")
    else
        tailscale_status=$(ssh "${SSH_USER}@${host}" "tailscale status --self --json" 2>/dev/null || echo "not_running")
    fi

    if [ "$tailscale_status" != "not_running" ]; then
        local hostname
        if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
            hostname=$(echo "$tailscale_status" | jq -r '.Self.HostName // "unknown"')
        else
            hostname=$(echo "$tailscale_status" | jq -r '.Self.HostName // "unknown"')
        fi
        echo -e "${GREEN}✅ Tailscale connected (hostname: ${hostname})${NC}"
        return 0
    else
        echo -e "${RED}❌ Tailscale not running or not connected${NC}"
        return 1
    fi
}

# Function to check cloud backend connectivity
# This verifies the device can communicate with the cloud backend
check_cloud_connectivity() {
    local host=$1
    
    # Cloud backend URL - can be overridden via environment variable
    local cloud_backend_url=${CLOUD_BACKEND_URL:-"https://smoker-dev-cloud.tail74646.ts.net:8443"}
    
    echo -e "${YELLOW}Checking cloud backend connectivity...${NC}"
    echo -e "${BLUE}  Target: ${cloud_backend_url}/api/health${NC}"

    local result
    if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
        # Local check - test directly
        result=$(curl -f -s -k --max-time 10 "${cloud_backend_url}/api/health" 2>&1 || echo "failed")
    else
        # Remote check - run curl from the device
        result=$(ssh "${SSH_USER}@${host}" "curl -f -s -k --max-time 10 '${cloud_backend_url}/api/health'" 2>&1 || echo "failed")
    fi

    if [ "$result" != "failed" ] && [ -n "$result" ]; then
        echo -e "${GREEN}✅ Cloud backend reachable${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Cloud backend not reachable (non-critical)${NC}"
        echo -e "${YELLOW}   Device can operate offline, will sync when cloud is available${NC}"
        # Return 0 (success) because cloud connectivity is not strictly required
        # The device can operate offline and sync when connectivity is restored
        return 0
    fi
}

# Main health check logic
main() {
    echo "=========================================="
    echo -e "${BLUE}Virtual Smoker Device Health Check${NC}"
    echo "=========================================="
    echo "Target: ${TARGET_HOST}"
    echo "Retries: ${RETRY_COUNT}"
    echo "Delay: ${RETRY_DELAY}s"
    echo "=========================================="
    echo ""

    # Determine SSH user for remote connections
    SSH_USER=${SSH_USER:-smoker}

    local failed=0

    # Determine target URL base
    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        URL_BASE="http://localhost"
    else
        URL_BASE="http://${TARGET_HOST}"
    fi

    # Check Device Service
    if ! check_service "Device Service" "${URL_BASE}:${DEVICE_SERVICE_PORT}/health"; then
        ((failed++)) || true
    fi
    echo ""

    # Check Smoker Frontend
    if ! check_service "Smoker Frontend" "${URL_BASE}:${FRONTEND_PORT}"; then
        ((failed++)) || true
    fi
    echo ""

    # Check Docker containers
    if ! check_containers "${TARGET_HOST}"; then
        ((failed++)) || true
    fi
    echo ""

    # Check Tailscale
    if ! check_tailscale "${TARGET_HOST}"; then
        ((failed++)) || true
    fi
    echo ""

    # Check cloud backend connectivity
    # This is a non-critical check - device can operate offline
    check_cloud_connectivity "${TARGET_HOST}"
    echo ""

    # Check system resources
    check_resources "${TARGET_HOST}"
    echo ""

    # Final result
    echo "=========================================="
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}🎉 All health checks passed${NC}"
        echo "=========================================="
        exit 0
    else
        echo -e "${RED}💥 ${failed} health check(s) failed${NC}"
        echo "=========================================="
        exit 1
    fi
}

# Run main function
main
