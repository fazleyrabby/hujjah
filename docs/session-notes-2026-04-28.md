# Session Notes — 2026-04-28

## UI Fixes

### Chain Graph Tree Visualization
- **File**: `packages/ui/src/NarratorGraph.tsx`
- Added GitHub-style tree connectors (`├──`, `└──`, `│`)
- Connected vertical lines showing sibling relationships
- Recursive `TreeNodeComponent` with `continuations` array tracking active branches
- Expand/collapse toggle with ▼/▶ buttons
- Leaf nodes show ↗ link button to narrator detail page
- First-level children expanded by default

### Mobile Nav Overflow
- **File**: `packages/ui/src/AppNav.tsx`
- Nav links scroll horizontally on small screens (hidden scrollbar)
- Right-side buttons use compact `p-1.5` on mobile, `p-2` on desktop
- Lang toggle uses `px-2` on mobile, `px-4` on desktop
- Added `min-w-0 flex-1` to left section to prevent overflow

### Sidebar z-index Fix
- **File**: `apps/web/app/page.tsx`
- Mobile overlay backdrop: `z-[55]`
- Sidebar aside: `z-[60]`
- Sticky header: `z-50`
- Sidebar now appears above header on mobile

### Floating Sidebar Toggle Button
- **File**: `apps/web/app/page.tsx`
- Restored `fixed top-[54px]` floating button to toggle surah list
- Shows "Surahs" label when sidebar is closed
- Removed duplicate inline toggle button from search bar area

### Hadith Page Translator Toggle
- **File**: `apps/web/app/hadith/page.tsx`
- Moved Classic/AI translator toggle from `AppNav` `extra` prop to content area above search bar
- Prevents header overcrowding on mobile

### ThemeProvider (Global Dark Mode)
- **New file**: `packages/ui/src/ThemeProvider.tsx`
- Centralized dark mode + font size state in React Context
- Syncs `localStorage` and `document.documentElement.classList`
- Settings pages now use `useTheme()` instead of local `useState`
- **Files updated**: `apps/web/app/layout.tsx`, `apps/tauri/app/layout.tsx`, both `settings/page.tsx`

## Deployment Fixes

### Docker Build Issues

#### 1. Static Files Not Serving (404 on `_next/static/chunks/*.js`)
**Root cause**: Next.js standalone output puts static files in `apps/web/.next/static`, but the Dockerfile copied them to `/app/.next/static` instead of `/app/apps/web/.next/static`.

**Fix in `apps/web/Dockerfile`**:
```dockerfile
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/public ./apps/web/public
```

#### 2. better-sqlite3 Native Bindings Missing
**Root cause**: The `better_sqlite3.node` binary was built in the builder stage but never copied to the runner stage. Container logs showed:
```
Could not locate the bindings file. Tried:
 → .../build/better_sqlite3.node
 → .../Release/better_sqlite3.node
```

**Fix in `apps/web/Dockerfile`**:
```dockerfile
# Copy the rebuilt better-sqlite3 native binary
COPY --from=builder --chown=nextjs:nodejs \
  /build/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  /app/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

Also added `python3 make g++` to runner stage for in-container rebuild fallback.

#### 3. SQLite "unable to open database file"
**Root cause**: Docker volume was mounted with `:ro` (read-only), but SQLite requires write access for WAL mode and journal files.

**Fix in `docker-compose.yml`**:
```yaml
volumes:
  - ${DB_DATA_DIR:-/data/hujjah}:${DB_DATA_DIR:-/data/hujjah}
# Removed :ro suffix
```

#### 4. DB Files Missing on VPS
**Root cause**: `/data/hujjah/` directory existed but was empty — DB files were never transferred.

**Fix**: Copied both `.db` files from local `apps/tauri/src-tauri/resources/` to VPS `/data/hujjah/`:
```bash
scp hujjah-quran.db signalstack:/tmp/
scp hujjah-hadith-core.db signalstack:/tmp/
sudo mv /tmp/hujjah-*.db /data/hujjah/
sudo chown -R 1001:1001 /data/hujjah
```

### Cloudflare Tunnel Setup
- Domain `hujjah.fazleyrabbi.xyz` routes through existing `signalstack` tunnel
- Config added to `/etc/cloudflared/config.yml`:
  ```yaml
  - hostname: hujjah.fazleyrabbi.xyz
    service: http://localhost:3002
  ```
- Tunnel restarted via `systemctl restart cloudflared`

## Deployment Checklist

```bash
# 1. Build image locally (buildx for linux/amd64)
docker buildx build --platform linux/amd64 --load -t hujjah-web:latest -f apps/web/Dockerfile .

# 2. Transfer image to VPS
docker save hujjah-web:latest | ssh signalstack "docker load"

# 3. Ensure DB files exist on host
ssh signalstack "ls -la /data/hujjah/"
# Should show: hujjah-quran.db, hujjah-hadith-core.db

# 4. Deploy
cd ~/hujjah-web && docker compose up -d --force-recreate

# 5. Verify
curl http://localhost:3002/api/health
curl http://localhost:3002/api/quran?action=surahs | head -c 100
curl http://localhost:3002/_next/static/chunks/0xbt0p7sc6bwe.js
```

## Known Issues

- **Turbopack NFT warning**: `Encountered unexpected file in NFT list` due to dynamic `path.join` in `web-db.ts`. Harmless but shows in build logs.
- **Phone blank page**: Was caused by static JS chunks returning 404. Fixed by correcting Dockerfile static file COPY path.
- **Mac DNS cache**: `hujjah.fazleyrabbi.xyz` may not resolve immediately after tunnel changes. Use `sudo killall -HUP mDNSResponder` or test with explicit IP.

## Files Changed

```
packages/ui/src/NarratorGraph.tsx      # Tree connectors, recursive rendering
packages/ui/src/AppNav.tsx              # Mobile overflow fixes
packages/ui/src/ThemeProvider.tsx       # NEW - Global theme context
packages/ui/src/index.ts                # Export ThemeProvider, useTheme
apps/web/app/layout.tsx                 # Wrap with ThemeProvider
apps/web/app/page.tsx                   # Floating toggle, z-index fixes
apps/web/app/hadith/page.tsx            # Translator toggle moved
apps/web/app/settings/page.tsx          # Use useTheme()
apps/web/app/chain/graph/page.tsx       # z-index fix
apps/tauri/app/layout.tsx               # ThemeProvider + theme script
apps/tauri/app/settings/page.tsx        # Use useTheme()
apps/web/Dockerfile                     # Static path, sqlite3 binary copy
apps/web/docker-compose.yml             # Remove :ro flag
scripts/deploy-web.sh                   # Image save/load flow
```
