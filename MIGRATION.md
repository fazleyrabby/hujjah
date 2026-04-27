# Hujjah Monorepo Migration

## Goal & Platform Targets

| Platform | How | Status |
|---|---|---|
| Web (browser) | `apps/web` — Next.js standalone + Docker | 🔨 In progress |
| macOS | `apps/tauri` — Tauri 2 native build | ⬜ Phase 2+ |
| Windows | `apps/tauri` — Tauri 2 native build | ⬜ Phase 2+ |
| Linux | `apps/tauri` — Tauri 2 native build | ⬜ Phase 2+ |
| iOS | `apps/tauri` — `pnpm tauri ios build` | ⬜ Phase 7 |
| Android | `apps/tauri` — `pnpm tauri android build` | ⬜ Phase 7 |

**Yes, the monorepo covers all platforms.** `packages/ui` is shared by every target. `apps/tauri` (Tauri 2.x already confirmed in `Cargo.toml`) handles all native targets including iOS and Android from the same codebase. `apps/web` handles the browser.

## Key Architectural Decisions

- **Monorepo = one source of truth for UI**: `packages/ui` (`@hujjah/ui`) shared across `apps/tauri` and `apps/web`. No duplicated components.
- **`output: 'export'` (Tauri) → `output: 'standalone'` (web)**: Tauri runs all DB calls client-side via Tauri IPC. Web uses Next.js API routes + `better-sqlite3` server-side.
- **`DBLike` interface already exists**: `{ select, execute }` in `lib/hadith-db.ts` decouples queries from the driver. Web just needs a new adapter — no SQL rewrites.
- **Tauri 2.x confirmed**: `tauri = "2.0.6"` in `Cargo.toml` — iOS + Android builds are available today.
- **AI chat is native-only**: llama.cpp is too heavy for mobile/web. Hidden via `hiddenRoutes` on web, feature-flagged on mobile.

## Platform Feature Matrix

| Feature | Web | macOS/Win/Linux | iOS/Android |
|---|---|---|---|
| Quran browse + audio | ✅ | ✅ | ✅ |
| Hadith search | ✅ | ✅ | ✅ |
| Chain explorer | ✅ | ✅ | ✅ |
| AI chat (llama.cpp) | ❌ (server only) | ✅ | ❌ (too heavy) |
| DB download gate | ❌ (DB in container) | ✅ | ✅ (app bundle) |
| Offline use | ❌ | ✅ | ✅ |

## Backup / Branch

```bash
git tag app-v1                    # snapshot of original state
git tag v0.1.0-pre-monorepo       # semantic label
git checkout -b refactor/monorepo-migration
```

---

## Final Directory Structure

```
hujjah/                          ← monorepo root
├── pnpm-workspace.yaml
├── package.json                 ← root (scripts only)
├── MIGRATION.md                 ← this file
├── packages/
│   └── ui/                      ← @hujjah/ui (shared by ALL platforms)
│       └── src/
│           ├── index.ts
│           ├── AppNav.tsx        ← hiddenRoutes prop for web/mobile
│           ├── NarratorGraph.tsx
│           ├── LinkedVerseText.tsx
│           ├── ErrorBoundary.tsx
│           ├── types.ts          ← NarratorNode, NarratorEdge
│           └── ui/              ← ArabicText, ContentCard, etc.
├── apps/
│   ├── tauri/                   ← ALL native targets (was: desktop)
│   │   ├── app/                 ← Next.js pages (output:export)
│   │   ├── components/          ← FeatureGate, ChatWidget, AudioPlayer (native-only)
│   │   ├── lib/                 ← DB + AI code (tauri-plugin-sql, llama.ts)
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── src-tauri/           ← Rust core, works for Win/Mac/Linux/iOS/Android
│   │   └── next.config.mjs      ← output:'export', transpilePackages:['@hujjah/ui']
│   └── web/                     ← Browser + Docker
│       ├── app/
│       │   ├── api/
│       │   │   ├── quran/route.ts
│       │   │   ├── hadith/route.ts
│       │   │   └── chain/route.ts
│       │   ├── page.tsx
│       │   ├── hadith/page.tsx
│       │   ├── chain/page.tsx
│       │   ├── chat/page.tsx    ← "available in native app" stub
│       │   └── layout.tsx       ← hiddenRoutes={['/chat']}
│       ├── lib/
│       │   ├── web-db.ts        ← better-sqlite3 DBLike adapter
│       │   └── types.ts         ← HadithResult, etc.
│       ├── components/
│       │   └── FeatureGate.tsx  ← pass-through (no Tauri)
│       ├── data/                ← gitignored; symlinks to DB files
│       ├── Dockerfile
│       └── next.config.mjs     ← output:'standalone'
└── scripts/
    └── deploy-web.sh
```

