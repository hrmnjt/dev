# WireGuard UAE Exit Node — Full Setup Guide

## Overview
Run a WireGuard server on a $5/month UAE cloud VM and route all your home traffic through it using a GL.iNet router.

```
[Your Devices] ─── [GL.iNet Router] ──(WireGuard Tunnel)── [UAE Cloud VM] ─── Internet
   192.168.8.x        Client: 10.99.77.2                    Server: 10.99.77.1
```

---

## Part A: Cloud VM (Server)

### 1. Create the VM
- **Provider**: AWS Lightsail → Region: `Middle East (UAE) / me-central-1`
- **OS**: Ubuntu 24.04 LTS
- **Plan**: $5/month (512 MB RAM) or $10/month (1 GB RAM)
- **Firewall**: Open **UDP 51820** to `0.0.0.0/0`

### 2. Run the Setup Script
```bash
ssh ubuntu@<your-vm-public-ip>
sudo bash setup-wg-server.sh
```

The script will:
- Install WireGuard
- Generate server + client keys
- Configure NAT & IP forwarding
- Start the WireGuard service
- Print the client configuration values

**Save these values** — you'll need them for the router:
- Server Public Key
- Client Private Key
- Client Public Key (for reference)
- Pre-Shared Key (PSK)
- Server endpoint: `<VM_IP>:51820`

---

## Part B: GL.iNet Router (Client)

### Via Web Admin Panel (Recommended)

1. **Log in** to your GL.iNet router admin panel (usually `http://192.168.8.1`)

2. **Navigate** to: *VPN* → *WireGuard Client*

3. **Add a new profile** manually (no config file needed):

   | Field | Value |
   |-------|-------|
   | Name | `UAE-VPN` |
   | Private Key | *(Client Private Key from the script)* |
   | Address | `10.99.77.2/24` |
   | DNS | `1.1.1.1` |
   | MTU | Leave default (or `1420`) |
   |
   | **Peer → Public Key** | *(Server Public Key from the script)* |
   | **Peer → Pre-Shared Key** | *(PSK from the script)* |
   | **Peer → Endpoint** | `<VM_PUBLIC_IP>:51820` |
   | **Peer → Allowed IPs** | `0.0.0.0/0` *(this routes ALL traffic through VPN)* |
   | **Peer → Persistent Keepalive** | `25` |

4. **Click Apply** and then **Connect**

5. **Verify**: Visit `https://whatismyipaddress.com` — it should show a UAE IP.

### Via Config File (Alternative)

If your GL.iNet firmware supports importing WireGuard configs, use the `wg-client.conf` file generated on the server. Download it and import via the admin panel.

---

## Part C: Optional Enhancements

### Split Tunneling (only route work traffic to UAE)

If you don't want *all* your traffic to go through UAE, change **Allowed IPs** on the router from `0.0.0.0/0` to only your work's IP ranges:

```
AllowedIPs = <work-corp-subnet-1>, <work-corp-subnet-2>
```

Example:
```
AllowedIPs = 10.0.0.0/8, 172.20.0.0/16
```

This way only work-related traffic goes through the tunnel; your personal traffic uses your Indian ISP directly.

### Kill Switch (Block traffic if VPN drops)

On GL.iNet: *VPN* → *WireGuard Client* → your profile → enable **"Block Non-VPN Traffic"** or set up the **VPN Kill Switch** under *Network* → *Firewall*.

### Automatic Reconnect

The `PersistentKeepalive = 25` setting sends a keepalive packet every 25 seconds. This keeps the tunnel alive behind NAT. The GL.iNet router will also auto-reconnect if the tunnel drops.

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| No handshake | Verify UDP 51820 is open in AWS Lightsail firewall |
| Handshake but no internet | Check `sysctl net.ipv4.ip_forward` = `1` on server |
| Slow speeds | Try lowering MTU to `1380` or `1280` |
| DNS leaks | Set DNS in router WireGuard config to `1.1.1.1` |
