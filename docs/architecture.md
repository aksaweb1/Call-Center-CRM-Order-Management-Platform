# Call Center CRM & Order Management Platform — Architecture

## 1. Overview

A modular, production-ready SaaS CRM for call-center agents and managers.
Agents receive leads, call customers, create follow-ups, convert leads into
orders, and managers monitor performance via real-time dashboards.

- **Frontend:** Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui
  + TanStack Query + React Hook Form + Zod + Framer Motion + Recharts + Zustand
- **Backend:** NestJS + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
- **Auth:** JWT access + refresh tokens, RBAC + permission-based authorization
- **Telephony:** Replaceable adapter (Exotel, Twilio, Knowlarity)
- **Storage:** S3-compatible object storage
- **Notifications:** Firebase Cloud Messaging (push), Email, SMS, WhatsApp
- **Deploy:** Docker + Docker Compose + GitHub Actions + Nginx

## 2. Monorepo Layout

```
apps/
  api/     NestJS application (backend)
  web/     Next.js 15 application (frontend)
packages/                shared packages (future: contracts, ui, config)
docs/                    architecture, database, API docs
infra/                   docker-compose, nginx, ci, env examples
```

## 3. Clean Architecture (Backend)

Layered per module — controllers never contain business logic.

```
apps/api/src/
  modules/            every domain is an independent NestJS module
    <domain>/
      controllers/    HTTP layer (DTO validation, status codes)
      services/       application/business orchestration
      repositories/   data access (Prisma), repository pattern
      domain/         entities, value objects, domain services
      dto/            request/response DTOs + zod/class-validator schemas
      interfaces/     input ports (abstract contracts)
      <domain>.module.ts
  prisma/             schema.prisma, migrations, seed
  common/             guards, interceptors, filters, decorators, helpers
  config/             environment validation (Joi/zod)
```

## 4. Domain-Driven Modular Architecture

Each module owns its tables. Cross-module access happens only through
dedicated service APIs — modules communicate via their public service classes
(NestJS DI). Telephony providers are behind a `TelephonyProvider` interface so
Exotel/Twilio/Knowlarity are swappable without touching business logic.

## 5. Security

- Argon2 password hashing
- Access (short) + refresh (rotating, revocable) JWT tokens
- RBAC + granular permission-based guard (`@RequirePermissions(...)`)
- Helmet, CORS, global validation, rate limiting (@nestjs/throttler)
- SQL injection / XSS / CSRF protections
- Soft deletes (deletedAt) + full audit logging
- Encrypted secrets via env + Docker secrets

## 6. Database

PostgreSQL + Prisma, UUID PKs, FKs, indexes, transactions, optimistic locking
(version/updatedAt), soft deletes, seed data, migration scripts.

## 7. API

REST + Swagger. Global `ApiResponseImpl<T>` envelope, consistent error
handling, pagination/sorting/filtering/search, `X-Request-Id` tracing.

## 8. Telephony Adapter

```
interface TelephonyProvider {
  initiateCall(input): CallRequest
  getCall(id): CallDetails
  getRecording(callId): String
  handleWebhook(payload): CallEvent
  makeClikToCallNumber(): String
}
```

Providers: `ExotelProvider`, `TwilioProvider`, `KnowlarityProvider` selected via
`TELEPHONY_PROVIDER` env. Webhooks update call records automatically.

## 9. Notifications

A central `NotificationsService` fans out to channels (FCM push, Email, SMS,
WhatsApp). In-app Notification Center with unread counts via Redis/SSE.
BullMQ queue for async delivery + follow-up reminders.

## 10. Deployment

`infra/docker-compose.yml` for PostgreSQL + Redis + api + web + nginx with
health checks. GitHub Actions CI (lint, test, build, docker). Database backup
scripts, logging (pino), monitoring-ready health endpoints.