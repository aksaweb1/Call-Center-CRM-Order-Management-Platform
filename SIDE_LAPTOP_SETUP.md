# Side Laptop Setup — Production for Agents (Office WiFi)

This is your **Production** machine. Agents use it. Your own laptop is **Development** — you can break dev without agents feeling anything.

> **Side Laptop = Prod** (`http://192.168.1.50:3001`) — always ON, `main` branch
> **Your Laptop = Dev** (`http://localhost:3001`) — `develop` branch, you work here

---

## 1. Prepare the Side Laptop (do once)

**Requirements:** Windows 10/11, 8GB RAM, plugged to charger + UPS, same office WiFi as agents, Docker Desktop installed.

```powershell
# 1) Install
# - Node 20 https://nodejs.org
# - Git https://git-scm.com
# - Docker Desktop https://docs.docker.com/desktop/setup/install/windows-install/  (enable WSL2)

# 2) Make it never sleep
# Settings → System → Power → Screen sleep = Never
# Settings → System → Power → Lid close action = Do nothing (when plugged in)

# 3) Clone (on SIDE laptop)
git clone https://github.com/aksaweb1/Call-Center-CRM-Order-Management-Platform.git
cd Call-Center-CRM-Order-Management-Platform
git checkout main

# 4) Env for PROD (edit with Notepad)
copy .env.example .env
# Edit .env — set strong secrets and your office IP (find IP with ipconfig):
# POSTGRES_USER=callcenter
# POSTGRES_PASSWORD=choose-a-strong-one
# POSTGRES_DB=callcenter
# JWT_ACCESS_SECRET=put-a-long-random-64-char-string-here
# JWT_REFRESH_SECRET=put-another-long-random-64-char-string-here
# API_PORT=3000
# WEB_PORT=3001
# CORS_ORIGINS=http://192.168.1.50:3001,http://localhost:3001
# FRONTEND_URL=http://192.168.1.50:3001
# NEXT_PUBLIC_API_URL=http://192.168.1.50:3000/api/v1
# PUBLIC_API_URL=http://192.168.1.50:3000
# TELEPHONY_PROVIDER=TATA
# TATA_API_URL=https://api-smartflo.tatateleservices.com
# TATA_TOKEN=your-jwt-from-smartflow
# TATA_AGENT_NUMBER=your-did
# TATA_CALLER_ID=your-did

# 5) Find your WiFi IP
ipconfig   # → Wireless LAN adapter Wi-Fi → IPv4 Address → e.g. 192.168.1.50
# If that IP changes after reboot, reserve it in your router: DHCP → Static lease for this laptop's MAC

# 6) Run Prod (takes 2-3 mins first time)
docker compose up -d --build
docker compose ps   # all 4 should be Up (healthy)

# 7) Allow firewall (first call will trigger popup) → Allow on Private network
```

Test on the side laptop itself: `http://localhost:3001` → should show Login.

Test from another office laptop: `http://192.168.1.50:3001` → same Login.

> If agents see blank/CORS error: fix `CORS_ORIGINS` in `.env` to include the IP you just used, then `docker compose restart api`.

---

## 2. Agents — How to Use

1. Any office laptop → Chrome → `http://192.168.1.50:3001`
2. Login with Email + Password you created in **Employees** (ADMIN creates them)
3. Keep phone nearby (if Call source = Mobile) or allow mic (if Web dialer)

Create agents: On side laptop or your laptop, login as SUPER_ADMIN → **Employees** → **Add employee** → set Name/Email/Phone/Role/Team/Call source/Tata account → Add.

**Bookmark:** Ask agents to bookmark `http://192.168.1.50:3001` as `CRM`.

---

## 3. Your Laptop — Development (does NOT affect agents)

```bash
git clone <same repo>   # your work machine
git checkout -b develop
npm install --ignore-scripts
copy apps/api/.env.example apps/api/.env
# keep default localhost ports — don't change to 192.168.1.50

# run dev with hot-reload
npm run dev:api   # :3000
npm run dev:web   # :3001 → http://localhost:3001 for you only
```

You break `develop` all day — agents on `192.168.1.50:3001` feel nothing because it's a different machine.

---

## 4. Shipping an Update to Agents

```bash
# ON YOUR LAPTOP
git add .
git commit -m "feat: your change"
git push origin main   # or push develop then merge to main on GitHub

# ON SIDE LAPTOP (1 command after you push)
git pull origin main
docker compose up -d --build
# agents just refresh the page — no reinstall
```

---

## 5. Backup (Important — 10K records)

The DB lives in Docker volume `pgdata`. Back it up nightly.

**Windows (SIDE laptop):** Double-click `infra/backup.bat` (created for you) — it creates `backups\callcenter_YYYY-MM-DD.sql.gz`.

To auto-run daily: Task Scheduler → Create Task → Trigger Daily 02:00 → Action Start program `C:\...\infra\backup.bat`.

**Manual test now:**
```powershell
.\infra\backup.bat
dir backups
```

Keep at least one backup on Google Drive weekly.

Restore if needed: `docker exec -i callcenter-crm-db-1 psql -U callcenter callcenter < backups\callcenter_2026-08-26.sql`

---

## 6. 24/7 Tips for Side Laptop

- Keep charger + UPS plugged in, lid open
- Settings → Windows Update → Pause updates during work hours
- Docker Desktop → Settings → Start Docker Desktop when you log in = ON
- `docker compose` already has `restart: unless-stopped` — it comes back after reboot/power cut

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Other laptop cannot open `http://192.168.1.50:3001` | Firewall → Allow `Node.js` + `com.docker.backend` on Private. `ping 192.168.1.50` from other laptop must succeed. |
| Login → `CORS` error | Add that exact URL to `CORS_ORIGINS` in side laptop `.env`, then `docker compose restart api` |
| IP changed after reboot | Reserve IP in router (DHCP static lease) |
| Side laptop rebooted, CRM down | `docker compose ps` — if not Up, `docker compose up -d` |

Need help moving this to a real VPS later? Just say **deploy to cloud** — your `docker-compose.yml` + `infra/nginx` already supports it.
