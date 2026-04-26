# Hujjah — References & Data Sources

All external data sources, datasets, APIs, models, and libraries used or referenced in this project.

---

## Primary Islamic Text Datasets

### Quran

| Source | Format | Content | Location in Project |
|---|---|---|---|
| **Tanzil.net** | SQL dump | Uthmani Arabic text — 6,236 verses | `hujjah resources/quran-uthmani.sql` |
| **Global Quran Data** (tanzil-derived) | JSON (111 files) | 94 translations × 6,236 verses in 42 languages including EN, BN, AR | `hujjah resources/global quran data/` |
| Arabic Tafsirs included | JSON | `ar.jalalayn.json` (Tafsir al-Jalalayn), `ar.muyassar.json` (Al-Tafsir al-Muyassar) | same directory |

**Note:** The 111 JSON translation files use nested format `{"quran": {"en.asad": {"1": {id, surah, ayah, verse}}}}`. Filename convention: `{lang}.{translator-slug}.json`.

---

### Hadith

| Source | Format | Content | Location in Project |
|---|---|---|---|
| **Sanadset** (650K Hadith Narrators Dataset) | CSV | 650,986 hadiths from 956 books with parsed sanad chains in `<SANAD><NAR>` XML format | `hujjah resources/Sanadset 650K Data on Hadith Narrators/sanadset.csv` |
| Sanadset chunks | CSV (68 files) | Same data split into ~10K-line chunks for memory-safe processing | `hujjah resources/Sanadset 650K Data on Hadith Narrators/chunks/` |
| Sanadset books list | CSV | 957 book names + metadata | `hujjah resources/Sanadset 650K Data on Hadith Narrators/books.csv` |
| **fawazahmed0/hadith-api** | JSON (GitHub CDN) | Hadith translations in multiple languages | `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions` |

**Kutub al-Sittah subset** (loaded into `hujjah-hadith-core.db`):

| Book | Arabic Name | Hadiths |
|---|---|---|
| Sahih al-Bukhari | صحيح البخاري | 6,974 |
| Sahih Muslim | صحيح مسلم | 5,348 |
| Sunan Abu Dawood | سنن أبي داود | 4,567 |
| Jami al-Tirmidhi | جامع الترمذي | 3,813 |
| Sunan Ibn Majah | سنن ابن ماجه | 4,333 |
| Sunan al-Nasa'i | سنن النسائي | 11,292 |
| **Total** | | **36,327** |

---

## Narrator (Rijal) Data Sources

### Used / Seeded

| Source | License | Narrators covered | Fields populated | Status |
|---|---|---|---|---|
| Manual curation + normalization reseed | N/A (internal) | 528 | name_en, name_bn, death_year, reliability, city, tabaqah | **Active** — in DB (`data_source='manual'`) |
| Chain-position analysis on `hadith_narrators` | N/A (derived from corpus) | 23,072 | tabaqah | **Active** — in DB (`data_source='computed'`) |
| Bengali narrator-name transliteration | N/A (generated via local Qwen) | 528 | name_bn | **Active** — in DB |
| **Wikidata** (wikdata.org) | **CC0 (Public Domain)** | 584 | death_year, city | **Active** — in DB (`data_source='wikidata'`). Script: `scripts/enrich-wikidata.py`. name_en pass pending re-fetch. |

**Wikidata SPARQL endpoint:** `https://query.wikidata.org/sparql`
Query targets: occupation=hadith transmitter (Q6584264), Islamic scholars pre-1500 CE with Arabic language.
Cache stored at: `src-tauri/resources/.wikidata-cache.json`

### Pending (legal, queued to run)

| Source | License | Expected coverage | Script |
|---|---|---|---|
| **Wikidata** (name_en re-fetch) | CC0 | ~584 name_en fields | `scripts/enrich-wikidata.py --no-cache --apply` |
| **Wikipedia API** | CC BY-SA 4.0 | Top 500 narrators, gap-fill death_year/city | `scripts/enrich-wikipedia.py --apply --top 500` |
| **Bengali names for wikidata batch** | N/A (generated) | ~584 additional name_bn | `scripts/translate-bn.py --apply` |

### Evaluated but NOT used

| Source | Reason not used |
|---|---|
| **dorar.net** | No bulk download; scraping likely violates ToS. Underlying data is public domain but their digitization is proprietary. |
| **sunnah.com API** | API access requested — no reply received. |
| **islamweb.net** | Connection refused during testing. |
| **hadith.inoor.ir** | Not tested; listed as fallback option. |

### Referenced / Planned for future enrichment

