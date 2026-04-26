# Sanad Chain Visualization — Implementation Plan

## Current State (Updated Apr 26 2026)

**What we have:**
- ~36K hadith (Kutub al-Sittah) with full sanad chains in `hujjah-hadith-core.db`
- `narrators` table: 24,184 rows with columns: `id`, `name_ar`, `name_en`, `name_bn`, `birth_year`, `death_year`, `tabaqah`, `reliability`, `city`, `data_source`
- `hadith_narrators`: 239,652 links tracking position in each chain
- `narrator_edges`: 94,188 adjacency links with `hadith_count`
- `/chain` page: EN/BN/AR i18n, search, bio profile card, NarratorGraph (react-force-graph-2d)
- Backend `get_sanad_graph` Tauri command for recursive traversal
- **100% tabaqah coverage** via chain-position analysis
- **528 narrators** with curated bio data (`name_en`, birth/death, reliability, city, `data_source='manual'`)
- **528/528 Bengali narrator names populated** in `name_bn` via local MLX transliteration

**Scripts built:**
- `scripts/normalize-arabic.py` — Arabic diacritic stripping + variant normalization (222 new matches)
- `scripts/auto-tabaqah.py` — Chain-position-based tabaqah for all 24K narrators
- `scripts/translate-bn.py` — Bengali transliteration via local MLX server at port 8080
- `scripts/enrich-v2.py` — Master pipeline orchestrator
- `scripts/scrape-dorar.py` — exploratory dorar.net bio scraper (currently blocked by JS-rendered detail pages)

**What's still needed:**
- More narrator bio data beyond the 528 curated records
- A reliable source or scraper for large-scale rijal enrichment beyond manual seeding
- QA pass on transliteration style consistency for edge-case narrator spellings

## Recent Findings

- `enrich-v2.py` needed loader fixes because helper scripts use hyphenated filenames (`normalize-arabic.py`, `auto-tabaqah.py`, `translate-bn.py`).
- The local MLX server on `127.0.0.1:8080` works for transliteration once `enable_thinking` is disabled and response cleanup strips chat terminators like `<|im_end|>`.
- `code-server` may respawn on port `8080`; if MLX and code-server compete for the same port, move MLX or stop the supervising code-server process.

---

## Phase 1: Data Enrichment

### 1.1 Narrator Biographical Data
**Goal:** Add scholarly metadata to narrators

| Field | Source | Priority |
|---|---|---|
| `name_en` (transliteration) | Manual curation / existing datasets | **High** |
| `birth_year` (AH) | Tahdhib al-Tahdhib / existing APIs | **High** |
| `death_year` (AH) | Tahdhib al-Tahdhib | **High** |
| `tabaqah` (generation) | Computed from death year | **High** |
| `reliability` | Grading from classical sources | **Medium** |
| `city` | Geographic origin | **Medium** |

**Schema change:**
```sql
ALTER TABLE narrators ADD COLUMN name_en TEXT;
ALTER TABLE narrators ADD COLUMN birth_year INTEGER;
ALTER TABLE narrators ADD COLUMN death_year INTEGER;
ALTER TABLE narrators ADD COLUMN tabaqah INTEGER;
ALTER TABLE narrators ADD COLUMN reliability TEXT; -- 'thiqah', 'saduq', 'daif', etc.
ALTER TABLE narrators ADD COLUMN city TEXT;
```

**Data sources to investigate:**
- `shamela.ws` / `hadith.inoor.ir` — structured narrator databases
- Existing open datasets (e.g., `hadithscience` GitHub repos)
- Manual curation for top 200 most-connected narrators first

### 1.2 Tabaqah Computation
```
Tabaqah 1: Sahaba (died before ~100 AH)
Tabaqah 2: Tabi'un (~100-150 AH)
Tabaqah 3: Tabi' al-Tabi'in (~150-200 AH)
Tabaqah 4: Later scholars (200+ AH)
```

---

## Phase 2: Visual Graph Rendering

