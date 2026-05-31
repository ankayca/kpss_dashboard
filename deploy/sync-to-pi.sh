#!/usr/bin/env bash
# Run from your dev machine. Builds the app and rsyncs dist/ to the Pi.
#
# Usage:
#   ./deploy/sync-to-pi.sh pi@raspberrypi.local
#   PI_HOST=pi@192.168.1.50 ./deploy/sync-to-pi.sh
#
# Requires: npm, rsync, SSH access to the Pi (Raspberry Pi Connect remote shell works too).
set -euo pipefail

PI_HOST="${1:-${PI_HOST:-}}"
REMOTE_DIR="/var/www/kpss-dashboard"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${PI_HOST}" ]]; then
  echo "Usage: $0 pi@HOST   (or set PI_HOST=pi@HOST)" >&2
  exit 1
fi

echo "==> Building production bundle..."
cd "${REPO_ROOT}"
npm run build

echo "==> Syncing dist/ to ${PI_HOST}:${REMOTE_DIR} ..."
rsync -avz --delete \
  "${REPO_ROOT}/dist/" \
  "${PI_HOST}:${REMOTE_DIR}/"

echo "==> Done. Open http://$(echo "${PI_HOST}" | cut -d@ -f2):8080 on your LAN to verify."
echo "    (Cloudflare Tunnel URL is your public address once cloudflared is running.)"
