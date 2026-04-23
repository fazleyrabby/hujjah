<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hujjah — Agent Handover

## Project Overview

Hujjah is a **privacy-first, offline-capable Islamic research engine** built as a Tauri desktop app with a Next.js frontend. It searches the Quran in English and Bengali using local SQLite + FTS5, with AI-powered semantic search and a chatbot for explanations — all 100% offline.

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js + React + Tailwind CSS v4 | 16 / 19 / 4 |
| Desktop Shell | Tauri | 2.0 |
| Database | SQLite via `@tauri-apps/plugin-sql` | 3.x |
| AI/ML | Transformers.js (ONNX Runtime) | 4.x |
| Testing | Vitest + React Testing Library | 4.x |

## File Structure

```
/Users/rabbi/Desktop/Projects/hujjah/
├── app/
│   ├── page.tsx              # Main UI (search, surah reader, audio controls, AI chat)
│   ├── about/page.tsx        # About page (data sources, privacy, links)
│   ├── settings/page.tsx     # Dev settings (DB stats, model status, reset)
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Tailwind v4 theme + dark mode CSS variables
├── components/
│   └── ChatWidget.tsx        # Floating AI chat panel (bottom-right)
├── hooks/
│   ├── useQuranAudio.ts      # Audio engine (play/pause/resume/stop, auto-next, caching)
│   ├── useRAG.ts             # Legacy single-explanation AI hook
│   └── useChat.ts            # Chatbot hook (message history, send, clear)
├── lib/
│   ├── db.ts                 # Unified search router, FTS5, surah navigation
│   ├── search-utils.ts       # Pure query classification logic
│   ├── search-utils.test.ts  # Tests for query classification
│   └── ai/
│       ├── embedding.ts      # Web Worker wrapper for all-MiniLM-L6-v2 + cosine similarity
│       ├── retrieve.ts       # Semantic retrieval + hybrid RAG
│       ├── explain.ts        # Full RAG pipeline (embed → retrieve → generate)
│       └── index.ts          # Public AI API exports
├── workers/
│   ├── embedding.worker.ts   # Transformers.js Web Worker (embeddings)
│   └── generation.worker.ts  # Transformers.js Web Worker (text generation)
├── src-tauri/
│   ├── resources/
│   │   ├── hujjah-quran.db   # 6236 verses, 68596 translations, 56124 embeddings
│   │   └── models/
│   │       ├── all-MiniLM-L6-v2/   # ONNX embedding model (23MB)
│   │       └── qwen-onnx/          # ONNX text gen model (512MB, Qwen2.5-0.5B)
│   ├── src/lib.rs            # Tauri init (DB copy, legacy purge)
│   └── tauri.conf.json       # Tauri config (resources bundling)
├── scripts/
│   ├── migrate-db.ts         # Surah table + FTS5 rebuild
│   ├── migrate-tanzil-ai.ts  # Tanzil data ingestion + embeddings
│   ├── fix-missing-verses.ts # Fix 114 missing verses
│   ├── fix-missing-embeddings.ts
│   └── generate-embeddings.ts
├── public/models             # Symlink → ../src-tauri/resources/models
│                             # (required for Transformers.js HTTP access)
├── next.config.mjs           # Static export config
├── vitest.config.ts          # Vitest config with path aliases
└── vitest.setup.ts           # Jest DOM matchers
```

## Key Conventions

### Tailwind v4
- Use `@custom-variant dark (&:where(.dark, .dark *));` in globals.css
- Custom colors defined in `@theme` block via CSS variables
- **Always** add `dark:` variants when using gray colors, backgrounds, borders

### Dark Mode
- State lives in `page.tsx` as `const [darkMode, setDarkMode] = useState(false)`
- `useEffect` syncs `document.documentElement.classList.add/remove('dark')`
- All pages must use `dark:` variants for every hardcoded color

### Database Queries
- Use `getDB()` singleton from `lib/db.ts`
- SQL parameters use `?` placeholders
- `db.select<T[]>(sql, params)` for queries, `db.execute(sql, params)` for mutations

### AI / Transformers.js
- Models are loaded from `/models` (symlinked to `src-tauri/resources/models`)
- **Never** run model inference on the main thread — always use Web Workers
- ` quantized: true` option requires `as Record<string, unknown>` cast for TypeScript

### Audio
- CDN: `https://everyayah.com/data/Alafasy_128kbps/{surah:03d}{ayah:03d}.mp3`
- Caches to Tauri AppData directory via `@tauri-apps/plugin-fs`
- Global `HTMLAudioElement` managed in `useQuranAudio.ts`

### Git
- Working on `main` branch
- Do NOT run `git push` without explicit user confirmation
- Do NOT amend commits that have been pushed

## Recent Changes (as of last session)

1. **Translator Selector**: Surah view now shows a dropdown to pick one translator (no more duplicates)
2. **Audio Controls**: Play Surah + Pause + Resume + Stop buttons in surah header
3. **Dark Mode Fixed**: Added `dark:` variants to about/settings pages, sync to `<html>` class
4. **AI Chat Widget**: Floating bottom-right chat panel with message history, source citations, typing indicator
5. **Qwen ONNX Wired**: `qwen-onnx` model symlinked via `public/models`, generation worker off-thread

## Known Issues / TODO

- [ ] Semantic search `searchSemantic()` in `lib/db.ts` returns `[]` — needs wiring to `lib/ai/retrieve.ts`
- [ ] `qwen-onnx` is 512MB — verify it loads correctly in Tauri runtime (may need asset protocol)
- [ ] Audio caching needs testing in actual Tauri build
- [ ] Settings page uses `purgeLegacyStorage` command that may need updating

## Data Sources

| Source | Content | Status |
|---|---|---|
| Tanzil.net | Arabic Uthmani text | ✅ Verified |
| Tanzil.net | English translations (9 translators) | ✅ Verified |
| Tanzil.net | Bengali translations (2 translators) | ✅ Verified |
| everyayah.com | Audio MP3s (Alafasy) | ✅ Streaming + cache |
| HuggingFace | all-MiniLM-L6-v2 (ONNX) | ✅ Local |
| HuggingFace | Qwen2.5-0.5B-Instruct (ONNX) | ✅ Local |

## Testing

```bash
npm run test:run     # 18 tests passing (search-utils + components)
npx tsc --noEmit     # TypeScript check
npx eslint <files>   # Lint specific files
```

## Environment

- **OS**: macOS (darwin)
- **Node**: v25.9.0
- **Package Manager**: pnpm (via corepack)
- **Shell**: zsh
