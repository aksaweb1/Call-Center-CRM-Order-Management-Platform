# ── Base image ────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
# Use npm's workspaces: the whole repo is copied and both apps installed.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include=optional

# ── API build ──────────────────────────────────────────────────
FROM base AS api-build
COPY . .
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace apps/api

# ── API runtime ────────────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/package.json ./apps/api/package.json
COPY --from=api-build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]