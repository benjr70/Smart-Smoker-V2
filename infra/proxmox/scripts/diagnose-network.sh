#!/bin/bash
# Network diagnostic script for LXC containers
# Tests hypotheses about why containers cannot reach the internet

LOG_FILE="/tmp/network-diagnostic.log"
echo "=== Network Diagnostic $(date) ===" > "$LOG_FILE"

# Hypothesis A: Check if gateway can reach internet
echo "[Hypothesis A] Testing gateway (10.20.0.1) internet connectivity..." | tee -a "$LOG_FILE"
if ping -c 2 -W 2 8.8.8.8 > /dev/null 2>&1; then
    echo "✅ Gateway can reach internet (8.8.8.8)" | tee -a "$LOG_FILE"
    GATEWAY_INTERNET="OK"
else
    echo "❌ Gateway cannot reach internet" | tee -a "$LOG_FILE"
    GATEWAY_INTERNET="FAIL"
fi

# Hypothesis B: Check Proxmox firewall status (if accessible)
echo "[Hypothesis B] Checking if Proxmox firewall might be blocking..." | tee -a "$LOG_FILE"
echo "Note: Requires Proxmox host access to check firewall" | tee -a "$LOG_FILE"

# Hypothesis C: Check routing table
echo "[Hypothesis C] Checking routing configuration..." | tee -a "$LOG_FILE"
echo "Default route:" | tee -a "$LOG_FILE"
ip route show default | tee -a "$LOG_FILE"
echo "All routes:" | tee -a "$LOG_FILE"
ip route | tee -a "$LOG_FILE"

# Hypothesis D: Check IP forwarding (requires root on Proxmox host)
echo "[Hypothesis D] IP forwarding status (requires Proxmox host):" | tee -a "$LOG_FILE"
echo "Note: Check /proc/sys/net/ipv4/ip_forward on Proxmox host" | tee -a "$LOG_FILE"

# Hypothesis E: Test DNS resolution
echo "[Hypothesis E] Testing DNS resolution..." | tee -a "$LOG_FILE"
if nslookup github.com > /dev/null 2>&1; then
    echo "✅ DNS resolution works" | tee -a "$LOG_FILE"
    DNS_STATUS="OK"
else
    echo "❌ DNS resolution failed" | tee -a "$LOG_FILE"
    DNS_STATUS="FAIL"
fi

# Test connectivity to gateway
echo "Testing connectivity to gateway (10.20.0.1)..." | tee -a "$LOG_FILE"
if ping -c 2 -W 2 10.20.0.1 > /dev/null 2>&1; then
    echo "✅ Can reach gateway" | tee -a "$LOG_FILE"
    GATEWAY_REACHABLE="OK"
else
    echo "❌ Cannot reach gateway" | tee -a "$LOG_FILE"
    GATEWAY_REACHABLE="FAIL"
fi

# Test HTTPS connectivity
echo "Testing HTTPS connectivity to GitHub..." | tee -a "$LOG_FILE"
if curl -s --max-time 5 https://github.com > /dev/null 2>&1; then
    echo "✅ Can reach GitHub via HTTPS" | tee -a "$LOG_FILE"
    HTTPS_STATUS="OK"
else
    echo "❌ Cannot reach GitHub via HTTPS" | tee -a "$LOG_FILE"
    HTTPS_STATUS="FAIL"
fi

# Summary
echo "" | tee -a "$LOG_FILE"
echo "=== Summary ===" | tee -a "$LOG_FILE"
echo "Gateway reachable: $GATEWAY_REACHABLE" | tee -a "$LOG_FILE"
echo "Gateway internet: $GATEWAY_INTERNET" | tee -a "$LOG_FILE"
echo "DNS resolution: $DNS_STATUS" | tee -a "$LOG_FILE"
echo "HTTPS to GitHub: $HTTPS_STATUS" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Full log saved to: $LOG_FILE" | tee -a "$LOG_FILE"







