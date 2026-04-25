# Hujjah

Privacy-first, offline-capable Islamic research engine. Search the Quran in English and Bengali, explore Kutub al-Sittah hadith with full sanad chains — 100% offline, zero external APIs.

## Stack

- **Next.js 16** + **React 19** + **Tailwind CSS v4**
- **Tauri 2.0** — Cross-platform native app shell
- **Native SQLite** via `@tauri-apps/plugin-sql` — No browser storage limits
- **FTS5** full-text search with `unicode61` tokenizer
- **Transformers.js** — Local ONNX models for embeddings + text generation

## Development

```bash
npm install
npm run dev          # Start Next.js dev server
npm run tauri dev   # Start Tauri app in dev mode
npm run build       # Production build (static export to dist/)
npm run tauri build # Build native Tauri app
npm run test:run    # Run Vitest suite
```

## Data

### Quran Database (`hujjah-quran.db`)

Source files are **not** included in the repo. Place them in:

```
/path/to/resources/
├── quran-uthmani.sql              # Arabic Uthmani text (Tanzil)
├── translations/
│   ├── en.sahih.sql               # English translations (Tanzil)
│   └── bn.bengali.sql             # Bengali translations (Tanzil)
```

```bash
npm run build:quran                # Build unified Quran database
npx ts-node scripts/migrate-db.ts  # Migrate schema (surahs, FTS5, embeddings)
npx ts-node scripts/migrate-tanzil-ai.ts  # Load Tanzil translations
npx ts-node scripts/generate-embeddings.ts # Generate vector embeddings
```

### Hadith Database

Hadith data comes from the Sanadset 650K corpus. Chunked CSVs are processed by:

```bash
npm run build:hadith           # Kutub al-Sittah only (~36K hadith)
npm run build:hadith:full      # Full 650K corpus (~2.4GB output)
python3 scripts/split-hadith-tiers.py  # Core + Research split in one run
npx ts-node scripts/import-github-hadith-translations.ts  # Import classic translations
```

Output: `src-tauri/resources/hujjah-hadith-*.db`

## Architecture

| Layer | Storage | Use Case |
|---|---|---|
| Frontend | Next.js 16 (static export) | UI, search, surah navigation, chat |
| Backend | Tauri 2.0 Rust runtime | Native OS integration, file access |
| Quran DB | SQLite `hujjah-quran.db` | 6,236 verses, 68K+ translations, FTS5, vectors |
| Hadith DB | SQLite `hujjah-hadith-core.db` | 36K Kutub al-Sittah hadith, FTS5, narrators |
| Hadith DB | SQLite `hujjah-hadith-research.db` | 615K additional hadith (downloadable) |
| Embedding | Local ONNX `bge-m3` | 1024-dim multilingual embeddings |
| LLM | Local ONNX `qwen-onnx` (Qwen2.5-0.5B) | Text generation for AI explanations |

### Quran Schema

```sql
CREATE TABLE verses (id, surah, ayah, text_ar);
CREATE TABLE translations (id, verse_id, lang_code, translator_slug, text, embedding BLOB);
CREATE VIRTUAL TABLE quran_search_idx USING fts5(text, verse_id, lang_code, tokenize='unicode61');
CREATE TABLE surahs (id, name_ar, name_en, name_bn);
```

### Hadith Schema (Core)

```sql
CREATE TABLE hadiths (id, book_id, num_in_book, hadith_ar, matn_ar, sanad_length);
CREATE TABLE hadith_books (id, name_ar, name_en, hadith_count);
CREATE TABLE narrators (id, name_ar);
CREATE TABLE hadith_narrators (hadith_id, narrator_id, position);
CREATE TABLE narrator_edges (from_narrator_id, to_narrator_id, hadith_count);
CREATE VIRTUAL TABLE hadith_search_idx USING fts5(matn_ar, hadith_id, book_id);
CREATE TABLE hadith_translations (hadith_id, lang_code, matn_text, translator);
```

## Search Features

- **Reference Jump**: Type `2:255` to go directly to Ayat al-Kursi
- **Surah Navigation**: Click any surah name in the sidebar
- **Keyword Search**: FTS5 full-text search with highlighted snippets
- **Auto Language Detection**: Automatically switches between English and Bengali FTS5 index based on input script
- **Semantic Search**: Local AI embedding search via BGE-M3
- **Translator Selector**: Switch between Classic (GitHub) and AI (Qwen) translations
- **Hadith Domain**: Toggle to Quran or Hadith; use `@hadith prayer` to route hadith search directly

## Audio Features

- **Play Surah**: Global play button starts from ayah 1 with auto-next
- **Per-Ayah Play**: Individual play buttons on each verse card
- **Pause / Resume / Stop**: Full audio controls in the surah header
- **Local Caching**: Audio cached via Tauri FS, streams from everyayah.com CDN

## AI Chat

- **Floating Chat Widget**: Bottom-right toggle with message history
- **RAG Pipeline**: Query → embed (Quran) + FTS5 (Hadith) → retrieve top sources → generate explanation
- **Bilingual**: Responses in English or Bengali based on your language toggle
- **Source Citations**: Every AI response shows referenced surah:ayah or hadith book + number
- **100% Offline**: qwen-onnx model runs in a Web Worker — no data leaves device

## Hadith Grading

Hadith authenticity is graded by sanad chain length (shorter = stronger):

| Grade | Sanad Length | Color | Description |
|---|---|---|---|
| **Sahih** | 1-3 narrators | 🟢 Emerald | Highly authentic |
| **Hasan** | 4-5 narrators | 🟡 Amber | Good authenticity |
| **Standard** | 6+ narrators | ⚪ Gray | Standard grading |

## Pages

| Route | Purpose |
|---|---|
| `/` | Search, surah reading, audio, AI chat |
| `/about` | Data sources, privacy, links |
| `/settings` | DB stats, model status, reset |
| `/chain` | Sanad chain explorer — search narrators, browse teachers/students, view hadith graphs |
| `/hadith` | Hadith vault — browse all 6 books with translations and grading |

## Data Sources

| Source | Content | Status |
|---|---|---|
| Tanzil.net | Quran Arabic Uthmani text | ✅ Verified |
| Tanzil.net | Quran translations (9 English, 2 Bengali) | ✅ Verified |
| Sanadset 650K | Hadith corpus (Kutub al-Sittah + more) | ✅ Verified |
| GitHub (fawazahmed0/hadith-api) | Classic hadith translations (EN + BN) | ✅ Imported |
| everyayah.com | Audio MP3s (Alafasy) | ✅ Streaming + cache |
| HuggingFace | BGE-M3 (ONNX embedding) | ✅ Local |
| HuggingFace | Qwen2.5-0.5B-Instruct (ONNX) | ✅ Local |

## License

Apache-2.0
