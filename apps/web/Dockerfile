# syntax=docker/dockerfile:1

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Install deps (layer-cached until lockfile changes)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ui/package.json ./packages/ui/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/ui/ ./packages/ui/
COPY apps/web/ ./apps/web/

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_IS_WEB=true

RUN pnpm --filter @hujjah/web build

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

# better-sqlite3 is a native addon — needs to stay in the process that opens the DB.
# next/standalone traces and bundles it automatically into .next/standalone/node_modules/.

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

WORKDIR /app

# Standalone output already contains everything next.js needs
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/public ./public

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_IS_WEB=true \
    DB_DATA_DIR=/data/hujjah

# standalone mode: server.js is the entrypoint
CMD ["node", "server.js"]
