# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ui/package.json ./packages/ui/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/ui/ ./packages/ui/
COPY apps/web/ ./apps/web/

ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_IS_WEB=true \
    DB_DATA_DIR=/data/hujjah

WORKDIR /build/apps/web
RUN pnpm install --frozen-lockfile --no-symlinks
RUN pnpm build

FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/server.js ./

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_IS_WEB=true DB_DATA_DIR=/data/hujjah

CMD ["node", "server.js"]
