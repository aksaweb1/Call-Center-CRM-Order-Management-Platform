# Production Rules — Call Center CRM (Future-Proof)

> Read this before you `git pull` or `docker compose` on the **side laptop (PROD)**.
> One wrong flag (`-v`) deletes all live customer data.

---

## 1. Golden Rule

**Code = Git (safe to overwrite) | Data = Docker Volume `pgdata` (never overwrite prod)**

*   Pushing code **never** deletes data — if you use the commands in this doc.
*   Pulling a DB dump from **dev → prod after go-live WILL delete** live leads/orders/passwords. **Never do it.**

---

## 2. Where Everything Lives

| What | Where | Git? | Survives `docker compose down`? |
|---|---|---|---|
| Code (`apps/api`, `apps/web`) | GitHub `main` / `dev` | Yes | Yes (pulled) |
| `SIDE_LAPTOP_SETUP.md`, `PRODUCTION_RULES.md` | GitHub | Yes | Yes |
| `.env` (JWT secrets, DB passwords, `TATA_TOKEN`) | **Only on each laptop** (`C:\...\Call Center...\.env`) | **NO** (gitignored) | Yes (file stays) |
| **Live Data (10K+ customers, leads, orders, passwords)** | Docker volume `pgdata` on **side laptop** | **NO** | **Yes, unless you use `-v`** |
| `backups/callcenter_*.sql.gz` | Side laptop `backups/` + Google Drive | No | Yes |

---

## 3. Your Two Machines

| Machine | Branch | URL | DB | Purpose |
|---|---|---|---|---|
| **Your laptop (DEV)** | `dev` | `http://localhost:3001` | `callcenter` on `5433` (`callcenter:change-me`) — **fake/test data** | You break it all day |
| **Side laptop (PROD)** | `main` | `http://192.168.1.50:3001` (use `ipconfig` IP) | `callcenter` on `5432` (`callcenter:change-me`) — **real 10K+ live data** | Agents work here |

Agents **only** use side laptop's IP. They never see `dev`.

---

## 4. How to Ship Code (No Data Loss)

**On YOUR laptop (dev):**
```bash
git checkout dev
# ... code, test on http://localhost:3001 with fake data ...
git add .
git commit -m "feat: describe your change"
git push origin dev
# when tested and okay:
git checkout main
git merge dev
git push origin main
```

**On SIDE laptop (prod) — after you pushed to `main`:**
```powershell
cd C:\Users\DELL\crm\Call-Center-CRM-Order-Management-Platform
git checkout main
git pull origin main
docker compose up -d --build
docker compose ps   # api, web, db, redis must be Up
docker compose logs api --tail 20  # → Nest application successfully started
```
*   This rebuilds **only code** (`api`/`web` images). `pgdata` is untouched. Live leads/orders stay.
*   `npx prisma migrate deploy` runs auto inside `api` container — it **adds** columns/tables, never drops live rows.

**Check:** Refresh `http://192.168.1.50:3001` on any office laptop — new feature appears, old data still there.

---

## 5. Data Rules (The Most Important)

### 5.1 Never do this on PROD (side laptop)
```bash
docker compose down -v              # -v DELETES pgdata → all live data gone
docker system prune --volumes -f    # deletes volumes
Get-Content C:\temp\full10k.sql | docker exec -i callcenter-crm-db-1 psql ...  # overwrites live data with old dev dump
```

### 5.2 How to add new data after go-live
*   **New Product / Team / Role:** Add it **via CRM UI on side laptop** (Production) — not by dumping dev DB.
*   **New Agent:** Add via **Employees** on side laptop.
*   **Bulk leads:** Use **Leads → Bulk Import** CSV on side laptop.
*   **If you really need the same new product on both:** Add a small Prisma migration/seed that `upsert`s only that row, push it via Git — don't dump the whole DB.

### 5.3 How to get prod data to dev for testing (safe direction)
```powershell
# On SIDE laptop (prod) — dump live data
$env:PGPASSWORD='change-me'
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U callcenter -h localhost -p 5432 -d callcenter --clean --if-exists --no-owner --no-acl > C:\temp\prod_for_dev.sql

# Copy C:\temp\prod_for_dev.sql to DEV laptop via USB / http.server, then on DEV:
# Wipe dev Docker DB and restore prod snapshot (dev is disposable)
docker exec -i callcenter-crm-db-1 psql -U callcenter -d callcenter -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
Get-Content C:\temp\prod_for_dev.sql | docker exec -i callcenter-crm-db-1 psql -U callcenter -d callcenter
docker compose restart api
```
This **overwrites dev** with prod's real data for testing — never the reverse.

