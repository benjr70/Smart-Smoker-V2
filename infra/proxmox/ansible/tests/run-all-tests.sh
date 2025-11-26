#!/bin/bash
# Master Test Runner for Tailscale QA Testing
# Runs all automated tests and generates final report

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
ANSIBLE_DIR="$(cd "$TEST_DIR/.." && pwd)"

print_header() {
  echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"
}

print_section() {
  echo -e "\n${YELLOW}▶ $1${NC}\n"
}

print_pass() {
  echo -e "${GREEN}✓ PASS:${NC} $1"
}

print_fail() {
  echo -e "${RED}✗ FAIL:${NC} $1"
  ((TOTAL_FAILURES++))
}

TOTAL_TESTS=0
TOTAL_FAILURES=0

cd "$ANSIBLE_DIR"

print_header "Tailscale Mesh Network - Comprehensive QA Test Suite"
echo -e "${CYAN}Test Date:${NC} $(date)"
echo -e "${CYAN}Test Directory:${NC} $ANSIBLE_DIR"
echo ""

# Test Suite 1: Ansible Syntax and Structure
print_section "Test Suite 1: Ansible Syntax and Structure"

echo "1.1 Testing playbook syntax..."
for playbook in playbooks/setup-github-runner.yml playbooks/setup-dev-cloud.yml playbooks/setup-prod-cloud.yml playbooks/setup-virtual-smoker.yml playbooks/verify-tailscale.yml; do
  if ansible-playbook --syntax-check "$playbook" > /dev/null 2>&1; then
    print_pass "$playbook syntax valid"
    ((TOTAL_TESTS++))
  else
    print_fail "$playbook syntax check failed"
    ((TOTAL_TESTS++))
  fi
done

echo -e "\n1.2 Testing YAML file validity..."
for yml in roles/tailscale/defaults/main.yml roles/tailscale/tasks/main.yml roles/tailscale/tasks/serve.yml roles/tailscale/tasks/funnel.yml roles/tailscale/handlers/main.yml roles/tailscale/meta/main.yml; do
  if python3 -c "import yaml; yaml.safe_load(open('$yml'))" 2>/dev/null; then
    print_pass "$yml is valid YAML"
    ((TOTAL_TESTS++))
  else
    print_fail "$yml YAML syntax error"
    ((TOTAL_TESTS++))
  fi
done

echo -e "\n1.3 Testing role directory structure..."
for file in roles/tailscale/defaults/main.yml roles/tailscale/tasks/main.yml roles/tailscale/tasks/serve.yml roles/tailscale/tasks/funnel.yml roles/tailscale/handlers/main.yml roles/tailscale/meta/main.yml roles/tailscale/templates/tailscale-funnel.sh.j2; do
  if [ -f "$file" ]; then
    print_pass "$file exists"
    ((TOTAL_TESTS++))
  else
    print_fail "$file missing"
    ((TOTAL_TESTS++))
  fi
done

# Test Suite 2: Security Audit
print_section "Test Suite 2: Security Audit"

echo "2.1 Running comprehensive security audit..."
if bash tests/security-audit.sh > /tmp/security-audit.log 2>&1; then
  print_pass "Security audit passed"
  ((TOTAL_TESTS++))
  # Show key security metrics
  echo -e "\n${CYAN}Security Highlights:${NC}"
  grep "✓ PASS" /tmp/security-audit.log | head -5
else
  print_fail "Security audit failed - see /tmp/security-audit.log"
  ((TOTAL_TESTS++))
  grep "✗ FAIL" /tmp/security-audit.log || true
fi

# Test Suite 3: Environment Configuration
print_section "Test Suite 3: Environment Configuration Validation"

echo "3.1 Testing GitHub Runner configuration..."
if grep -q "tailscale_hostname: \"smoker-runner\"" inventory/host_vars/github-runner.yml && \
   grep -q "tag:runner" inventory/host_vars/github-runner.yml; then
  print_pass "GitHub Runner Tailscale config correct"
  ((TOTAL_TESTS++))
else
  print_fail "GitHub Runner Tailscale config incorrect"
  ((TOTAL_TESTS++))
fi

echo "3.2 Testing Dev Cloud configuration..."
if grep -q "tailscale_hostname: \"smoker-dev-cloud\"" inventory/host_vars/smart-smoker-dev-cloud.yml && \
   grep -q "tailscale_serve_enabled: true" inventory/host_vars/smart-smoker-dev-cloud.yml; then
  print_pass "Dev Cloud has Tailscale Serve enabled"
  ((TOTAL_TESTS++))
