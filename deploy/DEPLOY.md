# Deploy to Raspberry Pi + Cloudflare Tunnel

Expose the KPSS dashboard from your home Raspberry Pi to the internet using **nginx** (local static server) and **Cloudflare Tunnel** (no router port forwarding, free HTTPS).

## What you need

| Item | Notes |
|------|--------|
| Raspberry Pi | Already set up with **Raspberry Pi Connect** (remote shell) |
| Cloudflare account | Free at [cloudflare.com](https://dash.cloudflare.com/sign-up) |
| Domain on Cloudflare | **croupion.com** (already connected) |
| Dev machine | This repo, Node.js, `rsync`, SSH to the Pi |

> **No custom domain?** Use a quick tunnel for testing: `cloudflared tunnel --url http://127.0.0.1:8080` — you get a random `*.trycloudflare.com` URL (changes each restart, not for production).

## Architecture

```
Phone / laptop anywhere
        │
        ▼
  Cloudflare edge (HTTPS)
        │
        ▼
  cloudflared on Pi  ──►  nginx :8080  ──┬─►  /var/www/kpss-dashboard (Vite dist/)
                                         └─►  /api/  ──►  kpss-api (Node :8090)
                                                              │
                                                              ▼
                                                  /var/lib/kpss-dashboard/*.json
```

Study data lives **on the Pi**, not in the browser. A small Node service
(`server/server.js`, run by the `kpss-api` systemd unit) stores one JSON file
per user under `/var/lib/kpss-dashboard`. nginx serves the static app and
proxies `/api/` to that service. There are two hardcoded users (Ahmet,
Kübişko) and no login — the app just picks which account it is.

---

## Step 1 — One-time setup on the Pi

Open **Raspberry Pi Connect → Remote shell**, or SSH:

```bash
git clone <your-repo-url> ~/kpss_dashboard
cd ~/kpss_dashboard
chmod +x deploy/setup-pi.sh
./deploy/setup-pi.sh
```

This installs nginx and cloudflared and configures nginx on port **8080**.

> The all-in-one `deploy/deploy-on-pi.sh` (run on the Pi) additionally installs
> Node, builds the app, and sets up the `kpss-api` storage service + data dir.
> Prefer it if you build directly on the Pi.

---

## Step 2 — Deploy the app from your dev machine

On the machine where you develop (replace with your Pi hostname or IP):

```bash
cd kpss_dashboard
./deploy/sync-to-pi.sh pi@raspberrypi.local
```

Or set `PI_HOST`:

```bash
PI_HOST=pi@192.168.1.42 ./deploy/sync-to-pi.sh
```

Verify on your home network: `http://<pi-ip>:8080`

---

## Step 3 — Permanent URL: https://kpss.croupion.com

### 3a. Login on the Pi (required once)

`cloudflared tunnel login` must finish **on the Raspberry Pi** so it creates `~/.cloudflared/cert.pem`. Logging in on your laptop is not enough unless you copy that file over.

On the **Pi**:

```bash
cloudflared tunnel login
```

Copy the URL from the terminal → open on phone/laptop → authorize → select **croupion.com**.

Verify:

```bash
ls ~/.cloudflared/cert.pem
```

**Alternative** — if you already logged in elsewhere:

```bash
# on dev machine
scp ~/.cloudflared/cert.pem croupion@homerasp:~/.cloudflared/
```

### 3b. Finish tunnel setup

On the **Pi**:

```bash
cd ~/kpss_dashboard
chmod +x deploy/finish-tunnel.sh
./deploy/finish-tunnel.sh
```

This script will:

1. Create the tunnel `kpss-dashboard` (if missing)
2. Add DNS `kpss.croupion.com` → tunnel (in Cloudflare automatically)
3. Write `/etc/cloudflared/config.yml`
4. Start `cloudflared` as a systemd service (survives reboots)

Permanent URL: **https://kpss.croupion.com**

### Manual setup (if you prefer)

```bash
cloudflared tunnel create kpss-dashboard
cloudflared tunnel route dns kpss-dashboard kpss.croupion.com
# then edit /etc/cloudflared/config.yml — see cloudflared-config.yml.example
sudo systemctl enable --now cloudflared
```

---

## Quick test (no domain)

On the Pi:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

Copy the printed `https://….trycloudflare.com` URL. Ctrl+C stops it.

---

## The storage API (data on the Pi)

The Node service stores per-user data under `/var/lib/kpss-dashboard`:

```bash
sudo systemctl status kpss-api          # is it running?
sudo journalctl -u kpss-api -f          # logs
curl http://127.0.0.1:8080/api/health   # {"ok":true,"users":["ahmet","kubisko"]}
ls /var/lib/kpss-dashboard              # ahmet.json, kubisko.json
```

Back up the whole thing by copying that folder:

```bash
sudo cp -r /var/lib/kpss-dashboard ~/kpss-backup-$(date +%F)
```

## Updating after code changes

**Front-end only** (HTML/CSS/JS) — from your dev machine:

```bash
./deploy/sync-to-pi.sh pi@raspberrypi.local
```

No restart needed — nginx serves files directly. Hard-refresh the browser if assets look cached.

**Server / API changes** (`server/server.js`) — on the Pi, pull and rerun the
all-in-one script (it restarts `kpss-api`):

```bash
cd ~/kpss_dashboard && git pull && ./deploy/deploy-on-pi.sh
```

---

## Troubleshooting

| Problem | Check |
|---------|--------|
| 502 from Cloudflare | `sudo systemctl status nginx cloudflared` — nginx must listen on 8080 |
| Blank page | `ls /var/www/kpss-dashboard` — should contain `index.html` and `assets/` |
| Tunnel not starting | `sudo journalctl -u cloudflared -f` |
| nginx error | `sudo nginx -t` |
| rsync permission denied | `sudo chown -R $USER:$USER /var/www/kpss-dashboard` on Pi |

---

## Security notes

- The app has **no login** — anyone with the URL can open it, pick either user, and read/write that user's data on the Pi.
- Strongly recommended: add **Cloudflare Access** (Zero Trust) to require email/Google login before reaching the site, since data now lives on the server.
- Use **Ayarlar → Dışa Aktar** in the app for a per-user JSON backup, or copy `/var/lib/kpss-dashboard` on the Pi for everything.
