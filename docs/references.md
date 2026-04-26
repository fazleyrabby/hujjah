# Hujjah — References & Data Sources

*Last updated: 2026-04-26*

---

## Islamic Text Datasets

### Quran

| Source | License | Content | Path |
|---|---|---|---|
| **Tanzil.net** | © Tanzil (no modification) | Uthmani Arabic — 6,236 verses | `hujjah resources/quran-uthmani.sql` |
| **Global Quran Data** | Varies per translator | 94 translators × 6,236 verses, 42 languages (EN, BN, AR + 39 others) | `hujjah resources/global quran data/` |

Included tafsirs: `ar.jalalayn` (Tafsir al-Jalalayn), `ar.muyassar` (Al-Tafsir al-Muyassar).

### Hadith

| Source | License | Content | Path |
|---|---|---|---|
| **Sanadset 650K** | Research use | 650,986 hadiths from 956 books, parsed sanad chains (`<SANAD><NAR>`) | `hujjah resources/Sanadset 650K.../sanadset.csv` |
| **fawazahmed0/hadith-api** | MIT | Hadith translations, multiple languages | GitHub CDN |

**Kutub al-Sittah in DB** (`hujjah-hadith-core.db`):

| Book | Hadiths |
|---|---|
| Sahih al-Bukhari | 6,974 |
| Sahih Muslim | 5,348 |
| Sunan Abu Dawood | 4,567 |
| Jami al-Tirmidhi | 3,813 |
| Sunan Ibn Majah | 4,333 |
| Sunan al-Nasa'i | 11,292 |
| **Total** | **36,327** |

---

## Narrator (Rijal) Enrichment

### Active Sources

| Source | License | Coverage | Fields | Script |
|---|---|---|---|---|
| Manual curation | Internal | 528 narrators | name_en, name_bn, death_year, reliability, city, tabaqah | `enrich-narrators.py` |
| **Wikidata SPARQL** | CC0 | 910 narrators | name_en, death_year, city | `enrich-wikidata.py` |
| **Wikipedia API** | CC BY-SA 4.0 | Gap-fill | death_year, city | `enrich-wikipedia.py` |
| Chain-position analysis | Derived | 22,746 narrators | tabaqah | `auto-tabaqah.py` |
| Bengali transliteration | Generated (Qwen) | 828 narrators | name_bn | `translate-bn.py` |

**Wikidata query:** religion=Islam + died 622–1300 CE + Arabic label. Endpoint: `query.wikidata.org/sparql`.

### Classical Rijal Literature (Primary Sources)

All narrator grading data ultimately derives from these works:

| Work | Author | d. (AH) | Scope |
|---|---|---|---|
| *Tahdhib al-Kamal fi Asma' al-Rijal* | Al-Mizzi | 742 | ~9,000 narrators — most comprehensive |
| *Taqrib al-Tahdhib* | Ibn Hajar al-Asqalani | 852 | ~8,800 — standard grading reference |
| *Mizan al-I'tidal* | Al-Dhahabi | 748 | ~11,000 — weak/disputed narrators |
| *Al-Jarh wa al-Ta'dil* | Ibn Abi Hatim al-Razi | 327 | ~18,000 — earliest systematic work |
| *Al-Thiqat* | Ibn Hibban | 354 | Trustworthy narrators |
| *Siyar A'lam al-Nubala* | Al-Dhahabi | 748 | Major scholars biographies |

### Evaluated / Not Used

| Source | Reason |
|---|---|
| **dorar.net** | Scraping likely violates ToS. Underlying scholarship is public domain but their digitization is proprietary. |
| **sunnah.com API** | API requested — no response. |
| **islamweb.net** | Connection refused during testing. |
| **OpenITI** | CC BY 4.0. Raw Arabic text, no structured data — requires NLP parsing. Future candidate. |
| **shamela.ws** | Free for research. `.bok` proprietary format needs converter. Future candidate. |

---

## AI Models

| Model | Params | License | Use | Runtime |
|---|---|---|---|---|
| **BAAI/bge-m3** | — | MIT | Semantic search embeddings (1024-dim float32) | Python `sentence-transformers` (batch) / ONNX in-app |
| **Qwen2.5-1.5B-Instruct** Q4_K_M | 1.5B | Tongyi Qianwen | AI chatbot + RAG responses | `llama-server` port 8081 |
| **Qwen3.5-9B-OptiQ-4bit** | 9B | Tongyi Qianwen | Hadith translation (EN/BN), Bengali transliteration | `mlx-lm serve` port 8080 |

```bash
# Chatbot model
llama-server -m src-tauri/resources/models/qwen-1.5b-q4/qwen2.5-1.5b-instruct-q4_k_m.gguf \
  -c 1024 --threads 2 -ngl 99 --no-webui --port 8081

# Translation / transliteration model
mlx-lm serve --model mlx-community/Qwen3.5-9B-OptiQ-4bit --port 8080
```

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| Next.js | 16.2.4 | Frontend framework |
| React | 19.2.4 | UI |
| Tauri | 2.0 | Desktop app, Rust backend, native SQLite |
| Tailwind CSS | 4.2.4 | Styling |
| @tauri-apps/plugin-sql | 2.4.0 | SQLite via Tauri IPC |
| @huggingface/transformers | 4.2.0 | ONNX runtime for in-app embeddings |
| react-force-graph-2d | 1.29.1 | Sanad chain force-directed graph |
| better-sqlite3 | 12.9.0 | SQLite in Node.js seed scripts |
| sentence-transformers | latest | BGE-M3 batch embedding generation |

---

## Databases

| File | Size | Contents |
|---|---|---|
| `hujjah-quran.db` | ~342 MB | 6,122 verses, 606,075 translations, BGE-M3 embeddings |
| `hujjah-hadith-core.db` | ~587 MB | 36,327 hadiths, 24,184 narrators, 239,652 chain links, 94,188 edges |
| `hujjah-hadith-research.db` | ~2.2 GB | Full 650K research corpus |

Backups: `/Users/rabbi/Desktop/hujjahBackup/`

---

## Attribution

- **Tanzil**: Quran text © Tanzil project. No modification permitted.
- **Sanadset**: Cite original dataset authors for any published research.
- **Wikidata**: CC0 — no attribution required, but data quality should be noted as community-maintained.
- **Wikipedia**: CC BY-SA 4.0 — attribute Wikimedia contributors.
- **BAAI/bge-m3**: MIT license.
- **Qwen**: Tongyi Qianwen License (Alibaba Cloud).
- **Classical rijal works**: Public domain — 7th–9th century AH scholarship.
