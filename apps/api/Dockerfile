# ── Base image ────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
# Use npm's workspaces: the whole repo is copied and both apps installed.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include=optional

# ── API build ──────────────────────────────────────────────────
FROM base AS api-build
WORKDIR /app
COPY . .
RUN mkdir -p apps/web/public
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace @callcenter/api
RUN ls -la apps/api/dist/src/main.js && echo "api dist OK at apps/api/dist/src/main.js" || (echo "ls apps/api/dist:"; ls -la apps/api/dist; echo "ls dist:"; ls -la dist 2>/dev/null || echo "no /app/dist")

# ── API runtime ────────────────────────────────────────────────
FROM node:20-alpine AS api
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/package.json ./apps/api/package.json
COPY --from=api-build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
