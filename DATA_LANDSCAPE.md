# Hujjah Data Landscape

Overview of all source data in `/Users/rabbi/Desktop/hujjah resources/` and normalization strategies.

---

## Summary

| Dataset | Files | Size | Records | Format |
|---------|-------|------|---------|--------|
| **Quran Arabic** | 1 | 1.5 MB | 6,236 | MySQL SQL dump |
| **Hadith** | 1 (+ 68 chunks) | 1.3 GB | ~650K | CSV (inconsistent) |
| **Books** | 1 | 47 KB | 957 | CSV (single column) |
| **Commentary** | 110 | ~150 MB | ~686K | JSON (nested) |
| **Total** | 180 | **~1.45 GB** | **~1.34M** | |

---

## 1. Quran Arabic (`quran-uthmani.sql`)

**Size:** 1.5 MB  
**Records:** 6,236 ayahs  
**Format:** MySQL dump from phpMyAdmin

```sql
INSERT INTO `quran_text` (`index`, `sura`, `aya`, `text`) VALUES
(1, 1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ'),
(2, 1, 2, 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ'),
...
```

**Schema:** `(index, sura, aya, text)` — clean, consistent

**Normalization:**
- Already optimal. Parse SQL to extract `(sura, aya, text)`.
- Pre-generate embeddings as binary float32: 6,236 x 384 x 4 bytes = ~9.5 MB.
- Alternative: Convert to JSONL or Parquet for easier parsing.

---

## 2. Hadith (`sanadset.csv` + `chunks/`)

**Size:** 1.3 GB (original), ~30 MB per chunk  
**Records:** ~650,000 hadiths  
**Format:** CSV with inconsistent field counts (6-9 columns)

**Row example:**
```csv
Book,Number,Hadith,Sanad,Matn,Grade
"صحيح البخاري",1,"حديث text...","['النبي ﷺ', 'أبو هريرة']","متن text...","صحيح"
```

**Known issues:**
- 159K rows have `"No SANAD"` — missing narrator chain
- `Sanad` column contains Python list strings: `['narrator1', 'narrator2']`
- 1.3GB too large for direct browser import (will OOM)
- Already split into 68 chunks of ~10K lines each (~15-30 MB per chunk)

**Schema (rough):**
```ts
{
  book: string,        // Arabic book name
  number: number,      // Hadith number
  hadith: string,      // Full text
  sanad: string[],     // Chain (Python list syntax!)
  matn: string,        // Core text
  grade: string,       // Authenticity
  // ...sometimes extra fields
}
```

**Normalization:**
- Parse Python lists: `JSON.parse(sanad.replace(/'/g, '"'))`
- Split sanad/matn for better search granularity
- Deduplicate: many hadiths repeat across books
- Convert to JSONL (smaller, faster to parse than CSV)
- Pre-generate embeddings for top 10 books only (~50K hadiths)

**Browser strategy:**
1. Pre-seed ~50K "most important" hadiths (Bukhari, Muslim, etc.)
2. Use OPFS (when PGlite supports it) for full dataset
3. Stream-process chunks on-demand

---

## 3. Books (`books.csv`)

**Size:** 47 KB  
**Records:** 957 books  
**Format:** Single-column CSV

```csv
Book
مسند الربيع بن حبيب
صحيح البخاري
...
```

**Schema:** Just Arabic book names, one per line

**Normalization:**
- Already tiny. Merge with Hadith by adding `book_id` to hadith rows.
- Create metadata mapping: `book_name -> book_id -> hadith_count`

---

## 4. Commentary/Translations (`global quran data/*.json`)

**Size:** ~150 MB total  
**Files:** 110 JSON files  
**Records:** ~686K verses (110 x 6,236)  
**Format:** Nested JSON per language/translator

**File structure:**
```json
{
  "quran": {
    "en.asad": {
      "1": {"id": 1, "surah": 1, "ayah": 1, "verse": "In the name of God..."},
      "2": {"id": 2, "surah": 1, "ayah": 2, "verse": "All praise is due..."}
    }
  }
}
```

**Schema per verse:**
```ts
{
  id: number,      // Global verse ID (1-6236)
  surah: number,   // 1-114
  ayah: number,    // 1-286
  verse: string    // Translation/tafsir text
}
```

**Breakdown:**
- 53 languages
- 14 English translations (ahmedali, arberry, asad, pickthall, sahih, yusufali, etc.)
- 2 Arabic tafsirs (jalalayn, muyassar)
- Some files are Quran text variants, not translations (quran-simple.json, quran-uthmani.json)

**Normalization:**
- Flatten: remove `{"quran": {"en.asad": {...}}}` nesting
- Store metadata separately: `{lang, translator, verses: [...]}`
- Remove redundant `id` field (surah+ayah is sufficient key)
- Use JSONL or MessagePack instead of nested JSON
- Pre-generate embeddings for 5-10 popular translations only

---

## Recommended Compression Pipeline

### Option A: JSONL + Pre-computed Embeddings (Recommended)

```
hujjah-data/
├── quran/
│   ├── arabic.jsonl              # 6,236 lines
│   └── arabic.embeddings.bin     # 6,236 x 384 x 4 bytes = ~9.5 MB
│
├── hadith/
│   ├── bukhari.jsonl             # ~7K hadiths
│   ├── muslim.jsonl              # ~7K hadiths
│   └── ...                       # Top 10 books only
│
├── commentary/
│   ├── en.asad.jsonl             # 6,236 lines
│   ├── en.sahih.jsonl
│   ├── ar.jalalayn.jsonl
│   └── ...                       # 5-10 popular translations
│
└── metadata.json                 # Book list, language mappings
```

**Estimated sizes:**
- Quran: ~2 MB text + 9.5 MB embeddings = ~12 MB
- Hadith (top 10 books): ~30 MB text + ~75 MB embeddings = ~105 MB
- Commentary (10 translations): ~15 MB text + ~240 MB embeddings = ~255 MB
- **Total: ~370 MB** (vs current 1.45 GB raw = **~4x smaller**)

### Option B: Pre-seeded PGlite Vault

Pre-seed a PGlite database on disk:
```bash
node scripts/seed-vault.mjs    # Create public/hujjah-vault/
npm run package:vault           # Create tar.gz
```

**Size:** ~2.4 GB (PostgreSQL overhead + vector data). Not ideal for web.

### Option C: On-Demand Streaming (Future)

- Stream JSONL chunks via HTTP range requests
- Embed on-the-fly or load pre-computed binary chunks
- Good for OPFS when 1M+ records needed

---

## MVP Phasing Recommendation

### Phase 1: Quran Only (Now)
- Parse `quran-uthmani.sql` in browser
- Generate embeddings once, store in `idb://hujjah-minimal`
- Browser storage: ~10-15 MB

### Phase 2: Selective Hadith
- Top 5-10 books only (~20K hadiths)
- Pre-compute embeddings
- Additional storage: ~40 MB

### Phase 3: Commentary
- 3-5 popular translations
- Embed on-demand or pre-compute
- Additional storage: ~50-100 MB

### Phase 4: OPFS Migration
- When PGlite supports `opfs://`, migrate from IndexedDB
- Handles 1M+ records without browser slowdown

---

## Files Not Covered in Detail Above

| File | Location | Size | Purpose |
|------|----------|------|---------|
| **README.txt** | `global quran data/README.txt` | ~1 KB | Attribution and source info for Quran translations |
| **hadith_samples.csv** | `Sanadset 650K/...` | 16 KB | Sample rows from sanadset (for testing parsers) |
| **translated_samples.csv** | `Sanadset 650K/...` | 8 KB | Sample translations (English + Arabic side-by-side) |
| **sanadset.csv** | `Sanadset 650K/...` | 1.3 GB | Original unsplit file (same data as chunks combined) |

