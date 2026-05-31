#!/usr/bin/env bash
# Run ON the Raspberry Pi — nginx :8080 + build + deploy in one step.
set -euo pipefail

APP_DIR="/var/www/kpss-dashboard"
NGINX_SITE="/etc/nginx/sites-available/kpss-dashboard"
API_SERVICE="/etc/systemd/system/kpss-api.service"
DATA_DIR="/var/lib/kpss-dashboard"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ensure_nginx() {
  echo "==> Configuring nginx on port 8080..."
  sudo cp "${REPO_ROOT}/deploy/nginx-kpss.conf" "${NGINX_SITE}"
  sudo ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/kpss-dashboard
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo mkdir -p "${APP_DIR}"
  sudo chown -R "${USER}:${USER}" "${APP_DIR}"
  sudo nginx -t
  sudo systemctl enable --now nginx
  sudo systemctl reload nginx
}

ensure_node() {
  if command -v npm &>/dev/null; then
    return 0
  fi
  echo "==> Installing Node.js..."
  sudo apt-get update -qq
  sudo apt-get install -y nodejs npm
}

ensure_api() {
  echo "==> Setting up storage API service..."
  sudo mkdir -p "${DATA_DIR}"
  sudo chown -R "${USER}:${USER}" "${DATA_DIR}"

  local node_bin
  node_bin="$(command -v node)"

  # Render the unit with this machine's user, repo path and node binary.
  sudo tee "${API_SERVICE}" >/dev/null <<EOF
[Unit]
Description=KPSS Dashboard storage API
After=network.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${REPO_ROOT}
ExecStart=${node_bin} ${REPO_ROOT}/server/server.js
Environment=PORT=8090
Environment=KPSS_DATA_DIR=${DATA_DIR}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable --now kpss-api
  sudo systemctl restart kpss-api
}

ensure_nginx
ensure_node

echo "==> Installing npm dependencies..."
cd "${REPO_ROOT}"
npm install

echo "==> Building..."
npm run build

echo "==> Deploying to ${APP_DIR} ..."
rsync -a --delete "${REPO_ROOT}/dist/" "${APP_DIR}/"

ensure_api

echo "==> Verifying..."
if ! curl -sfI http://127.0.0.1:8080 | head -1; then
  echo "ERROR: nginx still not responding on :8080" >&2
  echo "  sudo ss -tlnp | grep nginx" >&2
  echo "  sudo nginx -t" >&2
  exit 1
fi

# The Node service may need a moment to bind — poll for up to ~15s.
wait_for() {
  local url="$1" i
  for i in $(seq 1 15); do
    if curl -sf "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

if ! wait_for http://127.0.0.1:8090/api/health; then
  echo "ERROR: storage API (kpss-api) is not listening on :8090" >&2
  echo "----- systemctl status -----" >&2
  sudo systemctl status kpss-api --no-pager -l || true
  echo "----- last 40 log lines -----" >&2
  sudo journalctl -u kpss-api -n 40 --no-pager || true
  echo "----- node version -----" >&2
  node -v || true
  exit 1
fi

if ! wait_for http://127.0.0.1:8080/api/health; then
  echo "ERROR: API runs on :8090 but nginx is not proxying /api/" >&2
  echo "  sudo nginx -t && sudo systemctl reload nginx" >&2
  exit 1
fi

echo ""
echo "=== Deployed ==="
echo "  Local:  http://127.0.0.1:8080"
echo "  Public: https://kpss.croupion.com"
echo "  Data:   ${DATA_DIR} (per-user JSON, served by kpss-api on :8090)"
