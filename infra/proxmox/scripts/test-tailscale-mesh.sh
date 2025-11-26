#!/bin/bash
# Comprehensive Tailscale Mesh Network Testing Script
# Tests connectivity, service exposure, and funnel configuration

set -e

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
HOSTS=(
  "smoker-runner"
  "smoker-dev-cloud"
  "smokecloud"
  "virtual-smoker"
)

PROD_FUNNEL_URL="https://smokecloud.tail74646.ts.net"
PROD_FUNNEL_WS_URL="https://smokecloud.tail74646.ts.net:8443"

# Helper functions
print_header() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

# Check if Tailscale is installed
check_tailscale_installed() {
  print_header "Checking Tailscale Installation"

  if ! command -v tailscale &> /dev/null; then
    print_error "Tailscale is not installed on this machine"
    print_info "Install with: curl -fsSL https://tailscale.com/install.sh | sh"
    exit 1
  fi

  print_success "Tailscale is installed"
  tailscale version
}

# Check if connected to Tailscale
check_tailscale_connection() {
  print_header "Checking Tailscale Connection"

  if ! tailscale status &> /dev/null; then
    print_error "Not connected to Tailscale network"
    print_info "Connect with: sudo tailscale up"
    exit 1
  fi

  print_success "Connected to Tailscale network"

  # Get current node info
  MY_IP=$(tailscale ip -4)
  MY_HOSTNAME=$(tailscale status --json | jq -r '.Self.DNSName' | cut -d. -f1)

  print_info "This node: ${MY_HOSTNAME}"
  print_info "Tailscale IP: ${MY_IP}"
}

# List all nodes in the network
list_tailscale_nodes() {
  print_header "Tailscale Network Nodes"

  print_info "All nodes in the Tailscale network:"
  tailscale status
}

# Test connectivity to each host
test_connectivity() {
  print_header "Testing Mesh Connectivity"

  local failed=0

  for host in "${HOSTS[@]}"; do
    print_info "Testing connectivity to ${host}..."

    if ping -c 3 -W 2 "${host}" &> /dev/null; then
      print_success "Can reach ${host}"
    else
      print_error "Cannot reach ${host}"
      failed=$((failed + 1))
    fi
  done

  if [ $failed -eq 0 ]; then
    print_success "All connectivity tests passed"
  else
    print_warning "${failed} connectivity test(s) failed"
  fi

  return $failed
}

# Test SSH connectivity
test_ssh_connectivity() {
  print_header "Testing SSH Connectivity (Optional)"

  print_info "Testing SSH to GitHub runner..."
  if timeout 5 ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no root@smoker-runner "echo 'SSH OK'" &> /dev/null; then
    print_success "SSH to smoker-runner works"
  else
    print_warning "SSH to smoker-runner failed (may require key setup)"
  fi
}

# Test Tailscale Serve on dev cloud
test_dev_serve() {
  print_header "Testing Tailscale Serve (Dev Cloud)"

  print_info "Checking if dev cloud serve is accessible on tailnet..."

  # Test HTTP endpoint
  if curl -s -m 5 "http://smoker-dev-cloud" &> /dev/null; then
    print_success "Dev cloud HTTP (port 80) is accessible via Tailscale Serve"
  else
    print_warning "Dev cloud HTTP not responding (may not be deployed yet)"
  fi

  # Test WebSocket endpoint
  if curl -s -m 5 "http://smoker-dev-cloud:3001" &> /dev/null; then
    print_success "Dev cloud WebSocket (port 3001) is accessible via Tailscale Serve"
  else
    print_warning "Dev cloud WebSocket not responding (may not be deployed yet)"
  fi
}