else
  print_fail "Dev Cloud Tailscale Serve config incorrect"
  ((TOTAL_TESTS++))
fi

if grep -q "port: 80" inventory/host_vars/smart-smoker-dev-cloud.yml && \
   grep -q "port: 3001" inventory/host_vars/smart-smoker-dev-cloud.yml; then
  print_pass "Dev Cloud Serve ports configured (80, 3001)"
  ((TOTAL_TESTS++))
else
  print_fail "Dev Cloud Serve ports incorrect"
  ((TOTAL_TESTS++))
fi

echo "3.3 Testing Production Cloud configuration..."
if grep -q "tailscale_hostname: \"smokecloud\"" inventory/host_vars/smart-smoker-cloud-prod.yml && \
   grep -q "tailscale_funnel_enabled: true" inventory/host_vars/smart-smoker-cloud-prod.yml; then
  print_pass "Production has Tailscale Funnel enabled"
  ((TOTAL_TESTS++))
else
  print_fail "Production Tailscale Funnel config incorrect"
  ((TOTAL_TESTS++))
fi

if grep -q "port: 443" inventory/host_vars/smart-smoker-cloud-prod.yml && \
   grep -q "port: 8443" inventory/host_vars/smart-smoker-cloud-prod.yml; then
  print_pass "Production Funnel ports configured (443, 8443)"
  ((TOTAL_TESTS++))
else
  print_fail "Production Funnel ports incorrect"
  ((TOTAL_TESTS++))
fi

echo "3.4 Testing Virtual Smoker configuration..."
if grep -q "tailscale_hostname: \"virtual-smoker\"" inventory/host_vars/virtual-smoker-device.yml && \
   grep -q "tag:device" inventory/host_vars/virtual-smoker-device.yml; then
  print_pass "Virtual Smoker Tailscale config correct"
  ((TOTAL_TESTS++))
else
  print_fail "Virtual Smoker Tailscale config incorrect"
  ((TOTAL_TESTS++))
fi

# Test Suite 4: Role Integration
print_section "Test Suite 4: Playbook Integration"

echo "4.1 Verifying tailscale role in all playbooks..."
for playbook in setup-github-runner setup-dev-cloud setup-prod-cloud setup-virtual-smoker; do
  if grep -q "tailscale" playbooks/${playbook}.yml; then
    print_pass "tailscale role in ${playbook}.yml"
    ((TOTAL_TESTS++))
  else
    print_fail "tailscale role missing from ${playbook}.yml"
    ((TOTAL_TESTS++))
  fi
done

echo "4.2 Verifying role execution order (common before tailscale)..."
for playbook in playbooks/setup-*.yml; do
  if awk '/roles:/,/^[^ ]/' "$playbook" | grep -B 5 "tailscale" | grep -q "common"; then
    print_pass "$(basename $playbook): correct role order"
    ((TOTAL_TESTS++))
  else
    print_fail "$(basename $playbook): role order may be incorrect"
    ((TOTAL_TESTS++))
  fi
done

# Test Suite 5: Template and Script Validation
print_section "Test Suite 5: Template and Script Validation"

echo "5.1 Testing funnel script template..."
if [ -f "roles/tailscale/templates/tailscale-funnel.sh.j2" ]; then
  print_pass "Funnel script template exists"
  ((TOTAL_TESTS++))

  # Test template contains required variables
  if grep -q "{{ tailscale_hostname }}" roles/tailscale/templates/tailscale-funnel.sh.j2 && \
     grep -q "{{ tailscale_domain }}" roles/tailscale/templates/tailscale-funnel.sh.j2; then
    print_pass "Template has required Jinja2 variables"
    ((TOTAL_TESTS++))
  else
    print_fail "Template missing required variables"
    ((TOTAL_TESTS++))
  fi
else
  print_fail "Funnel script template missing"
  ((TOTAL_TESTS++))
  ((TOTAL_TESTS++))
fi

echo "5.2 Testing test-tailscale-mesh.sh script..."
if [ -x "../scripts/test-tailscale-mesh.sh" ]; then
  print_pass "test-tailscale-mesh.sh is executable"
  ((TOTAL_TESTS++))

  if bash -n ../scripts/test-tailscale-mesh.sh 2>/dev/null; then
    print_pass "test-tailscale-mesh.sh has valid bash syntax"
    ((TOTAL_TESTS++))
  else
    print_fail "test-tailscale-mesh.sh syntax error"
    ((TOTAL_TESTS++))
  fi
