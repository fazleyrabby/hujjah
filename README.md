# Hujjah

Privacy-first, offline-capable Islamic research engine. Search the Quran in English and Bengali, explore Kutub al-Sittah hadith with full sanad chains — 100% offline, zero external APIs.

> **Monorepo**: `apps/tauri` (native desktop) + `apps/web` (browser) share `packages/ui`.

## Stack

- **Next.js 16** + **React 19** + **Tailwind CSS v4**
- **Tauri 2.0** — Cross-platform native app shell (macOS, Windows, Linux, iOS, Android)
- **Native SQLite** via `@tauri-apps/plugin-sql` (desktop) / `better-sqlite3` (web)
- **FTS5** full-text search with `unicode61` tokenizer
- **Transformers.js** — Local ONNX model for embeddings (BGE-M3)
- **llama.cpp** — Local GGUF inference server (llama-server) for text generation
- **pnpm workspaces** — Monorepo with shared `@hujjah/ui` package

## Development

This is a **pnpm monorepo**. All commands run from the repo root.

```bash
# Install dependencies for all workspaces
pnpm install

# --- Web (browser) ---
pnpm --filter @hujjah/web dev        # http://localhost:3000
pnpm --filter @hujjah/web build      # Standalone output in apps/web/.next/standalone

# --- Tauri (native desktop) ---
pnpm --filter @hujjah/tauri dev      # Start Tauri dev mode
pnpm --filter @hujjah/tauri build    # Production static export
pnpm --filter @hujjah/tauri tauri build  # Build native .dmg/.exe/.AppImage

# --- Tests ---
pnpm --filter @hujjah/tauri test:run # Vitest suite (search-utils, AI, embeddings)
npx tsc --noEmit                     # TypeScript check (all packages)
```

### Web App Quick Start

```bash
# 1. Symlink DB files (one-time setup)
mkdir -p apps/web/data
ln -sf ../../apps/tauri/src-tauri/resources/hujjah-quran.db apps/web/data/
ln -sf ../../apps/tauri/src-tauri/resources/hujjah-hadith-core.db apps/web/data/

# 2. Install + build native module
pnpm install
# Approve better-sqlite3 build when prompted, or:
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npx node-gyp rebuild

# 3. Run dev server
pnpm --filter @hujjah/web dev
```

### Tauri App Quick Start

```bash
# 1. Ensure DB files exist in src-tauri/resources/
ls apps/tauri/src-tauri/resources/hujjah-quran.db
ls apps/tauri/src-tauri/resources/hujjah-hadith-core.db

# 2. Run dev mode
pnpm --filter @hujjah/tauri tauri dev
```

## Monorepo Structure

```
hujjah/
├── apps/
│   ├── tauri/              # Native desktop app (Next.js + Tauri 2.0)
│   │   ├── app/            # Next.js pages (output: export)
│   │   ├── components/     # AudioPlayer, ChatWidget, FeatureGate (native-only)
│   │   ├── hooks/          # useChat, useQuranAudio, useRAG
│   │   ├── lib/            # DB queries, AI pipeline, mocks
│   │   ├── contexts/       # AudioProvider, ChatProvider
│   │   ├── workers/        # embedding.worker.ts, generation.worker.ts
│   │   ├── src-tauri/      # Rust core + resources (DB files, models)
│   │   └── vitest.config.ts
│   └── web/                # Browser app (Next.js standalone + Docker)
│       ├── app/            # Next.js App Router pages
│       │   ├── api/        # Server-side API routes (quran, hadith, chain, health)
│       │   ├── page.tsx
│       │   ├── hadith/page.tsx
│       │   ├── chain/page.tsx
│       │   ├── chat/page.tsx    # Stub: "AI chat available in native app"
│       │   └── settings/page.tsx
│       ├── lib/web-db.ts   # better-sqlite3 adapter (DBLike interface)
│       ├── data/           # Symlinked DB files (gitignored)
│       └── Dockerfile
├── packages/
│   └── ui/                 # Shared component library (@hujjah/ui)
│       ├── src/
│       │   ├── AppNav.tsx
│       │   ├── NarratorGraph.tsx
│       │   ├── LinkedVerseText.tsx
│       │   ├── ErrorBoundary.tsx
│       │   ├── types.ts
│       │   └── ui/         # ArabicText, ContentCard, LoadingSkeleton, etc.
│       └── package.json
├── scripts/
│   └── deploy-web.sh       # Docker build + deploy to remote host
├── pnpm-workspace.yaml
└── package.json
```