### 5.4 Passwords
*   Passwords are hashed (`argon2`) in `User.passwordHash` **inside the DB**, not in code.
*   After the first 10K copy, both DBs had `Admin@12345` for `admin@callcenter.local`. If an agent on side changes his password to `Renu@2025`, and you later restore dev's old dump to side, you **reset his password back** and **delete** orders he created in between.
*   **After go-live, never restore dev → prod.** If you need to reset a single password, do it via **Employees → Edit → Save** (or `npx prisma` script for one user), not a full dump.

---

## 6. Backup (Do Not Skip)

**Side laptop (prod) — already created `infra/backup.bat`:**
*   Double-click `infra\backup.bat` → creates `backups\callcenter_YYYY-MM-DD.sql.gz`
*   Auto keeps last 14 days, copies to `Google Drive` if installed.

**Make it daily:** Task Scheduler → Create Task → Trigger Daily 02:00 → Action Start program `C:\...\infra\backup.bat`.

**Test restore once a month** on dev laptop (see 5.3) to be sure backups work.

**Keep one backup off-site weekly** (Google Drive / USB).

---

## 7. Secrets (.env) — Never Push

*   `.env` at repo root and `apps/api/.env`, `apps/web/.env.local` are **gitignored**.
*   Dev and Prod **must have different** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`.
*   If `JWT` leaks, anyone can forge admin tokens. Generate strong ones:
    ```powershell
    -join ((33..126) | Get-Random -Count 64 | % {[char]$_})
    ```
*   `TATA_TOKEN` / `TATA_AGENT_NUMBER` / `TATA_CALLER_ID` are in `apps/api/.env` on side laptop only. Rotate `TATA_TOKEN` via Smartflow portal when it expires (JWT `exp` ~ Sept 2026).

---

## 8. Migrations (Schema Changes)

*   When you add a column (e.g. `User.callDevice`), create a migration on dev: `npx prisma migrate dev --name add_call_device` → commit `prisma/migrations/...` → push to `main` → `docker compose up -d --build` on side auto-runs `prisma migrate deploy`.
*   Migrations are **additive** — they add columns with defaults, never drop live data. **Never** `DROP COLUMN` on prod without a backup.
*   Check `docker compose logs api` after deploy — it must say `4 migrations found` → `No pending migrations` or `Applied ...` — never `Error`.

---

## 9. Update Checklist (Use Every Time)

**Before update (on side laptop):**
- [ ] `infra\backup.bat` → `backups\...sql.gz` exists and is recent
- [ ] Tell agents: "CRM will restart for 30s at HH:MM"

**Update:**
- [ ] `git pull origin main`
- [ ] `docker compose up -d --build` (no `-v`)
- [ ] `docker compose ps` → 4 Up, `docker compose logs api --tail 20` → `Nest application successfully started`

**After update:**
- [ ] Refresh `http://192.168.1.50:3001` on one agent laptop → new feature visible, old data still there
- [ ] Test login `admin@callcenter.local / Admin@12345` and one `Call now`

**If anything breaks:** `docker compose logs api --tail 50` → paste here, or `git reset --hard HEAD~1 && docker compose up -d --build` to rollback code (data stays).

---

## 10. Emergency Recovery

*   **Accidentally did `down -v` and DB is empty:** `Get-Content backups\latest.sql.gz | Expand-Archive ...` → `Get-Content backups\latest.sql | docker exec -i callcenter-crm-db-1 psql -U callcenter -d callcenter` → `docker compose restart api`
*   **Side laptop dies:** Buy any new laptop, `git clone`, copy latest `backups\*.sql.gz` via USB, restore as above — back in 10 mins.

---

## 11. FAQ

**Q: I changed code on dev, do I need to copy data again to side?**
No. Code and data are separate. Just `git push` code, `docker compose up -d --build` on side — data stays.

**Q: I added 5 new products on dev, how to get them on side without overwriting side's 100 new orders?**
Add them via UI on side, or create a tiny seed/migration that `upsert`s only those 5 SKUs and push it.

**Q: Can agents use it from home?**
Only if side laptop is on a public IP or you set up Cloudflare Tunnel / TailScale. Otherwise office WiFi only.

---

*Last updated: 2026-09-03 — branch `main` is prod, `dev` is your workshop. Stay on `dev` for work.*
