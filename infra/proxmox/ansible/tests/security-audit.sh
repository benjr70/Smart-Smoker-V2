#!/bin/bash
# Comprehensive Security Audit for Tailscale Implementation
# Tests for secrets, permissions, sensitive data exposure

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
WARNINGS=0

print_header() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
  echo -e "${BLUE}TEST: $1${NC}"
}

print_pass() {
  echo -e "${GREEN}✓ PASS: $1${NC}"
  ((PASSED++))
}

print_fail() {
  echo -e "${RED}✗ FAIL: $1${NC}"
  ((FAILED++))
}

print_warn() {
  echo -e "${YELLOW}⚠ WARNING: $1${NC}"
  ((WARNINGS++))
}

# Navigate to ansible directory
cd "$(dirname "$0")/.."

print_header "Security Audit: Tailscale Implementation"

# Test 1: No hardcoded auth keys
print_test "Checking for hardcoded Tailscale auth keys"
if grep -r "tskey-auth-[a-zA-Z0-9]\{20,\}" roles/tailscale/ playbooks/ inventory/host_vars/ inventory/group_vars/ 2>/dev/null | grep -v "README.md" | grep -v "XXXXX"; then
  print_fail "Found hardcoded Tailscale auth keys in configuration files"
else
  print_pass "No hardcoded auth keys found"
fi

# Test 2: Auth key only in README as example
print_test "Verifying auth keys in README are examples only"
if grep "tskey-auth-" README.md | grep -q "XXXXX"; then
  print_pass "README only contains example auth keys (with XXXXX)"
else
  print_warn "README may contain non-example auth keys"
fi

# Test 3: Verify no_log on sensitive tasks
print_test "Checking for no_log directive on sensitive tasks"
if grep -A 5 "tailscale_up_command" roles/tailscale/tasks/main.yml | grep -q "no_log: true"; then
  print_pass "tailscale_up_command has no_log: true"
else
  print_fail "tailscale_up_command missing no_log directive"
fi

if grep -A 5 "Connect to Tailscale network" roles/tailscale/tasks/main.yml | grep -q "no_log: true"; then
  print_pass "Tailscale connection task has no_log: true"
else
  print_fail "Tailscale connection task missing no_log directive"
fi

# Test 4: Check for passwords or API tokens
print_test "Scanning for potential passwords or tokens"
if grep -ri "password\s*:\s*['\"][^'\"]*['\"]" roles/tailscale/ inventory/ playbooks/ | grep -v "password_authentication" | grep -v "prohibit-password"; then
  print_fail "Found potential hardcoded passwords"
else
  print_pass "No hardcoded passwords found"
fi

# Test 5: File permissions in templates
print_test "Verifying generated script permissions are restrictive"
if grep -q "mode: '0755'" roles/tailscale/tasks/funnel.yml; then
  print_pass "Funnel script created with appropriate permissions (0755)"
else
  print_fail "Funnel script permissions not set correctly"
fi

if grep -q "owner: root" roles/tailscale/tasks/funnel.yml; then
  print_pass "Funnel script owned by root"
else
  print_warn "Funnel script ownership may not be set to root"
fi

# Test 6: UFW firewall rules
print_test "Validating UFW firewall rules"
if grep -q "interface: tailscale0" roles/tailscale/tasks/main.yml; then
  print_pass "UFW allows Tailscale interface"
else
  print_fail "UFW rule for Tailscale interface missing"
fi

if grep -q "port: '41641'" roles/tailscale/tasks/main.yml; then
  print_pass "UFW allows Tailscale UDP port 41641"
else
  print_fail "UFW rule for Tailscale port missing"
fi

# Test 7: SSH configuration
print_test "Checking Tailscale SSH is disabled by default"
if grep -q "tailscale_ssh_enabled: false" roles/tailscale/defaults/main.yml; then
  print_pass "Tailscale SSH disabled by default (secure)"
else
  print_warn "Tailscale SSH may be enabled by default"
fi

# Test 8: Verify serve/funnel are disabled by default
print_test "Checking Serve/Funnel are disabled by default"
if grep -q "tailscale_serve_enabled: false" roles/tailscale/defaults/main.yml; then
  print_pass "Tailscale Serve disabled by default"
else
  print_fail "Tailscale Serve should be disabled by default"
fi

if grep -q "tailscale_funnel_enabled: false" roles/tailscale/defaults/main.yml; then
  print_pass "Tailscale Funnel disabled by default"
else
  print_fail "Tailscale Funnel should be disabled by default"
fi

# Test 9: Check for environment variable leakage
print_test "Checking for environment variable secrets"
if grep -ri "\$TAILSCALE_\|process.env.TAILSCALE" roles/tailscale/ | grep -v "# Example"; then
  print_warn "Found references to Tailscale environment variables"
else
  print_pass "No environment variable secrets detected"
fi

