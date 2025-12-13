#!/bin/bash
# Virtual Smoker Infrastructure Validation Script
# Phase 3 Story 2 - Validates that the virtual smoker device matches requirements
#
# This script runs the complete validation checklist from the Story 2 specification:
#   - Memory: ~1GB RAM configured
#   - CPU: 4 cores
#   - Docker: Version 24.x
#   - Tailscale: Hostname 'virtual-smoker'
#   - Swap: ~100MB configured
#   - SSH access from GitHub runner
#
# Usage: ./scripts/validate-virtual-smoker.sh [target_host]
# Examples:
#   ./scripts/validate-virtual-smoker.sh                     # Validate localhost
#   ./scripts/validate-virtual-smoker.sh virtual-smoker      # Validate via Tailscale
#   ./scripts/validate-virtual-smoker.sh 10.20.0.40          # Validate via IP

set -euo pipefail

# Configuration
TARGET_HOST=${1:-localhost}
SSH_USER=${SSH_USER:-smoker}

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to run command locally or remotely
run_cmd() {
    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        eval "$1"
    else
        ssh "${SSH_USER}@${TARGET_HOST}" "$1"
    fi
}

# Function to check and report result
check() {
    local name=$1
    local expected=$2
    local actual=$3
    local strict=${4:-true}

    if [ "$actual" = "$expected" ]; then
        echo -e "${GREEN}✅ PASS: ${name}${NC}"
        echo -e "   Expected: ${expected}"
        echo -e "   Actual:   ${actual}"
        ((PASSED++)) || true
        return 0
    elif [ "$strict" = "false" ]; then
        echo -e "${YELLOW}⚠️  WARN: ${name}${NC}"
        echo -e "   Expected: ${expected}"
        echo -e "   Actual:   ${actual}"
        ((WARNINGS++)) || true
        return 0
    else
        echo -e "${RED}❌ FAIL: ${name}${NC}"
        echo -e "   Expected: ${expected}"
        echo -e "   Actual:   ${actual}"
        ((FAILED++)) || true
        return 1
    fi
}

# Function to check value in range
check_range() {
    local name=$1
    local min=$2
    local max=$3
    local actual=$4

    if [ "$actual" -ge "$min" ] && [ "$actual" -le "$max" ]; then
        echo -e "${GREEN}✅ PASS: ${name}${NC}"
        echo -e "   Range: ${min} - ${max}"
        echo -e "   Actual: ${actual}"
        ((PASSED++)) || true
        return 0
    else
        echo -e "${RED}❌ FAIL: ${name}${NC}"
        echo -e "   Range: ${min} - ${max}"
        echo -e "   Actual: ${actual}"
        ((FAILED++)) || true
        return 1
    fi
}

