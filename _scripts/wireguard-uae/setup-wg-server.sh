#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# WireGuard Server Setup Script
# For GL.iNet router VPN (UAE exit node)
# Run this on your UAE cloud VM (Ubuntu 24.04)
# ──────────────────────────────────────────────

echo "=== WireGuard Server Setup ==="

# 1. System update & WireGuard install
echo "[1/7] Updating system and installing WireGuard..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq wireguard wireguard-tools iptables-persistent

# 2. Generate server keys
echo "[2/7] Generating WireGuard keys..."
umask 077
SERVER_PRIVATE_KEY=$(wg genkey)
SERVER_PUBLIC_KEY=$(echo "$SERVER_PRIVATE_KEY" | wg pubkey)

mkdir -p /etc/wireguard
echo "$SERVER_PRIVATE_KEY" > /etc/wireguard/server_private.key
echo "$SERVER_PUBLIC_KEY"  > /etc/wireguard/server_public.key

# 3. Detect network interface
MAIN_IF=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
echo "[3/7] Detected main interface: $MAIN_IF"

# 4. Choose WireGuard subnet (adjust if it conflicts with your LAN)
WG_SUBNET="10.99.77.0/24"
SERVER_WG_IP="10.99.77.1"
CLIENT_WG_IP="10.99.77.2"

# 5. Generate client keys
echo "[4/7] Generating client keys..."
CLIENT_PRIVATE_KEY=$(wg genkey)
CLIENT_PUBLIC_KEY=$(echo "$CLIENT_PRIVATE_KEY" | wg pubkey)
CLIENT_PSK=$(wg genpsk)

# 6. Write WireGuard server config
echo "[5/7] Writing server config to /etc/wireguard/wg0.conf..."
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
PrivateKey = ${SERVER_PRIVATE_KEY}
Address    = ${SERVER_WG_IP}/24
ListenPort = 51820

# NAT & forwarding rules
PostUp   = sysctl -w net.ipv4.ip_forward=1
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp   = iptables -t nat -A POSTROUTING -o ${MAIN_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${MAIN_IF} -j MASQUERADE

[Peer]
# GL.iNet Router (Home)
PublicKey    = ${CLIENT_PUBLIC_KEY}
PresharedKey = ${CLIENT_PSK}
AllowedIPs   = ${CLIENT_WG_IP}/32
EOF

chmod 600 /etc/wireguard/wg0.conf

# 7. Enable IP forwarding permanently
echo "[6/7] Enabling IP forwarding..."
cat > /etc/sysctl.d/99-wireguard.conf <<EOF
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF
sysctl --system > /dev/null

# 8. Start WireGuard
echo "[7/7] Starting WireGuard..."
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
systemctl status wg-quick@wg0 --no-pager

# ──────────────────────────────────────────────
# Output: Client config for GL.iNet router
# ──────────────────────────────────────────────
SERVER_PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VM_PUBLIC_IP")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  WireGuard server is UP!                                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  SERVER PUBLIC KEY:  ${SERVER_PUBLIC_KEY}"
echo "║  CLIENT PRIVATE KEY: ${CLIENT_PRIVATE_KEY}"
echo "║  CLIENT PUBLIC KEY:  ${CLIENT_PUBLIC_KEY}"
echo "║  PRE-SHARED KEY:     ${CLIENT_PSK}"
echo "║  SERVER IP:          ${SERVER_PUBLIC_IP}:51820"
echo "║  CLIENT WG IP:       ${CLIENT_WG_IP}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Write client config file for convenience
cat > /root/wg-client.conf <<CLIENTEOF
[Interface]
PrivateKey = ${CLIENT_PRIVATE_KEY}
Address    = ${CLIENT_WG_IP}/24
DNS        = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey    = ${SERVER_PUBLIC_KEY}
PresharedKey = ${CLIENT_PSK}
Endpoint     = ${SERVER_PUBLIC_IP}:51820
AllowedIPs   = 0.0.0.0/0
PersistentKeepalive = 25
CLIENTEOF

echo "Client config saved to: /root/wg-client.conf"
echo "Use these values to configure your GL.iNet router (see instructions below)."