---

## Phases & Status

### Phase 0 — Safety ✅ DONE
- [x] `git tag app-v1` + `git tag v0.1.0-pre-monorepo`
- [x] `git checkout -b refactor/monorepo-migration`
- [x] Delete `package-lock.json` (keep `pnpm-lock.yaml`)
- [x] Create `pnpm-workspace.yaml`
- [x] `pnpm install` verified

### Phase 1 — Extract `packages/ui` ✅ DONE
- [x] `packages/ui/package.json` — `@hujjah/ui`, peer deps `next>=16 react>=19`
- [x] `packages/ui/tsconfig.json` — `"jsx": "preserve"`
- [x] `packages/ui/src/types.ts` — `NarratorNode`, `NarratorEdge`
- [x] Copied: `AppNav.tsx`, `NarratorGraph.tsx`, `LinkedVerseText.tsx`, `ErrorBoundary.tsx`
- [x] Copied: `ui/ArabicText.tsx`, `ContentCard.tsx`, `LoadingSkeleton.tsx`, `ResponsiveLayout.tsx`, `SearchInput.tsx`
- [x] `NarratorGraph.tsx` import: `@/lib/chain-db` → `./types`
- [x] `AppNav.tsx` — `hiddenRoutes?: string[]` prop added
- [x] `packages/ui/src/index.ts` barrel export
- [x] `pnpm install` — `@hujjah/ui` resolvable via workspace
- **NOT included**: `AudioPlayer.tsx` (Tauri IPC + context), `FeatureGate.tsx` (Tauri invoke), `ChatWidget.tsx` (llama.ts)

### Phase 2 — Move to `apps/tauri/` ⬜ TODO
Move root → `apps/tauri/`:
- `app/`, `components/`, `contexts/`, `hooks/`, `lib/`, `styles/`, `workers/`, `public/`
- `next.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `postcss.config.mjs`, `.env.local`
- `src-tauri/` → `apps/tauri/src-tauri/`

`apps/tauri/package.json`:
```json
{ "name": "@hujjah/tauri", "dependencies": { "@hujjah/ui": "workspace:*" } }
```

`apps/tauri/src-tauri/tauri.conf.json`:
- `beforeDevCommand`: `pnpm dev`
- `beforeBuildCommand`: `pnpm build`
- `frontendDist: "../dist"` — unchanged (relative to src-tauri/)

`apps/tauri/next.config.mjs`: add `transpilePackages: ['@hujjah/ui']`

`apps/tauri/tsconfig.json`: `"paths": { "@/*": ["./*"] }` resolves to `apps/tauri/`

**Checkpoint**: `cd apps/tauri && pnpm tauri dev` works.

### Phase 3 — Switch Tauri App to `@hujjah/ui` Imports ⬜ TODO
```ts
// Before
import AppNav from '@/components/AppNav';
// After
import { AppNav } from '@hujjah/ui';
```
Affected pages: `app/page.tsx`, `app/hadith/page.tsx`, `app/chain/page.tsx`, `app/settings/page.tsx`, `app/chat/page.tsx`

Delete duplicates from `apps/tauri/components/` (keep: `FeatureGate.tsx`, `ChatWidget.tsx`, `AudioPlayer.tsx`)

**Checkpoint**: `pnpm tauri build` — clean binary.

### Phase 4 — Create `apps/web/` ⬜ TODO (PRIORITY — ship first)

#### 4a. Config files
- `apps/web/package.json` — `@hujjah/ui workspace:*`, `better-sqlite3 ^11`, Next 16, React 19
- `apps/web/next.config.mjs` — `output: 'standalone'`, `transpilePackages: ['@hujjah/ui']`
- `apps/web/.env.local` — `NEXT_PUBLIC_IS_WEB=true`, `DB_DATA_DIR=./data`

#### 4b. DB Adapter (`apps/web/lib/web-db.ts`)
```ts
import Database from 'better-sqlite3';
// Synchronous better-sqlite3 wrapped as async DBLike
// Module-level singletons, readonly: true
export const getWebHadithDB = () => (hadithDb ??= makeAdapter('hujjah-hadith-core.db'));
export const getWebQuranDB  = () => (quranDb  ??= makeAdapter('hujjah-quran.db'));
```

#### 4c. API Routes
- `app/api/quran/route.ts` — `?action=surahs|verses|search`
- `app/api/hadith/route.ts` — `?action=books|search|byBook`
- `app/api/chain/route.ts` — `?action=search|edges|graph|hadithsForEdge`

#### 4d. Pages
Copy from current root `app/`, replace direct DB calls with `fetch('/api/...')`.

- `FeatureGate.tsx` — pass-through: `return <>{children}</>`
- `chat/page.tsx` — stub: "AI chat is available in the native app"
- `layout.tsx` — `hiddenRoutes={['/chat']}` on AppNav

#### 4e. Dev symlinks
```bash
mkdir -p apps/web/data
ln -sf ../../src-tauri/resources/hujjah-quran.db apps/web/data/
ln -sf ../../src-tauri/resources/hujjah-hadith-core.db apps/web/data/
# (paths updated to apps/tauri/ after Phase 2)
```

**Checkpoint**: `pnpm --filter @hujjah/web dev` → `localhost:3000` — Quran, Hadith, Chain load. No Tauri imports.

### Phase 5 — Docker + Deploy ⬜ TODO

`apps/web/Dockerfile` — multi-stage (node:22-alpine):
1. Builder: `pnpm install --frozen-lockfile` + `pnpm build`
2. Runner: `.next/standalone` + static + public, `USER nextjs`, port 3001

`scripts/deploy-web.sh`:
```bash
docker build → docker save | ssh $HOST docker load
ssh $HOST: stop old → run new with -v /data/hujjah:/data/hujjah:ro
curl localhost:3001/api/health  # health check
```

Push DB files once:
```bash
scp src-tauri/resources/hujjah-*.db $HOST:/data/hujjah/
```

### Phase 6 — Root Cleanup ⬜ TODO
Root `package.json` becomes pure monorepo scripts:
```json
{
  "name": "hujjah-monorepo",
  "scripts": {
    "dev:tauri":  "pnpm --filter @hujjah/tauri tauri dev",
    "dev:web":    "pnpm --filter @hujjah/web dev",
    "build:web":  "pnpm --filter @hujjah/web build",
    "tauri:build": "pnpm --filter @hujjah/tauri tauri build"
  }
}
```

### Phase 7 — Mobile (iOS + Android) ⬜ FUTURE
Tauri 2.x already supports mobile from `apps/tauri/`. After Phase 2-3 are stable:

**Blockers to fix before mobile build:**
1. `tauri-plugin-single-instance` — desktop-only, must be feature-flagged in `Cargo.toml`:
   ```toml
   [target.'cfg(not(any(target_os = "ios", target_os = "android")))'.dependencies]
   tauri-plugin-single-instance = "2"
   ```
2. AI chat — hide on mobile via `hiddenRoutes` or platform detection
3. DB paths — Tauri mobile uses sandboxed app data dir, needs `appDataDir()` not hardcoded paths

**Build commands (after Xcode/Android Studio setup):**
```bash
pnpm --filter @hujjah/tauri tauri ios init
pnpm --filter @hujjah/tauri tauri ios build