### 2.1 Technology Choice
| Option | Pros | Cons |
|---|---|---|
| **react-force-graph** | Interactive, 2D/3D, force-directed | 50KB bundle |
| **Cytoscape.js** | Mature, great for bio networks | 200KB bundle |
| **Custom SVG** | Zero deps, full control | More dev work |
| **D3.js** | Flexible, powerful | 300KB bundle |

**Recommendation:** `react-force-graph` (2D) — lightweight, interactive, good for this use case

### 2.2 Graph Features
- **Force-directed layout** with narrator nodes
- **Node sizing** by degree (number of connections)
- **Node coloring** by tabaqah/generation
- **Edge thickness** by hadith_count
- **Hover tooltips** with narrator bio
- **Click to expand** neighbors
- **Zoom + pan** support
- **Dark mode** compatible

### 2.3 Graph View Modes
| Mode | Description |
|---|---|
| **Single Chain** | Linear view of one hadith's sanad |
| **Narrator Hub** | All teachers/students of a narrator |
| **Common Chain** | Shared paths between two hadith |
| **Full Network** | Subgraph of a book or era |

---

## Phase 3: UX Enhancements

### 3.1 Chain Explorer Page Redesign
```
┌─────────────────────────────────────────┐
│  🔍 Search narrator or hadith #         │
├─────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  Narrator   │  │    Graph View    │  │
│  │  Profile    │  │  (force graph)   │  │
│  │             │  │                  │  │
│  │ Birth/Death│  │  ○ → ○ → ○      │  │
│  │ Tabaqah    │  │   ↘     ↗        │  │
│  │ Reliability│  │    ○ → ○         │  │
│  │ City       │  │                  │  │
│  └─────────────┘  └──────────────────┘  │
├─────────────────────────────────────────┤
│  Teachers (12)    │    Students (45)    │
│  • Malik (23)     │  • Ahmad (12)       │
│  • Nafi' (15)     │  • Bukhari (8)      │
│  • ...            │  • ...              │
├─────────────────────────────────────────┤
│  Featured Chains                        │
│  🏆 Golden Chain: Malik → Nafi' → Ibn  │
│     Umar (32 hadith in Muwatta)         │
│  📖 Bukhari's teachers (1,200 narrators)│
└─────────────────────────────────────────┘
```

### 3.2 Single Hadith Chain View
- Inline chain display on hadith cards (in `/hadith` page)
- Click chain to open full explorer
- Visual timeline with era markers

---

## Phase 4: Advanced Features

### 4.1 Common Chain Detection
```sql
-- Find shared narrator paths between two hadith
WITH chain1 AS (SELECT narrator_id FROM hadith_narrators WHERE hadith_id = ?),
     chain2 AS (SELECT narrator_id FROM hadith_narrators WHERE hadith_id = ?)
SELECT narrator_id FROM chain1 INTERSECT SELECT narrator_id FROM chain2;
```

### 4.2 Statistical Insights
| Metric | Description |
|---|---|
| Most connected narrators | Top 20 by degree |
| Shortest chains | Hadith with fewest narrators |
| Longest chains | Hadith with most narrators |
| Bridge narrators | Connect different eras/regions |

### 4.3 Export / Share
- Export chain as PNG/SVG
- Share link to specific chain view
- Print-friendly layout

---

## Implementation Order

1. **Week 1:** Narrator bio data import script + schema migration
2. **Week 2:** Install `react-force-graph`, basic graph component
3. **Week 3:** Redesign `/chain` page with split layout (profile + graph)
4. **Week 4:** Hover tooltips, click-to-expand, dark mode
5. **Week 5:** Common chain detection, featured chains section
6. **Week 6:** Polish, performance testing, README update

---

## Open Questions

1. **Data source priority:** Should we start with manual curation of top 200 narrators, or try to import from an existing dataset first?
2. **Graph library preference:** `react-force-graph` (recommended) or another option?
3. **Scope:** Should we focus on Kutub al-Sittah only for now, or include the full 650K research tier?
4. **Timeline:** Any deadline constraints?