| Source | Description | License |
|---|---|---|
| **OpenITI** (Open Islamicate Texts Initiative) | GitHub: `github.com/OpenITI/RELEASE`. Digitized classical Arabic manuscripts. Includes: *Tahdhib al-Kamal*, *Taqrib al-Tahdhib*, *Mizan al-I'tidal*, *Al-Jarh wa al-Ta'dil*. Raw text — needs NLP parsing. | CC BY 4.0 |
| **shamela.ws** | Downloadable Arabic Islamic library (.bok format). Full classical rijal books. Needs format converter. | Free for personal/research use |
| **sunnah.com API** | REST API with narrator data for Kutub al-Sittah narrators. Requires free API key at `sunnah.com/developers`. Rate-limited. | Verified hadith science data |
| **islamweb.net/ar/narrators** | Arabic narrator search with bio fields. Server-side rendered. | Scholarly Islamic reference |
| **shamela.ws** | Downloadable Arabic Islamic library (.bok format). Contains full digitized text of all classical rijal books. | Primary classical sources |
| **OpenITI** (Open Islamicate Texts Initiative) | GitHub: `github.com/OpenITI/RELEASE`. Digitized classical Arabic manuscripts as text files. Includes: *Tahdhib al-Kamal*, *Taqrib al-Tahdhib*, *Mizan al-I'tidal*, *Al-Jarh wa al-Ta'dil*. | Direct digitization of primary sources |
| **hadith.inoor.ir** | Iranian hadith API with narrator metadata | Secondary source |

### Classical Primary Sources (Rijal Literature)

These are the scholarly works that all digital narrator databases derive from:

| Work | Author | Narrators | Notes |
|---|---|---|---|
| *Tahdhib al-Kamal fi Asma' al-Rijal* | Al-Mizzi (d. 742 AH) | ~9,000 | Most comprehensive narrator biographies |
| *Taqrib al-Tahdhib* | Ibn Hajar al-Asqalani (d. 852 AH) | ~8,800 | Standard reliability grading reference |
| *Tahdhib al-Tahdhib* | Ibn Hajar al-Asqalani | ~8,800 | Expanded version of Taqrib |
| *Mizan al-I'tidal* | Al-Dhahabi (d. 748 AH) | ~11,000 | Focuses on weak/criticized narrators |
| *Siyar A'lam al-Nubala* | Al-Dhahabi | — | Biographical dictionary, major scholars |
| *Al-Jarh wa al-Ta'dil* | Ibn Abi Hatim al-Razi (d. 327 AH) | ~18,000 | Earliest systematic jarh-wa-ta'dil work |
| *Al-Thiqat* | Ibn Hibban (d. 354 AH) | — | Trustworthy narrators list |

---

## AI Models

### Embedding Model

| Model | Provider | Dimensions | Use | Format |
|---|---|---|---|---|
| **BAAI/bge-m3** | Beijing Academy of AI (HuggingFace) | 1024 | Semantic search — Quran verses + Hadith matn | PyTorch (batch generation), ONNX (Tauri app runtime) |

- PyTorch weights: `~/.cache/huggingface/hub/models--BAAI--bge-m3/` (~2.27GB, auto-downloaded)
- ONNX weights: `src-tauri/resources/models/bge-m3/` (~543MB, bundled in app)
- Embeddings stored as binary BLOB (float32) in SQLite `translations.embedding`
- Generated via `scripts/generate_embeddings.py` using `sentence-transformers` library

### Language Model (Local)

| Model | Source | Parameters | Use | Runtime |
|---|---|---|---|---|
| **Qwen2.5-1.5B-Instruct** (Q4_K_M GGUF) | Alibaba / HuggingFace | 1.5B | AI chatbot, RAG responses | llama.cpp (`llama-server`) on port 8081 |
| **Qwen3.5-9B-OptiQ-4bit** (MLX) | `mlx-community` | 9B | Hadith translation (EN/BN), Bengali narrator transliteration | MLX (`mlx-lm serve`) on port 8080 |

**llama-server launch command:**
```bash
llama-server -m src-tauri/resources/models/qwen-1.5b-q4/qwen2.5-1.5b-instruct-q4_k_m.gguf \
  -c 1024 --threads 2 -ngl 99 --no-webui --port 8081
```

**MLX server launch command:**
```bash
mlx-lm serve --model mlx-community/Qwen3.5-9B-OptiQ-4bit --port 8080
```

**Narrator transliteration note:** `scripts/translate-bn.py` assumes an OpenAI-compatible MLX endpoint and now cleans chat wrappers like `<|im_end|>` from model output before writing to SQLite.

---

## Core Frameworks & Libraries

### Application Framework

| Library | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.4 | Frontend framework (React, SSR/static export) |
| **React** | 19.2.4 | UI components |
| **Tauri** | 2.0 | Desktop app wrapper (Rust backend, native SQLite) |
| **Tailwind CSS** | 4.2.4 | Styling |
| **Framer Motion** | 12.38.0 | Animations |
| **Lucide React** | 1.8.0 | Icons |

### Data & Search