# Test Tailscale Funnel on production
test_prod_funnel() {
  print_header "Testing Tailscale Funnel (Production)"

  print_info "Checking production funnel configuration..."

  # SSH to production and check funnel status
  if timeout 10 ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no root@smokecloud "tailscale funnel status" &> /dev/null; then
    print_success "Production funnel is configured"
  else
    print_warning "Cannot check funnel status (SSH may not be configured)"
  fi

  print_info "Testing public HTTPS access..."

  # Test main HTTPS endpoint (port 443)
  if curl -s -m 10 "${PROD_FUNNEL_URL}" &> /dev/null; then
    print_success "Production HTTPS (port 443) is publicly accessible"
  else
    print_warning "Production HTTPS not responding (may not be deployed yet)"
  fi

  # Test WebSocket endpoint (port 8443)
  if curl -s -m 10 "${PROD_FUNNEL_WS_URL}" &> /dev/null; then
    print_success "Production WebSocket (port 8443) is publicly accessible"
  else
    print_warning "Production WebSocket not responding (may not be deployed yet)"
  fi

  print_info "Public URLs:"
  print_info "  Main: ${PROD_FUNNEL_URL}"
  print_info "  WebSocket: ${PROD_FUNNEL_WS_URL}"
}

# Test virtual device connectivity
test_virtual_device() {
  print_header "Testing Virtual Smoker Device"

  print_info "Checking virtual device connectivity..."

  if ping -c 3 -W 2 "virtual-smoker" &> /dev/null; then
    print_success "Virtual smoker device is reachable"

    # Try to check if device service is running
    if curl -s -m 5 "http://virtual-smoker:3002" &> /dev/null; then
      print_success "Device service appears to be running"
    else
      print_warning "Device service not responding (may not be started)"
    fi
  else
    print_warning "Virtual smoker device not reachable"
  fi
}

# Check firewall rules
check_firewall_rules() {
  print_header "Checking Firewall Rules (on accessible hosts)"

  for host in "smoker-runner" "smoker-dev-cloud" "smokecloud"; do
    print_info "Checking UFW on ${host}..."

    if timeout 5 ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no "root@${host}" "ufw status | grep -E '(tailscale0|41641)'" &> /dev/null; then
      print_success "UFW on ${host} allows Tailscale"
    else
      print_warning "Cannot verify UFW on ${host} (SSH may not be configured)"
    fi
  done
}

# Network latency test
test_latency() {
  print_header "Network Latency Tests"

  for host in "${HOSTS[@]}"; do
    print_info "Measuring latency to ${host}..."

    if ping -c 10 -W 2 "${host}" &> /dev/null; then
      avg_latency=$(ping -c 10 -W 2 "${host}" 2>/dev/null | tail -1 | awk -F '/' '{print $5}')
      print_success "${host}: ${avg_latency}ms average latency"
    else
      print_warning "${host}: not reachable"
    fi
  done
}

# Generate summary report
generate_summary() {
  print_header "Test Summary"

  echo -e "${GREEN}Tailscale mesh network test completed!${NC}\n"

  print_info "Network topology:"
  print_info "  ├─ smoker-runner (GitHub Actions runner)"
  print_info "  ├─ smoker-dev-cloud (Development environment)"
  print_info "  ├─ smokecloud (Production environment with Funnel)"
  print_info "  └─ virtual-smoker (Virtual device)"

  echo ""
  print_info "Public access:"
  print_info "  Production: ${PROD_FUNNEL_URL}"
  print_info "  WebSocket:  ${PROD_FUNNEL_WS_URL}"

  echo ""
  print_info "Internal access (Tailscale network only):"
  print_info "  Dev HTTP:   http://smoker-dev-cloud"
  print_info "  Dev WS:     http://smoker-dev-cloud:3001"
  print_info "  Device:     http://virtual-smoker:3002"

  echo ""
  print_success "All critical tests passed!"
  print_warning "Some services may show warnings if not yet deployed"
}

# Main execution
main() {
  echo -e "${BLUE}"
  echo "╔════════════════════════════════════════════════╗"
  echo "║   Tailscale Mesh Network Test Suite           ║"
  echo "║   Smart Smoker V2 Infrastructure              ║"
  echo "╚════════════════════════════════════════════════╝"
  echo -e "${NC}"

  check_tailscale_installed
  check_tailscale_connection
  list_tailscale_nodes
  test_connectivity
  test_ssh_connectivity
  test_dev_serve
  test_prod_funnel
  test_virtual_device
  check_firewall_rules
  test_latency
  generate_summary

  echo ""
  print_success "Test suite complete!"
  echo ""
}

# Run main function
main "$@"
