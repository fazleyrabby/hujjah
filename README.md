# Hujjah

Privacy-first, offline-capable Islamic research engine. Search the Quran in English and Bengali — 100% offline, zero external APIs.

## Stack

- **Next.js 16** + **React 19** + **Tailwind CSS v4**
- **Tauri 2.0** — Native desktop app shell
- **Native SQLite** via `@tauri-apps/plugin-sql` — No browser storage limits
- **FTS5** full-text search with `unicode61` tokenizer
- **Transformers.js** — Local ONNX models for embeddings + text generation

## Development

```bash
npm install
npm run dev          # Start Next.js dev server
npm run tauri:dev    # Start Tauri app in dev mode
npm run build        # Production build (static export to dist/)
npm run tauri:build  # Build native Tauri app
npm run test:run     # Run Vitest suite
```

## Data Seeding

Source files are **not** included in the repo. Place them in:

```
/Users/rabbi/Desktop/hujjah resources/
├── quran-uthmani.sql              # Arabic Uthmani text (Tanzil)
├── translations/
│   ├── en.sahih.sql               # English translations (Tanzil)
│   ├── bn.bengali.sql             # Bengali translations (Tanzil)
│   └── ...                        # Other translators
└── global quran data/             # JSON translations (legacy)
    └── *.json
```

### Build the Quran Vault

```bash
# 1. Build the unified Quran database (Arabic + all translations)
npm run build:quran

# 2. Migrate to latest schema (surahs table, FTS5, embeddings)
npx ts-node scripts/migrate-db.ts

# 3. Swap translations with verified Tanzil data
npx ts-node scripts/migrate-tanzil-ai.ts

# 4. Generate vector embeddings for English translations
npx ts-node scripts/generate-embeddings.ts

# 5. Fix any missing verses (if needed)
npx ts-node scripts/fix-missing-verses.ts
npx ts-node scripts/fix-missing-embeddings.ts
```

## Architecture

| Layer | Storage | Use Case |
|---|---|---|
| Frontend | Next.js 16 (static export) | UI, search, surah navigation, chat |
| Backend | Tauri 2.0 Rust runtime | Native OS integration, file access |
| Database | SQLite `hujjah-quran.db` | 6,236 verses, 68K+ translations, FTS5, vectors |
| Embedding Model | Local ONNX `all-MiniLM-L6-v2` | 384-dim sentence embeddings |
| LLM Model | Local ONNX `qwen-onnx` (Qwen2.5-0.5B) | Text generation for explanations |

### Database Schema

```sql
-- Arabic verses
CREATE TABLE verses (id, surah, ayah, text_ar);

-- Translations (English + Bengali from Tanzil.net)
CREATE TABLE translations (id, verse_id, lang_code, translator_slug, text, embedding BLOB);

-- FTS5 search index (en + bn only)
CREATE VIRTUAL TABLE quran_search_idx USING fts5(text, verse_id, lang_code, tokenize='unicode61');

-- Surah metadata
CREATE TABLE surahs (id, name_ar, name_en, name_bn);

-- Verse-level embeddings for semantic search
CREATE TABLE vec_idx (verse_id PRIMARY KEY, embedding BLOB);
```

## Search Features

- **Reference Jump**: Type `2:255` to go directly to Ayat al-Kursi
- **Surah Navigation**: Click any surah name in the sidebar
- **Keyword Search**: FTS5-powered full-text search with highlighted snippets
- **Language Toggle**: Switch between English and Bengali instantly
- **Semantic Search**: Local AI embedding search via all-MiniLM-L6-v2
- **Translator Selector**: View any surah with a specific translator only

## Audio Features

- **Play Surah**: Global play button starts from ayah 1 with auto-next
- **Per-Ayah Play**: Individual play buttons on each verse card
- **Pause / Resume / Stop**: Full audio controls in the surah header
- **Local Caching**: Audio cached via Tauri FS, streams from everyayah.com CDN

## AI Chat (Agentic Q&A)

- **Floating Chat Widget**: Bottom-right toggle with message history
- **RAG Pipeline**: Query → embed → retrieve top-5 verses → generate explanation
- **Source Citations**: Every AI response shows referenced surah:ayah
- **100% Offline**: qwen-onnx model runs in a Web Worker — no data leaves device

## Pages

| Route | Audience | Purpose |
|---|---|---|
| `/` | End user | Search, surah reading, audio, chat |
| `/about` | End user | Data sources, privacy guard, links |
| `/settings` | Developer | DB stats, model status, reset |

## License

Apache-2.0
