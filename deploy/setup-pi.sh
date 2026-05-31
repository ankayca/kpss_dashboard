#!/usr/bin/env bash
# Run ON the Raspberry Pi (via Raspberry Pi Connect shell or SSH).
# Installs nginx + cloudflared, creates web root, enables services.
set -euo pipefail

APP_DIR="/var/www/kpss-dashboard"
NGINX_SITE="/etc/nginx/sites-available/kpss-dashboard"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing nginx..."
sudo apt-get update -qq
sudo apt-get install -y nginx curl

echo "==> Creating web root at ${APP_DIR}..."
sudo mkdir -p "${APP_DIR}"
sudo chown -R "${USER}:${USER}" "${APP_DIR}"

echo "==> Configuring nginx..."
sudo cp "${SCRIPT_DIR}/nginx-kpss.conf" "${NGINX_SITE}"
sudo ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/kpss-dashboard
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx

echo "==> Installing cloudflared..."
if ! command -v cloudflared &>/dev/null; then
  curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    | sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt-get update -qq
  sudo apt-get install -y cloudflared
fi

sudo mkdir -p /etc/cloudflared

echo ""
echo "=== Pi setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Deploy the built app into ${APP_DIR} (run sync-to-pi.sh from your dev machine)"
echo "  2. Cloudflare Tunnel:"
echo "       cloudflared tunnel login"
echo "       cloudflared tunnel create kpss-dashboard"
echo "       cloudflared tunnel route dns kpss-dashboard kpss.YOURDOMAIN.com"
echo "       sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/"
echo "       sudo cp deploy/cloudflared-config.yml.example /etc/cloudflared/config.yml"
echo "       # edit config.yml — set tunnel UUID, hostname, credentials path"
echo "       sudo cp deploy/cloudflared.service /etc/systemd/system/cloudflared.service"
echo "       sudo systemctl enable --now cloudflared"
echo ""
echo "  Quick test (no domain): cloudflared tunnel --url http://127.0.0.1:8080"