The `sanadset.csv` original and the 68 chunks contain identical data. The chunks were created for browser-safe import (<500MB each).

## Quick Reference: File Locations

```
/Users/rabbi/Desktop/hujjah resources/
├── quran-uthmani.sql                           # 1.5 MB
│
├── Sanadset 650K Data on Hadith Narrators/
│   ├── sanadset.csv                            # 1.3 GB (original, unsplit)
│   ├── books.csv                               # 47 KB
│   ├── hadith_samples.csv                      # 16 KB (sample rows)
│   ├── translated_samples.csv                  # 8 KB (sample translations)
│   └── chunks/                                 # 68 split files (~15-30 MB each)
│       ├── sanadset_chunk_000.csv
│       ├── sanadset_chunk_001.csv
│       └── ... (sanadset_chunk_000.csv to sanadset_chunk_067.csv)
│
└── global quran data/
    ├── README.txt                              # Data source attribution
    ├── quran-buck.json                         # Buckwalter transliteration
    ├── quran-kids.json                         # Simplified for children
    ├── quran-simple.json                       # Plain Arabic text
    ├── quran-simple-clean.json                 # Plain text without diacritics
    ├── quran-simple-enhanced.json              # Enhanced plain text
    ├── quran-simple-min.json                   # Minimal plain text
    ├── quran-tajweed.json                      # Tajweed rules markup
    ├── quran-uthmani.json                      # Uthmani script
    ├── quran-uthmani-hafs.json                 # Hafs reading
    ├── quran-uthmani-min.json                  # Minimal Uthmani
    ├── quran-wordbyword.json                   # Word-by-word breakdown
    │
    ├── ar.jalalayn.json                        # Arabic Tafsir al-Jalalayn
    ├── ar.muyassar.json                        # Arabic Tafsir Muyassar
    │
    ├── en.asad.json                            # English: Muhammad Asad
    ├── en.sahih.json                           # English: Sahih International
    ├── en.pickthall.json                       # English: Pickthall
    ├── en.yusufali.json                        # English: Yusuf Ali
    ├── en.arberry.json                         # English: Arberry
    ├── en.shakir.json                          # English: Shakir
    ├── en.maududi.json                         # English: Maududi
    ├── en.hilali.json                          # English: Hilali-Khan
    ├── en.daryabadi.json                       # English: Daryabadi
    ├── en.ahmedali.json                        # English: Ahmed Ali
    ├── en.ahmedraza.json                       # English: Ahmed Raza
    ├── en.qaribullah.json                      # English: Qaribullah
    ├── en.sarwar.json                          # English: Sarwar
    ├── en.transliteration.json                 # English: Transliteration
    │
    ├── de.aburida.json                         # German: Abu Rida
    ├── de.bubenheim.json                       # German: Bubenheim
    ├── de.khoury.json                          # German: Khoury
    ├── de.zaidan.json                          # German: Zaidan
    │
    ├── es.asad.json                            # Spanish: Asad
    ├── es.cortes.json                          # Spanish: Cortes
    │
    ├── fr.hamidullah.json                      # French: Hamidullah
    ├── it.piccardo.json                        # Italian: Piccardo
    ├── pt.elhayek.json                         # Portuguese: Elhayek
    │
    ├── fa.ansarian.json                        # Persian: Ansarian
    ├── fa.ayati.json                           # Persian: Ayati
    ├── fa.bahrampour.json                      # Persian: Bahrampour
    ├── fa.fooladvand.json                      # Persian: Fooladvand
    ├── fa.ghomshei.json                        # Persian: Ghomshei
    ├── fa.khorramdel.json                      # Persian: Khorramdel
    ├── fa.khorramshahi.json                    # Persian: Khorramshahi
    ├── fa.makarem.json                         # Persian: Makarem
    ├── fa.moezzi.json                          # Persian: Moezzi
    ├── fa.mojtabavi.json                       # Persian: Mojtabavi
    │
    ├── tr.ates.json                            # Turkish: Ates
    ├── tr.bulac.json                           # Turkish: Bulac
    ├── tr.diyanet.json                         # Turkish: Diyanet
    ├── tr.golpinarli.json                      # Turkish: Golpinarli
    ├── tr.ozturk.json                          # Turkish: Ozturk
    ├── tr.transliteration.json                 # Turkish: Transliteration
    ├── tr.vakfi.json                           # Turkish: Vakfi
    ├── tr.yazir.json                           # Turkish: Yazir
    ├── tr.yildirim.json                        # Turkish: Yildirim
    ├── tr.yuksel.json                          # Turkish: Yuksel
    │
    ├── ur.ahmedali.json                        # Urdu: Ahmed Ali
    ├── ur.jalandhry.json                       # Urdu: Jalandhry
    ├── ur.jawadi.json                          # Urdu: Jawadi
    ├── ur.junagarhi.json                       # Urdu: Junagarhi
    ├── ur.kanzuliman.json                      # Urdu: Kanzul Iman
    ├── ur.maududi.json                         # Urdu: Maududi
    ├── ur.qadri.json                           # Urdu: Qadri
    │
    ├── ru.abuadel.json                         # Russian: Abu Adel
    ├── ru.krachkovsky.json                     # Russian: Krachkovsky
    ├── ru.kuliev.json                          # Russian: Kuliev
    ├── ru.muntahab.json                        # Russian: Muntahab
    ├── ru.osmanov.json                         # Russian: Osmanov
    ├── ru.porokhova.json                       # Russian: Porokhova
    ├── ru.sablukov.json                        # Russian: Sablukov
    │
    ├── az.mammadaliyev.json                    # Azerbaijani
    ├── az.musayev.json                         # Azerbaijani
    ├── bg.theophanov.json                      # Bulgarian
    ├── bn.bengali.json                         # Bengali
    ├── bs.korkut.json                          # Bosnian
    ├── bs.mlivo.json                           # Bosnian
    ├── cs.hrbek.json                           # Czech
    ├── cs.nykl.json                            # Czech
    ├── dv.divehi.json                          # Divehi
    ├── ha.gumi.json                            # Hausa
    ├── hi.farooq.json                          # Hindi
    ├── hi.hindi.json                           # Hindi
    ├── id.indonesian.json                      # Indonesian
    ├── id.muntakhab.json                       # Indonesian
    ├── ja.japanese.json                        # Japanese
    ├── ko.korean.json                          # Korean
    ├── ku.asan.json                            # Kurdish
    ├── ml.abdulhameed.json                     # Malayalam
    ├── ms.basmeih.json                         # Malay
    ├── nl.keyzer.json                          # Dutch
    ├── no.berg.json                            # Norwegian
    ├── pl.bielawskiego.json                    # Polish
    ├── quran-wordbyword.json                   # Word-by-word
    ├── ro.grigore.json                         # Romanian
    ├── sd.amroti.json                          # Sindhi
    ├── si.naseemismail.json                    # Sinhala
    ├── so.abduh.json                           # Somali
    ├── sq.ahmeti.json                          # Albanian
    ├── sq.mehdiu.json                          # Albanian
    ├── sq.nahi.json                            # Albanian
    ├── sv.bernstrom.json                       # Swedish
    ├── sw.barwani.json                         # Swahili
    ├── ta.tamil.json                           # Tamil
    ├── tg.ayati.json                           # Tajik
    ├── th.thai.json                            # Thai
    ├── tt.nugman.json                          # Tatar
    ├── ug.saleh.json                           # Uyghur
    └── zh.jian.json                            # Chinese
        zh.majian.json                          # Chinese
        zh.mazhonggang.json                     # Chinese
```

---

*Generated: 2026-04-23*