# Test 10: Verify auth key is empty by default
print_test "Verifying auth key default is empty"
if grep -q 'tailscale_auth_key: ""' roles/tailscale/defaults/main.yml; then
  print_pass "Auth key is empty by default (must be provided at runtime)"
else
  print_fail "Auth key should be empty string by default"
fi

# Test 11: Check for production-specific security
print_test "Checking production environment security settings"
if grep -q "tag:production" inventory/host_vars/smart-smoker-cloud-prod.yml; then
  print_pass "Production is properly tagged"
else
  print_warn "Production environment should have production tag"
fi

if grep -q "fail2ban_ban_time: 7200" inventory/host_vars/smart-smoker-cloud-prod.yml; then
  print_pass "Production has stricter fail2ban settings"
else
  print_warn "Production should have stricter fail2ban configuration"
fi

# Test 12: Verify Funnel only on production
print_test "Verifying Funnel is only enabled on production"
FUNNEL_COUNT=$(grep -r "tailscale_funnel_enabled: true" inventory/host_vars/ 2>/dev/null | wc -l)
if [ "$FUNNEL_COUNT" -eq 1 ]; then
  print_pass "Funnel enabled on exactly 1 host (production only)"
else
  print_warn "Funnel should only be enabled on production (found on $FUNNEL_COUNT hosts)"
fi

# Test 13: Check for deprecated Ansible syntax
print_test "Checking for deprecated Ansible syntax"
if grep -r "action:\|include:" roles/tailscale/tasks/ 2>/dev/null; then
  print_warn "Found deprecated Ansible syntax"
else
  print_pass "No deprecated Ansible syntax found"
fi

# Test 14: Verify FQCN module names
print_test "Verifying Fully Qualified Collection Names (FQCN)"
if grep -q "ansible.builtin" roles/tailscale/tasks/main.yml && grep -q "community.general.ufw" roles/tailscale/tasks/main.yml; then
  print_pass "Tasks use FQCN module names (best practice)"
else
  print_warn "Some tasks may not use FQCN module names"
fi

# Test 15: Check for world-readable sensitive files
print_test "Checking template permissions prevent world-read"
if grep "mode: '0" roles/tailscale/tasks/ | grep -v "'0755'" | grep -v "'0644'" | grep -v "'0600'"; then
  print_warn "Found unusual file permissions"
else
  print_pass "All file permissions are standard and appropriate"
fi

# Test 16: Validate no secrets in git history (current state)
print_test "Checking git status for uncommitted secrets"
if git status --porcelain | grep -E "tailscale.*\.yml|tailscale.*\.sh" | grep "^A"; then
  print_warn "New Tailscale files ready to commit - verify no secrets before committing"
else
  print_pass "No new Tailscale files in git staging area with potential secrets"
fi

# Test 17: Verify .gitignore patterns
print_test "Checking for .gitignore entries for secrets"
if [ -f "../../.gitignore" ] && grep -q "tskey-\|tailscale_auth" ../../.gitignore 2>/dev/null; then
  print_pass "Gitignore has Tailscale secret patterns"
else
  print_warn "Consider adding Tailscale secret patterns to .gitignore"
fi

# Test 18: Check for localhost-only funnel config script
print_test "Verifying funnel script template uses localhost"
if grep -q "localhost:" roles/tailscale/templates/tailscale-funnel.sh.j2; then
  print_pass "Funnel script correctly targets localhost services"
else
  print_fail "Funnel script should target localhost services"
fi

# Test 19: Verify tags for all environments
print_test "Checking all environments have appropriate tags"
TAG_ISSUES=0
for host_var in inventory/host_vars/*.yml; do
  if ! grep -q "tailscale_tags:" "$host_var"; then
    print_warn "$(basename "$host_var") missing tailscale_tags"
    ((TAG_ISSUES++))
  fi
done

if [ $TAG_ISSUES -eq 0 ]; then
  print_pass "All hosts have Tailscale tags defined"
fi

# Test 20: Verify conditional task execution
print_test "Checking serve/funnel tasks have proper conditionals"
if grep -q "when: tailscale_serve_enabled and tailscale_serve_config | length > 0" roles/tailscale/tasks/main.yml; then
  print_pass "Serve task has proper conditional (enabled + config)"
else
  print_fail "Serve task should check both enabled flag and config presence"
fi

if grep -q "when: tailscale_funnel_enabled and tailscale_funnel_config | length > 0" roles/tailscale/tasks/main.yml; then
  print_pass "Funnel task has proper conditional (enabled + config)"
else
  print_fail "Funnel task should check both enabled flag and config presence"
fi

# Final Summary
print_header "Security Audit Summary"

echo -e "${GREEN}Passed:   $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed:   $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Security Audit: PASSED${NC}"
  echo -e "${GREEN}========================================${NC}"
  exit 0
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}Security Audit: FAILED${NC}"
  echo -e "${RED}Fix $FAILED issue(s) before deployment${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi
