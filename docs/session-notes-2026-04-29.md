# Session Notes — 2026-04-29

## Sunnah Migration — Data Pipeline Completion

### Scripts Written (apps/web/scripts/sunnah-migration/)

| Script | Purpose | Status |
|--------|---------|--------|
| `08-import-sunnah-en.py` | Import EN translations from MySQL sunnahdb via subprocess | Done — 42,512 inserted |
| `09-reimport-bengali.py` | Fix BN translations from fawazahmed0 CDN | Done — 24,655 inserted |
| `10-generate-embeddings.py` | BGE-M3 embeddings for EN/BN/AR | Done (EN+BN). AR running |
| `11-fetch-sunnah-chains.py` | Fetch narrator chains from sunnah.com API | Ready — awaiting API limit increase |
| `12-import-sunnah-ar.py` | Import Arabic matn from MySQL sunnahdb | Done — 42,693 updated |
| `13-scrape-ihadis-bn.py` | Scrape BN translations from ihadis.com | Paused — awaiting permission email |

### Data Coverage (as of 2026-04-29)

**Hadiths:** 53,986 total (42,694 sunnah.com + 11,292 sanadset)

**Translations:**
- EN: 42,512 (sunnah.com translator) — 99.7% of sunnah.com hadiths
- BN: 24,655 (hadith-api/fawazahmed0) — covers bukhari, abudawud, ibnmajah, tirmidhi, nasai, forty
- BN: 5,717 (github-classic) — sanadset hadiths only

**Missing BN (23,614 total):**
- Muslim: 7,459 — fawazahmed0 numbering incompatible
- sanadset: 5,575 — no source available
- mishkat: 4,433 — ihadis.com pending
- riyadussalihin: 1,896 — ihadis.com pending
- adab: 1,185 — ihadis.com pending
- shamail: 402 — ihadis.com pending
- bulugh: 378 — ihadis.com pending

**Embeddings (BGE-M3, 1024-dim):**
- EN/sunnah.com: 42,512 ✓
- BN/hadith-api: 24,655 ✓
- AR/arabic: 32,291 / 53,984 (in progress)

**Arabic matn:** 53,984 / 53,986 ✓

### Narrator Chains
- Sanadset orphan rows cleaned (168,905 deleted from `hadith_narrators`, `narrator_edges` cleared)
- `narrator_fetch_progress` table created for resumable API fetch
- Script 11 ready — needs sunnah.com API limit increase (currently 5k/day, ~9 days for 42k hadiths)
- Emailed sunnah.com requesting higher limit

### Data Sources Used

| Source | Data | License/Permission |
|--------|------|--------------------|
| sunnah.com API | Narrator chains | API key: vBLSOaQy7r94sPRDKPOEZ5TDdWnKWWsRakz5UlsA |
| sunnah.com MySQL dump | EN translations, Arabic matn | Local dump via sunnahdb MySQL |
| fawazahmed0/hadith-api | BN translations (7 collections) | Public CDN, no stated license |
| ihadis.com | BN translations (5 collections) | Pending permission — email sent |

---

## Quran Tafsir — New Feature

### DB Schema Change
Added `tafsir` table to `hujjah-quran.db`:
```sql
CREATE TABLE tafsir (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id INTEGER NOT NULL,
    tafsir_slug TEXT NOT NULL,
    lang_code TEXT NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (verse_id) REFERENCES verses(id),
    UNIQUE(verse_id, tafsir_slug)
);
```

### Script: apps/web/scripts/quran/01-import-tafsir.py
- Imports tafsir from quran.com API (free, no key required)
- Supports EN, BN, AR tafsirs
- Resumable — skips already imported verses
- HTML stripped from tafsir text

### Tafsirs Being Imported (Default Set)

| ID | Slug | Lang | Notes |
|----|------|------|-------|
| 169 | en-ibn-kathir | EN | Ibn Kathir Abridged |
| 166 | bn-abu-bakr-zakaria | BN | Most comprehensive BN tafsir |
| 164 | bn-ibn-kathir | BN | Ibn Kathir in Bengali |

### Additional Available Tafsirs (quran.com IDs)
- 168: Ma'arif al-Qur'an (EN)
- 165: Ahsanul Bayaan (BN)
- 381: Fathul Majid (BN)
- 14: Ibn Kathir (AR)
- 15: Tabari (AR)
- 16: Muyassar (AR)

**Source:** quran.com API — `GET https://api.quran.com/api/v4/tafsirs/{id}/by_ayah/{surah}:{ayah}`

---

## Pending Actions

- [ ] Wait for AR embeddings to finish (~1.5hr)
- [ ] Wait for tafsir import to finish (~2hr)
- [ ] Email response from ihadis.com — then run/resume 13-scrape-ihadis-bn.py
- [ ] Email response from sunnah.com — then run 11-fetch-sunnah-chains.py
- [ ] Update `apps/tauri/lib/hadith-db.ts` — still references `github-classic` translator, needs `sunnah.com` (EN) and `hadith-api` (BN)
- [ ] After ihadis BN import: run `10-generate-embeddings.py --lang bn` for new rows
- [ ] Write import script `14-import-ihadis-bn.py` for scraped JSON → SQLite
- [ ] Expose tafsir in app UI (Tauri + web)