## Data

### Database Files

All DB files live in `apps/tauri/src-tauri/resources/` and are shared across platforms:

| File | Contents |
|---|---|
| `hujjah-quran.db` | 6,236 verses, 68K+ translations, FTS5, embeddings |
| `hujjah-hadith-core.db` | 36K Kutub al-Sittah hadith, FTS5, narrators, edges |
| `hujjah-hadith-research.db` | 615K additional hadith (downloadable tier) |

**Web dev**: Symlink from `apps/tauri/src-tauri/resources/` → `apps/web/data/`
**Docker deploy**: Mount host volume `-v /data/hujjah:/data/hujjah:ro`

### Building Databases

Source files are **not** included in the repo. Place them in a resources directory, then:

```bash
# Quran
npx ts-node scripts/migrate-db.ts          # Schema (surahs, FTS5, embeddings)
npx ts-node scripts/migrate-tanzil-ai.ts   # Load Tanzil translations
npx ts-node scripts/generate-embeddings.ts # Vector embeddings

# Hadith
npm run build:hadith                       # Kutub al-Sittah (~36K)
npm run build:hadith:full                  # Full 650K corpus (~2.4GB)
python3 scripts/split-hadith-tiers.py      # Core + Research split
npx ts-node scripts/import-github-hadith-translations.ts
```

## Architecture

| Layer | Storage | Use Case |
|---|---|---|
| Frontend | Next.js 16 | UI, search, surah navigation, chat |
| Desktop Shell | Tauri 2.0 Rust | Native OS integration, file access, audio cache |
| Web Server | Next.js API Routes + better-sqlite3 | Server-side DB queries for browser |
| Quran DB | SQLite `hujjah-quran.db` | 6,236 verses, 68K+ translations, FTS5, vectors |
| Hadith DB | SQLite `hujjah-hadith-core.db` | 36K Kutub al-Sittah hadith, FTS5, narrators |
| Hadith DB | SQLite `hujjah-hadith-research.db` | 615K additional hadith (downloadable) |
| Embedding | Local ONNX `bge-m3` | 1024-dim multilingual embeddings |
| LLM | Local GGUF via llama-server (Qwen2.5-0.5B / Qwen2.5-1.5B) | Text generation for AI chatbot |

### Platform Feature Matrix

| Feature | Web | Desktop | Mobile (future) |
|---|---|---|---|
| Quran browse + search | ✅ | ✅ | ✅ |
| Hadith search + vault | ✅ | ✅ | ✅ |
| Chain explorer | ✅ | ✅ | ✅ |
| AI chat (llama.cpp) | ❌ | ✅ | ❌ (too heavy) |
| Audio playback + caching | ❌ | ✅ | ✅ |
| Offline use | ❌ | ✅ | ✅ |

## Search Features

- **Reference Jump**: Type `2:255` to go directly to Ayat al-Kursi
- **Surah Navigation**: Click any surah name in the sidebar
- **Keyword Search**: FTS5 full-text search with highlighted snippets
- **Auto Language Detection**: Automatically switches between English and Bengali FTS5 index based on input script
- **Semantic Search**: Local AI embedding search via BGE-M3 (desktop only)
- **Translator Selector**: Switch between Classic (GitHub) and AI (Qwen) translations
- **Hadith Domain**: Toggle to Quran or Hadith; use `@hadith prayer` to route hadith search directly

## Audio Features (Desktop Only)

- **Play Surah**: Global play button starts from ayah 1 with auto-next
- **Per-Ayah Play**: Individual play buttons on each verse card
- **Pause / Resume / Stop**: Full audio controls in the surah header
- **Local Caching**: Audio cached via Tauri FS, streams from everyayah.com CDN
- **Surah-Level Seek**: Draggable progress bar across entire surah

## AI Chat (Desktop Only)

