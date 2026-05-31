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
  cloudflared on Pi  ──►  nginx :8080  ──►  /var/www/kpss-dashboard (Vite dist/)
```

Data stays in the browser (IndexedDB). The Pi only serves static files.

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

## Updating after code changes

From your dev machine:

```bash
./deploy/sync-to-pi.sh pi@raspberrypi.local
```

No restart needed — nginx serves files directly. Hard-refresh the browser if assets look cached.

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

- The app has **no login** — anyone with the URL can open it. Their data is still local to their browser.
- Optional: add **Cloudflare Access** (Zero Trust) to require email/Google login before reaching the site.
- Use **Ayarlar → Dışa Aktar** in the app to back up study data; each device/browser has its own IndexedDB.
