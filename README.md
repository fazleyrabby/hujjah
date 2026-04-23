# Hujjah

Local-first Islamic research tool. Search across Quran, Hadith, and scholarly commentary — entirely offline in your browser.

## Stack

- **Next.js 16** + **React 19** + **Tailwind CSS v4**
- **PGLite** (PostgreSQL WASM) with `pgvector` extension
- **OPFS** (Origin Private File System) for large dataset storage
- **Transformers.js** for embeddings and local LLM inference

## Development

```bash
npm install
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
```

## Data

Source files are **not** included in the repo. Place them in:

```
/Users/rabbi/Desktop/hujjah resources/
├── quran-uthmani.sql
├── Sanadset 650K Data on Hadith Narrators/
│   ├── sanadset.csv
│   ├── books.csv
│   └── chunks/
└── global quran data/
    └── *.json
```

### Seeding (Node.js)

Bulk import all data into the filesystem vault:

```bash
node scripts/sync-all-data.mjs     # Import Quran + Hadith + Commentary + Books
npm run package:vault              # Package for browser deployment
```

### Browser Import

For incremental imports, use the **Dev Settings** page at `/settings`:
- **Analytics** tab — check browser DB status vs source files
- **Import Data** tab — drag & drop SQL/CSV/JSON files
- **Danger Zone** tab — reset browser database

## Architecture

| Layer | Storage | Use Case |
|---|---|---|
| Browser (end user) | `opfs://hujjah-vault` | Runtime queries, MVP frontend |
| Node.js (dev) | `public/hujjah-vault/` | Bulk seeding, packaging |

Browser storage uses **OPFS** with fallback to **IndexedDB**. OPFS handles 1M+ records significantly better than IDB.

## Pages

| Route | Audience | Purpose |
|---|---|---|
| `/` | End user | Search & RAG answers |
| `/settings` | Developer | DB analytics, import, reset |

## License

Apache-2.0