- **Dedicated /chat Page**: Full-screen WhatsApp-style UI with persistent thread sidebar (up to 15 threads)
- **Floating Chat Widget**: Bottom-right toggle for quick access
- **Tiered Models**: 0.5B Q4 for mobile (<4GB RAM), 1.5B Q4 for desktop — auto-detected
- **Apple Silicon GPU**: `-ngl 99` offload on M1/M2/M3 for zero UI freeze
- **RAG Pipeline**: Query → embed (BGE-M3) + FTS5 (Quran + Hadith) → retrieve → generate
- **Bilingual**: Responses in English or Bengali based on your language toggle
- **Source Citations**: Every AI response shows referenced surah:ayah or hadith book + number
- **100% Offline**: GGUF models served via local llama-server — no data leaves device
- **Per-Message Translation**: Language toggle shows loading spinner inside each message
- **Source Navigation**: Click verse refs in chat to navigate to surah

## Hadith Grading

Hadith authenticity is graded by sanad chain length (shorter = stronger):

| Grade | Sanad Length | Color | Description |
|---|---|---|---|
| **Sahih** | 1-3 narrators | 🟢 Emerald | Highly authentic |
| **Hasan** | 4-5 narrators | 🟡 Amber | Good authenticity |
| **Standard** | 6+ narrators | ⚪ Gray | Standard grading |

## Pages

| Route | Purpose | Platforms |
|---|---|---|
| `/` | Search, surah reading, audio, AI chat | All |
| `/chat` | Full-screen AI chatbot with thread history | Desktop only |
| `/about` | Data sources, privacy, links | All |
| `/settings` | Appearance, layout, font size (web: minimal; desktop: DB stats, model status) | All |
| `/chain` | Sanad chain explorer — search narrators, browse teachers/students, view hadith graphs | All |
| `/hadith` | Hadith vault — browse all 6 books with translations and grading | All |

## Docker Deploy (Web)

```bash
# Build image (linux/amd64 for VPS)
docker buildx build --platform linux/amd64 --load -f apps/web/Dockerfile -t hujjah-web:latest .

# Transfer to VPS and deploy
docker save hujjah-web:latest | ssh signalstack "docker load"
ssh signalstack "cd ~/hujjah-web && docker compose up -d --force-recreate"

# Or use deploy script (requires SSH access to host)
./scripts/deploy-web.sh [HOST]
```

### Prerequisites on Host

The **DB files must exist on the host** before starting the container:

```bash
# On VPS
sudo mkdir -p /data/hujjah
sudo cp hujjah-quran.db hujjah-hadith-core.db /data/hujjah/
sudo chown -R 1001:1001 /data/hujjah
```

### Docker Image Details

- Multi-stage `node:22-slim` build
- Container port: `3000` (map to host port, e.g. `3002`)
- Mounts DB files from host volume `/data/hujjah` (**must be writable** for SQLite WAL)
- Includes native `better-sqlite3` binary copied from builder stage
- Health check at `/api/health`

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Blank white page | `_next/static/chunks/*.js` returns 404 | Ensure static files are copied to correct path in Dockerfile |
| `unable to open database file` | Volume mounted `:ro` or DB files missing | Remove `:ro` from volume, copy `.db` files to host |
| `Could not locate bindings file` | `better_sqlite3.node` not in runner | Add `COPY` for native binary in Dockerfile |
| 500 on API routes | DB directory permissions | `chmod 666 /data/hujjah/*.db` or adjust ownership |
| DNS not resolving | Cloudflare tunnel cache | `sudo killall -HUP mDNSResponder` (macOS) or wait 5 min |

## Data Sources

| Source | Content | Status |
|---|---|---|
| Tanzil.net | Quran Arabic Uthmani text | ✅ Verified |
| Tanzil.net | Quran translations (9 English, 2 Bengali) | ✅ Verified |
| Sanadset 650K | Hadith corpus (Kutub al-Sittah + more) | ✅ Verified |
| GitHub (fawazahmed0/hadith-api) | Classic hadith translations (EN + BN) | ✅ Imported |
| everyayah.com | Audio MP3s (Alafasy) | ✅ Streaming + cache |
| HuggingFace | BGE-M3 (ONNX embedding) | ✅ Local |
| HuggingFace | Qwen2.5-0.5B-Instruct (Q4 GGUF) | ✅ Local |
| HuggingFace | Qwen2.5-1.5B-Instruct (Q4 GGUF) | ✅ Local |

## License

Apache-2.0