main() {
    echo "========================================================"
    echo -e "${BLUE}Virtual Smoker Infrastructure Validation${NC}"
    echo "========================================================"
    echo "Target: ${TARGET_HOST}"
    echo "SSH User: ${SSH_USER}"
    echo "Date: $(date)"
    echo "========================================================"
    echo ""

    # Test 1: SSH Connectivity
    echo -e "${YELLOW}[1/8] Testing SSH Connectivity...${NC}"
    if [ "${TARGET_HOST}" = "localhost" ] || [ "${TARGET_HOST}" = "127.0.0.1" ]; then
        echo -e "${GREEN}✅ PASS: Local execution (no SSH needed)${NC}"
        ((PASSED++)) || true
    else
        if ssh -o ConnectTimeout=10 -o BatchMode=yes "${SSH_USER}@${TARGET_HOST}" "echo 'SSH OK'" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ PASS: SSH connectivity${NC}"
            echo -e "   Host: ${TARGET_HOST}"
            echo -e "   User: ${SSH_USER}"
            ((PASSED++)) || true
        else
            echo -e "${RED}❌ FAIL: SSH connectivity${NC}"
            echo -e "   Cannot connect to ${SSH_USER}@${TARGET_HOST}"
            ((FAILED++)) || true
            echo ""
            echo "Cannot proceed without SSH connectivity. Exiting."
            exit 1
        fi
    fi
    echo ""

    # Test 2: CPU Cores (expected: 4)
    echo -e "${YELLOW}[2/8] Checking CPU Cores...${NC}"
    CPU_CORES=$(run_cmd "nproc" 2>/dev/null || echo "0")
    check "CPU cores" "4" "$CPU_CORES" || true
    echo ""

    # Test 3: Memory (expected: ~1GB, allow 900MB - 1200MB)
    echo -e "${YELLOW}[3/8] Checking Memory...${NC}"
    MEMORY_MB=$(run_cmd "free -m | grep Mem | awk '{print \$2}'" 2>/dev/null || echo "0")
    check_range "Memory (MB)" 900 1200 "$MEMORY_MB" || true
    echo ""

    # Test 4: Swap Configuration (expected: ~100MB, allow 80-150MB)
    echo -e "${YELLOW}[4/8] Checking Swap Configuration...${NC}"
    SWAP_MB=$(run_cmd "free -m | grep Swap | awk '{print \$2}'" 2>/dev/null || echo "0")
    if [ "$SWAP_MB" -gt 0 ]; then
        check_range "Swap (MB)" 80 150 "$SWAP_MB" || true
    else
        echo -e "${RED}❌ FAIL: Swap not configured${NC}"
        echo -e "   Expected: ~100MB"
        echo -e "   Actual: Not configured"
        ((FAILED++)) || true
    fi
    echo ""

    # Test 5: Docker Version (expected: 24.x)
    echo -e "${YELLOW}[5/8] Checking Docker Version...${NC}"
    DOCKER_VERSION=$(run_cmd "docker --version 2>/dev/null | grep -oP 'Docker version \K[0-9]+\.[0-9]+' || echo 'not installed'" 2>/dev/null || echo "not installed")
    if [[ "$DOCKER_VERSION" == 24.* ]]; then
        echo -e "${GREEN}✅ PASS: Docker version${NC}"
        echo -e "   Expected: 24.x"
        echo -e "   Actual: ${DOCKER_VERSION}"
        ((PASSED++)) || true
    elif [ "$DOCKER_VERSION" = "not installed" ]; then
        echo -e "${RED}❌ FAIL: Docker version${NC}"
        echo -e "   Docker is not installed"
        ((FAILED++)) || true
    else
        echo -e "${YELLOW}⚠️  WARN: Docker version${NC}"
        echo -e "   Expected: 24.x"
        echo -e "   Actual: ${DOCKER_VERSION}"
        ((WARNINGS++)) || true
    fi
    echo ""

    # Test 6: Tailscale Status
    echo -e "${YELLOW}[6/8] Checking Tailscale Status...${NC}"
    TAILSCALE_STATUS=$(run_cmd "tailscale status --self --json 2>/dev/null | jq -r '.Self.Online // false'" 2>/dev/null || echo "false")
    TAILSCALE_HOSTNAME=$(run_cmd "tailscale status --self --json 2>/dev/null | jq -r '.Self.HostName // \"unknown\"'" 2>/dev/null || echo "unknown")
    
    if [ "$TAILSCALE_STATUS" = "true" ]; then
        echo -e "${GREEN}✅ PASS: Tailscale connected${NC}"
        ((PASSED++)) || true
    else
        echo -e "${RED}❌ FAIL: Tailscale not connected${NC}"
        ((FAILED++)) || true
    fi
    
    # Check hostname matches expected
    if [ "$TAILSCALE_HOSTNAME" = "virtual-smoker" ]; then
        echo -e "${GREEN}✅ PASS: Tailscale hostname${NC}"
        echo -e "   Expected: virtual-smoker"
        echo -e "   Actual: ${TAILSCALE_HOSTNAME}"
        ((PASSED++)) || true
    else
        echo -e "${YELLOW}⚠️  WARN: Tailscale hostname${NC}"
        echo -e "   Expected: virtual-smoker"
        echo -e "   Actual: ${TAILSCALE_HOSTNAME}"
        ((WARNINGS++)) || true
    fi
    echo ""

    # Test 7: Directory Structure
    echo -e "${YELLOW}[7/8] Checking Directory Structure...${NC}"
    DIRS_OK=true
    for dir in "/opt/smoker-device" "/opt/smoker-device/logs" "/opt/smoker-device/config" "/opt/smoker-device/compose"; do
        if run_cmd "test -d $dir" 2>/dev/null; then
            echo -e "${GREEN}  ✅ ${dir}${NC}"
        else
            echo -e "${RED}  ❌ ${dir} (missing)${NC}"
            DIRS_OK=false
        fi
    done
    if [ "$DIRS_OK" = "true" ]; then
        ((PASSED++)) || true
    else
        ((FAILED++)) || true
    fi
    echo ""

    # Test 8: Docker Compose availability
    echo -e "${YELLOW}[8/8] Checking Docker Compose...${NC}"
    COMPOSE_VERSION=$(run_cmd "docker compose version 2>/dev/null | grep -oP 'v[0-9]+\.[0-9]+' || echo 'not installed'" 2>/dev/null || echo "not installed")
    if [ "$COMPOSE_VERSION" != "not installed" ]; then
        echo -e "${GREEN}✅ PASS: Docker Compose available${NC}"
        echo -e "   Version: ${COMPOSE_VERSION}"
        ((PASSED++)) || true
    else
        echo -e "${RED}❌ FAIL: Docker Compose not available${NC}"
        ((FAILED++)) || true
    fi
    echo ""

    # Summary
    echo "========================================================"
    echo -e "${BLUE}Validation Summary${NC}"
    echo "========================================================"
    echo -e "${GREEN}Passed:   ${PASSED}${NC}"
    echo -e "${YELLOW}Warnings: ${WARNINGS}${NC}"
    echo -e "${RED}Failed:   ${FAILED}${NC}"
    echo "========================================================"

    if [ $FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}🎉 Virtual smoker infrastructure validation PASSED${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Deploy containers: docker compose -f virtual-smoker.docker-compose.yml up -d"
        echo "  2. Run health check: ./scripts/device-health-check.sh ${TARGET_HOST}"
        echo ""
        exit 0
    else
        echo ""
        echo -e "${RED}💥 Virtual smoker infrastructure validation FAILED${NC}"
        echo ""
        echo "Please address the failed checks before proceeding with deployment."
        echo ""
        exit 1
    fi
}

# Run main function
main
