# Call Center CRM & Order Management Platform

Production-ready call center CRM with lead management, order processing, telephony
integrations (Exotel / Twilio / Knowlarity), and analytics dashboards.

## Stack

- **Backend:** NestJS 10 · Prisma 5 · PostgreSQL 16 · Redis · JWT + rotating refresh tokens · RBAC
- **Frontend:** Next.js 15 (App Router) · React 19 · Tailwind CSS v4
- **Infra:** Docker Compose · nginx · GitHub Actions

## Repository layout

```
apps/
  api/    NestJS backend + Prisma schema/seed
  web/    Next.js frontend
infra/
  nginx/  Reverse proxy config
docs/     Architecture & design docs
```

## Local development

```bash
# 1. Install (use --ignore-scripts on Windows paths containing '&')
npm install --ignore-scripts

# 2. Configure the API
cp apps/api/.env.example apps/api/.env
cp .env.example .env   # for docker-compose secrets

# 3. Start Postgres + Redis (Docker) or use local instances
docker compose up -d db redis

# 4. Migrate + seed
npm run db:migrate --workspace apps/api
npm run db:seed --workspace apps/api

# 5. Run
npm run dev:api    # http://localhost:3000  (Swagger at /api/v1/docs)
npm run dev:web    # http://localhost:3001
```

## Deploy (Docker Compose)

```bash
cp .env.example .env   # fill secrets (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, …)
docker compose up -d --build
```

nginx (optional) exposes the whole app on a single origin:

```bash
docker compose -f docker-compose.yml -f infra/nginx/docker-compose.nginx.yml up -d
```

## Key scripts

| Script | Purpose |
| --- | --- |
| `npm run dev:api` | API watch mode |
| `npm run dev:web` | Web dev server |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Apply schema migration |
| `npm run db:seed` | Seed admin/roles/permissions |

## Docs

See `docs/architecture.md` for the system design and module documentation.