| Library | Version | Purpose |
|---|---|---|
| **@tauri-apps/plugin-sql** | 2.4.0 | SQLite access from frontend via Tauri IPC |
| **better-sqlite3** | 12.9.0 | Synchronous SQLite for Node.js seed scripts |
| **react-force-graph-2d** | 1.29.1 | Force-directed graph for sanad chain visualization |
| **@huggingface/transformers** | 4.2.0 | ONNX model runtime for in-app embeddings |

### Python (Scripts)

| Library | Purpose |
|---|---|
| `sentence-transformers` | BGE-M3 embedding generation |
| `tqdm` | Progress bars in embedding scripts |
| `sqlite3` (stdlib) | DB access in enrichment scripts |
| `requests` | HTTP requests in scraper scripts |
| `beautifulsoup4` | HTML parsing for dorar.net scraper |

---

## Database Files

| File | Size | Contents |
|---|---|---|
| `src-tauri/resources/hujjah-quran.db` | ~342MB | 6,122 Arabic verses, 606,075 translations (94 translators, 42 languages), BGE-M3 embeddings for EN+BN |
| `src-tauri/resources/hujjah-hadith-core.db` | ~587MB | 36,327 hadiths (Kutub al-Sittah), 24,184 narrators, 239,652 narrator chain links, 94,188 narrator edges, FTS5 indexes |
| `src-tauri/resources/hujjah-hadith-research.db` | ~2.2GB | Full 650K hadith research corpus |

**Backup location:** `/Users/rabbi/Desktop/hujjahBackup/20260426_184806/`

---

## Local Data Directory

```
/Users/rabbi/Desktop/hujjah resources/
├── quran-uthmani.sql                           Tanzil Uthmani Arabic text
├── global quran data/                          111 translation JSON files
│   ├── quran-*.json                            (11 Quran text variants)
│   ├── ar.jalalayn.json                        Tafsir al-Jalalayn (Arabic)
│   ├── ar.muyassar.json                        Al-Tafsir al-Muyassar (Arabic)
│   ├── en.*.json                               (14+ English translations)
│   └── ...                                     (80+ other language translations)
└── Sanadset 650K Data on Hadith Narrators/
    ├── sanadset.csv                            650,986 hadiths with parsed sanads
    ├── books.csv                               957 book names
    ├── hadith_samples.csv                      Sample hadiths
    ├── translated_samples.csv                  Sample English translations
    └── chunks/                                 68 chunk files (~10K lines each)
```

---

## APIs Tested / Evaluated

| API | Endpoint tested | Result |
|---|---|---|
| dorar.net narrator search | `https://dorar.net/narrators/search?q=...` | Server-side rendered HTML — data visible but individual narrator URLs require JS execution |
| dorar.net API v1 | `https://dorar.net/api/v1/narrators` | 404 — no narrator API endpoint exists |
| islamweb.net narrators | `https://www.islamweb.net/ar/narrators/search/` | Connection refused |
| hadith.inoor.ir | Referenced | Not tested — mentioned as alternative source |
| sunnah.com developers API | `https://sunnah.com/developers` | Requires free registration — has narrator data for Kutub al-Sittah |
| fawazahmed0/hadith-api (GitHub) | `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions` | Active — hadith text only, no narrator bio data |

---

## Quran Translators (Selected)

The `global quran data/` directory includes translations from:

| Slug | Translator | Language |
|---|---|---|
| `en.asad` | Muhammad Asad | English |
| `en.yusufali` | Abdullah Yusuf Ali | English |
| `en.pickthall` | Marmaduke Pickthall | English |
| `en.shakir` | M.H. Shakir | English |
| `en.sahih` | Saheeh International | English |
| `bn.bengali` | Bengali translation | Bengali |
| `ar.jalalayn` | Al-Jalalayn | Arabic (Tafsir) |
| `ar.muyassar` | Muyassar | Arabic (Tafsir) |
| *(94 total)* | | *(42 languages)* |

---

## Citation / Attribution Notes

- **Sanadset** dataset: If publishing research using this data, cite the original Sanadset dataset authors.
- **Tanzil.net**: Quran text is provided by Tanzil project under their terms of use. Arabic text must not be modified.
- **BAAI/bge-m3**: BGE-M3 model by Beijing Academy of AI, available on HuggingFace under MIT license.
- **Qwen models**: Alibaba Cloud Qwen series, available under Tongyi Qianwen License.
- **Classical rijal works** (Ibn Hajar, al-Mizzi, al-Dhahabi): Public domain — written in 7th–9th century AH.
- **dorar.net**: Data compiled from classical Islamic scholarship. If narrator data is scraped, attribute to the original classical source (e.g., "Ibn Hajar, *Taqrib al-Tahdhib*") not to dorar.net itself.

---

*Last updated: 2026-04-26*