pnpm --filter @hujjah/tauri tauri android init
pnpm --filter @hujjah/tauri tauri android build
```

---

## Critical Files Reference

| File | Role |
|---|---|
| `lib/hadith-db.ts` (→ `apps/tauri/lib/`) | SQL queries to copy into web API routes |
| `lib/chain-db.ts` (→ `apps/tauri/lib/`) | Chain SQL queries |
| `lib/db.ts` (→ `apps/tauri/lib/`) | `DBLike` interface — web adapter must match |
| `src-tauri/Cargo.toml` | `tauri = "2.0.6"` — iOS/Android builds available |
| `src-tauri/tauri.conf.json` | Update `beforeDevCommand`/`beforeBuildCommand` to `pnpm` |
| `packages/ui/src/AppNav.tsx` | `hiddenRoutes` prop — use in web layout + mobile |
| `packages/ui/src/types.ts` | `NarratorNode`, `NarratorEdge` — keep in sync with chain-db.ts |

## Verification Checklist

**Web (Priority):**
- [ ] `pnpm --filter @hujjah/web dev` → `localhost:3000` loads
- [ ] Quran, Hadith, Chain pages work with real data
- [ ] Chat stub shows "available in native app"
- [ ] `grep -r "@tauri-apps" apps/web/` → no results
- [ ] Docker build succeeds, runs at `:3001`

**Native (after Phase 2-3):**
- [ ] `cd apps/tauri && pnpm tauri dev` works
- [ ] `pnpm tauri build` → `.dmg`/`.exe`/`.AppImage`
- [ ] AI chat, DB download gate, audio all work

**Mobile (Phase 7):**
- [ ] `pnpm tauri ios build` — no `single-instance` crash
- [ ] `pnpm tauri android build` — APK generated
