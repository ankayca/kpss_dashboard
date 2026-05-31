#!/usr/bin/env bash
# Run ON the Raspberry Pi after `cloudflared tunnel login`.
# Creates a permanent URL at https://kpss.croupion.com
#
# Usage:
#   ./deploy/finish-tunnel.sh                    # uses tunnel name kpss-dashboard
#   ./deploy/finish-tunnel.sh my-tunnel          # existing tunnel name
#   ./deploy/finish-tunnel.sh my-tunnel kpss.croupion.com
set -euo pipefail

TUNNEL_NAME="${1:-kpss-dashboard}"
HOSTNAME="${2:-kpss.croupion.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGIN_CERT="${HOME}/.cloudflared/cert.pem"

require_origin_cert() {
  if [[ -f "${ORIGIN_CERT}" ]]; then
    return 0
  fi
  echo "ERROR: Missing Cloudflare origin certificate: ${ORIGIN_CERT}" >&2
  echo "" >&2
  echo "Login must complete ON THIS Pi (creates cert.pem):" >&2
  echo "  cloudflared tunnel login" >&2
  echo "  # Open the printed URL on phone/laptop → pick zone croupion.com" >&2
  echo "" >&2
  echo "If you already logged in on another computer, copy cert.pem here:" >&2
  echo "  mkdir -p ~/.cloudflared" >&2
  echo "  # from dev machine: scp ~/.cloudflared/cert.pem croupion@homerasp:~/.cloudflared/" >&2
  exit 1
}

require_origin_cert

get_tunnel_uuid() {
  cloudflared tunnel list 2>/dev/null | awk -v name="${TUNNEL_NAME}" '$0 ~ name { print $1; exit }'
}

UUID="$(get_tunnel_uuid || true)"

if [[ -z "${UUID}" ]]; then
  echo "==> Tunnel '${TUNNEL_NAME}' not found — creating..."
  cloudflared tunnel create "${TUNNEL_NAME}"
  UUID="$(get_tunnel_uuid)"
fi

if [[ -z "${UUID}" ]]; then
  echo "Could not resolve tunnel UUID. Run: cloudflared tunnel list" >&2
  exit 1
fi

echo "==> Tunnel: ${TUNNEL_NAME} (${UUID})"
echo "==> Hostname: ${HOSTNAME}"

CRED_SRC="${HOME}/.cloudflared/${UUID}.json"
CRED_DST="/etc/cloudflared/${UUID}.json"

if [[ ! -f "${CRED_SRC}" ]]; then
  echo "Missing credentials: ${CRED_SRC}" >&2
  echo "Run: cloudflared tunnel login" >&2
  exit 1
fi

echo "==> Routing DNS..."
cloudflared tunnel route dns "${TUNNEL_NAME}" "${HOSTNAME}" || true

echo "==> Writing /etc/cloudflared/config.yml ..."
sudo mkdir -p /etc/cloudflared
sudo cp "${CRED_SRC}" "${CRED_DST}"
sudo chmod 600 "${CRED_DST}"

sudo tee /etc/cloudflared/config.yml >/dev/null <<EOF
tunnel: ${UUID}
credentials-file: ${CRED_DST}

ingress:
  - hostname: ${HOSTNAME}
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

echo "==> Installing systemd service..."
sudo cp "${SCRIPT_DIR}/cloudflared.service" /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

echo ""
echo "=== Permanent URL ready ==="
echo "  https://${HOSTNAME}"
echo ""
echo "Check status:  sudo systemctl status cloudflared"
echo "View logs:     sudo journalctl -u cloudflared -f"
echo ""
echo "Make sure nginx is serving the app on port 8080:"
echo "  curl -sI http://127.0.0.1:8080 | head -1"
