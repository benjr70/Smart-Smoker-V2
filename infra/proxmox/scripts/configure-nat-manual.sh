#!/bin/bash
# Manual NAT configuration script for Proxmox host
# Run this script on the Proxmox host (192.168.1.151) as root
#
# This script:
# 1. Enables IP forwarding
# 2. Configures NAT masquerade for 10.20.0.0/24 network
# 3. Persists the configuration

set -e

CONTAINER_NETWORK="10.20.0.0/24"

# Detect external interface (the one with default route)
EXTERNAL_INTERFACE=$(ip route show default | awk '/default/ {print $5}' | head -1)

if [ -z "$EXTERNAL_INTERFACE" ]; then
    echo "❌ Error: Could not detect external network interface"
    exit 1
fi

echo "=== Proxmox NAT Configuration ==="
echo "Container network: $CONTAINER_NETWORK"
echo "External interface: $EXTERNAL_INTERFACE"
echo ""

# Enable IP forwarding
echo "1. Enabling IP forwarding..."
if [ "$(cat /proc/sys/net/ipv4/ip_forward)" != "1" ]; then
    echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-proxmox-nat.conf
    sysctl -p /etc/sysctl.d/99-proxmox-nat.conf
    echo "✅ IP forwarding enabled"
else
    echo "✅ IP forwarding already enabled"
fi

# Check if NAT rule already exists
echo ""
echo "2. Checking NAT masquerade rule..."
if iptables -t nat -C POSTROUTING -s "$CONTAINER_NETWORK" -o "$EXTERNAL_INTERFACE" -j MASQUERADE 2>/dev/null; then
    echo "✅ NAT masquerade rule already exists"
else
    echo "Adding NAT masquerade rule..."
    iptables -t nat -A POSTROUTING -s "$CONTAINER_NETWORK" -o "$EXTERNAL_INTERFACE" -j MASQUERADE
    echo "✅ NAT masquerade rule added"
fi

# Save iptables rules
echo ""
echo "3. Saving iptables rules..."
if command -v netfilter-persistent > /dev/null; then
    netfilter-persistent save
    echo "✅ Rules saved using netfilter-persistent"
elif [ -d /etc/iptables ]; then
    iptables-save > /etc/iptables/rules.v4
    echo "✅ Rules saved to /etc/iptables/rules.v4"
else
    echo "⚠️  Warning: Could not find iptables persistence tool"
    echo "   Rules will be lost on reboot. Install netfilter-persistent or configure iptables-persistent"
fi

echo ""
echo "=== Configuration Complete ==="
echo "Containers in $CONTAINER_NETWORK should now be able to reach the internet"
echo ""
echo "Test from a container:"
echo "  curl -s https://github.com"