else
  print_fail "test-tailscale-mesh.sh not executable"
  ((TOTAL_TESTS++))
  ((TOTAL_TESTS++))
fi

# Test Suite 6: Documentation
print_section "Test Suite 6: Documentation Completeness"

echo "6.1 Checking README documentation..."
if grep -q "Tailscale Mesh Network" README.md; then
  print_pass "README has Tailscale section"
  ((TOTAL_TESTS++))
else
  print_fail "README missing Tailscale documentation"
  ((TOTAL_TESTS++))
fi

if grep -q "Network Topology" README.md && \
   grep -q "smoker-runner" README.md && \
   grep -q "smoker-dev-cloud" README.md && \
   grep -q "smokecloud" README.md && \
   grep -q "virtual-smoker" README.md; then
  print_pass "README documents all 4 hosts"
  ((TOTAL_TESTS++))
else
  print_fail "README incomplete host documentation"
  ((TOTAL_TESTS++))
fi

if grep -q "Tailscale Variables Reference" README.md; then
  print_pass "README has variable reference"
  ((TOTAL_TESTS++))
else
  print_fail "README missing variable reference"
  ((TOTAL_TESTS++))
fi

if grep -q "Troubleshooting Tailscale" README.md; then
  print_pass "README has troubleshooting section"
  ((TOTAL_TESTS++))
else
  print_fail "README missing troubleshooting"
  ((TOTAL_TESTS++))
fi

# Test Suite 7: Idempotency and Best Practices
print_section "Test Suite 7: Ansible Best Practices"

echo "7.1 Checking for idempotent task patterns..."
if grep -q "Check if Tailscale is already installed" roles/tailscale/tasks/main.yml && \
   grep -q "Check if Tailscale is already connected" roles/tailscale/tasks/main.yml; then
  print_pass "Role checks existing state (idempotent)"
  ((TOTAL_TESTS++))
else
  print_fail "Role may not be idempotent"
  ((TOTAL_TESTS++))
fi

echo "7.2 Checking for FQCN module names..."
if grep -q "ansible.builtin" roles/tailscale/tasks/main.yml && \
   grep -q "community.general.ufw" roles/tailscale/tasks/main.yml; then
  print_pass "Uses FQCN module names (best practice)"
  ((TOTAL_TESTS++))
else
  print_fail "Should use FQCN module names"
  ((TOTAL_TESTS++))
fi

echo "7.3 Checking for no_log on sensitive tasks..."
if grep -B 3 "tailscale up" roles/tailscale/tasks/main.yml | grep -q "no_log: true"; then
  print_pass "Sensitive tasks use no_log directive"
  ((TOTAL_TESTS++))
else
  print_fail "Sensitive tasks should use no_log"
  ((TOTAL_TESTS++))
fi

echo "7.4 Checking handler definitions..."
if grep -q "name: Restart tailscaled" roles/tailscale/handlers/main.yml && \
   grep -q "name: Reload ufw" roles/tailscale/handlers/main.yml; then
  print_pass "Required handlers defined"
  ((TOTAL_TESTS++))
else
  print_fail "Handlers missing or incorrectly defined"
  ((TOTAL_TESTS++))
fi

# Final Report
print_header "Test Results Summary"

echo -e "${CYAN}Total Tests Run:${NC}      $TOTAL_TESTS"
echo -e "${GREEN}Tests Passed:${NC}        $((TOTAL_TESTS - TOTAL_FAILURES))"
echo -e "${RED}Tests Failed:${NC}        $TOTAL_FAILURES"
echo ""

SUCCESS_RATE=$(( (TOTAL_TESTS - TOTAL_FAILURES) * 100 / TOTAL_TESTS ))
echo -e "${CYAN}Success Rate:${NC}        ${SUCCESS_RATE}%"
echo ""

if [ $TOTAL_FAILURES -eq 0 ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ ALL TESTS PASSED - READY FOR PRODUCTION DEPLOYMENT${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  exit 0
elif [ $TOTAL_FAILURES -le 2 ]; then
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  ⚠ MINOR ISSUES DETECTED - REVIEW BEFORE DEPLOYMENT${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  exit 1
else
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}  ✗ CRITICAL ISSUES FOUND - DO NOT DEPLOY${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  exit 2
fi
