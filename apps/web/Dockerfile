# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ui/package.json ./packages/ui/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/ui/ ./packages/ui/
COPY apps/web/ ./apps/web/

ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_IS_WEB=true DB_DATA_DIR=/data/hujjah

WORKDIR /build/apps/web
RUN pnpm build

# better-sqlite3 needs to be rebuilt for linux/amd64
RUN cd /build/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 \
 && npx --yes node-gyp rebuild --release

FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends curl python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/public ./apps/web/public

# Copy the rebuilt better-sqlite3 native binary
COPY --from=builder --chown=nextjs:nodejs /build/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  /app/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_IS_WEB=true DB_DATA_DIR=/data/hujjah

WORKDIR /app/apps/web
CMD ["node", "server.js"]
