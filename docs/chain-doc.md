# Chain Visualizer — Isnad Enrichment, Visual Graph & i18n

> Historical implementation plan. As of 2026-04-26, the core chain visualizer is live: `/chain` has EN/BN/AR i18n, `NarratorGraph`, enriched narrator fields, 100% `tabaqah` coverage, and `name_bn` populated for all 528 manually enriched narrators. Treat the remaining sections below as original planning context, not the current gap list.

## Context

Build a fully featured sanad chain visualizer for Kutub al-Sittah. The isnad parsing is already complete — `hadith_narrators` (239K rows) and `narrator_edges` (94K rows) are populated. The `/chain` page, `chain-db.ts` query layer, and `get_sanad_graph` Rust command all exist.

**Gaps to fill:**
1. `narrators` table — only `id` + `name_ar`, missing bio fields
2. No visual graph — current "Show Graph" renders a plain text div list
3. No multilingual UI text (EN/BN/AR)
4. Missing DB indexes (`hadith_narrators(hadith_id, position)`, etc.)

---

## Phase 1: DB Schema + Bio Data

### Script: `scripts/enrich-narrators.py`

Migrations to run on `src-tauri/resources/hujjah-hadith-core.db`:

```sql
ALTER TABLE narrators ADD COLUMN name_en TEXT;
ALTER TABLE narrators ADD COLUMN birth_year INTEGER;  -- AH
ALTER TABLE narrators ADD COLUMN death_year INTEGER;  -- AH
ALTER TABLE narrators ADD COLUMN tabaqah INTEGER;     -- 1=Sahaba 2=Tabi'un 3=Tabi' al-Tabi'in 4+
ALTER TABLE narrators ADD COLUMN reliability TEXT;    -- 'thiqah' | 'saduq' | 'daif' | 'mawdu'
ALTER TABLE narrators ADD COLUMN city TEXT;

CREATE INDEX IF NOT EXISTS idx_hn_hadith_pos ON hadith_narrators(hadith_id, position);
CREATE INDEX IF NOT EXISTS idx_ne_from ON narrator_edges(from_narrator_id);
CREATE INDEX IF NOT EXISTS idx_ne_to ON narrator_edges(to_narrator_id);

CREATE VIRTUAL TABLE IF NOT EXISTS narrator_search_idx USING fts5(
  name_ar, name_en, content='narrators', content_rowid='id'
);
```

**Bio data:** Seed top 200 narrators (by `narrator_edges` degree) from open dataset JSON (sunnah.com-derived / hadith.inoor.ir). Tabaqah auto-computed from death_year (≤100 AH = 1, 101–150 = 2, 151–220 = 3, 221+ = 4).

---

## Phase 2: i18n for Chain Page

### i18n strings object (inline in `app/chain/page.tsx`)

```ts
const CHAIN_I18N = {
  en: {
    pageTitle: 'Chain Explorer',
    heading: 'Sanad Chain Explorer',
    subtitle: 'Search for a narrator to explore their transmission chains. Covers Kutub al-Sittah (36K hadith).',
    placeholder: 'Search narrator name (Arabic)...',
    showGraph: 'Show Graph (2-hop)',
    teachers: 'Teachers (narrated from)',
    students: 'Students (narrated to)',
    networkTitle: '2-Hop Network',
    networkMeta: (nodes: number, edges: number) => `${nodes} narrators · ${edges} transmission links`,
    hadith: 'hadith',
    hadithLabel: (from: string, to: string) => `Hadith: ${from} → ${to}`,
  },
  bn: {
    pageTitle: 'সনদ এক্সপ্লোরার',
    heading: 'সনদ চেইন এক্সপ্লোরার',
    subtitle: 'একজন রাবীর নাম খুঁজুন এবং তাদের বর্ণনা সূত্র দেখুন। কুতুব আল-সিত্তাহ (৩৬ হাজার হাদিস)।',
    placeholder: 'রাবীর নাম খুঁজুন (আরবি)...',
    showGraph: 'গ্রাফ দেখুন (২-স্তর)',
    teachers: 'শায়খগণ (যাঁদের থেকে বর্ণনা করেছেন)',
    students: 'ছাত্রগণ (যাঁরা বর্ণনা করেছেন)',
    networkTitle: '২-স্তর নেটওয়ার্ক',
    networkMeta: (nodes: number, edges: number) => `${nodes} জন রাবী · ${edges}টি সনদ সংযোগ`,
    hadith: 'হাদিস',
    hadithLabel: (from: string, to: string) => `হাদিস: ${from} → ${to}`,
  },
  ar: {
    pageTitle: 'مستكشف الإسناد',
    heading: 'مستكشف سلسلة الإسناد',
    subtitle: 'ابحث عن راوٍ لاستكشاف سلاسل روايته. يشمل الكتب الستة (٣٦ ألف حديث).',
    placeholder: 'ابحث عن اسم الراوي (بالعربية)...',
    showGraph: 'عرض الشبكة (درجتان)',
    teachers: 'الشيوخ (روى عنهم)',
    students: 'التلاميذ (رووا عنه)',
    networkTitle: 'شبكة درجتين',
    networkMeta: (nodes: number, edges: number) => `${nodes} راوٍ · ${edges} رابطاً في الإسناد`,
    hadith: 'حديث',
    hadithLabel: (from: string, to: string) => `الحديث: ${from} ← ${to}`,
  },
};
```

Add `lang` state (`'en' | 'bn' | 'ar'`) with toggle buttons in the header (same EN/BN/AR pattern as the rest of the app). Replace all hardcoded strings with `t.key` where `t = CHAIN_I18N[lang]`.

---

## Phase 3: Visual Graph Component

### Install

```bash
pnpm add react-force-graph-2d
```

### New file: `components/NarratorGraph.tsx`

```ts
interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  onNodeClick: (node: NarratorNode) => void;
}
```

Rendering rules:
- Node size = `4 + Math.sqrt(degree)` (degree precomputed from edges array)
- Node color by tabaqah: `1→#10b981, 2→#3b82f6, 3→#8b5cf6, 4→#f59e0b, null→#6b7280`
- Center node: teal ring (`color: '#0d9488'`, larger radius)
- Edge width = `Math.log(hadith_count + 1)`
- Hover tooltip: `name_ar`, `name_en` (if available), tabaqah label, death year AH
- Click → `onNodeClick(node)`
- `backgroundColor` = `darkMode ? '#18181b' : '#f9fafb'`
- Use `dynamic import` with `ssr: false` (avoids SSR crash)

### Update `app/chain/page.tsx`

- Replace lines 198–214 (graphMode text-list div) with `<NarratorGraph nodes={...} edges={...} centerId={selectedNarrator.id} darkMode={darkMode} onNodeClick={handleSelectNarrator} />`
- Add bio row in profile card (death year, tabaqah badge, reliability badge, city) — render only if non-null

### Update `lib/chain-db.ts`

Extend `NarratorNode` type:
```ts
interface NarratorNode {
  id: number;
  name_ar: string;
  name_en?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  tabaqah?: number | null;
  reliability?: string | null;
  city?: string | null;
}
```

Update `searchNarrators` and `getNarratorById` to SELECT new columns. Switch `searchNarrators` from `LIKE` to FTS5 on `narrator_search_idx`.

---

## Phase 4: Common Chain Detection

Add to `lib/chain-db.ts`:

```ts
export async function getCommonNarrators(hadithId1: number, hadithId2: number): Promise<NarratorNode[]>
```

SQL:
```sql
WITH chain1 AS (SELECT narrator_id FROM hadith_narrators WHERE hadith_id = ?),
     chain2 AS (SELECT narrator_id FROM hadith_narrators WHERE hadith_id = ?)
SELECT n.id, n.name_ar FROM narrators n
WHERE n.id IN (SELECT narrator_id FROM chain1 INTERSECT SELECT narrator_id FROM chain2)
```

---

## Files

| File | Action |
|---|---|
| `scripts/enrich-narrators.py` | New — migration + bio seed |
| `src-tauri/resources/hujjah-hadith-core.db` | Modified by script |
| `lib/chain-db.ts` | Extend types, FTS5 search, common chain fn |
| `components/NarratorGraph.tsx` | New — force graph component |
| `app/chain/page.tsx` | i18n + NarratorGraph + bio card |

---

## Handover Prompt (paste into new session)

```
Project: /Users/rabbi/Desktop/Projects/hujjah (Tauri + Next.js Islamic app)
Docs: /Users/rabbi/Desktop/Projects/hujjah/docs/chain-doc.md

TASK: Implement the sanad chain visualizer. Read chain-doc.md first.

KEY CONTEXT:
- Isnad parsing already done. hadith_narrators (239K rows) + narrator_edges (94K rows) populated.
- narrators table has only id + name_ar — needs bio columns added via migration script.
- /chain page (app/chain/page.tsx) exists but graphMode (lines 198-214) shows plain text list.
- chain-db.ts has all query functions + NarratorNode/NarratorEdge types.
- hadith_ar uses XML tags: <SANAD><NAR>name</NAR></SANAD><MATN>text</MATN>
- DB: src-tauri/resources/hujjah-hadith-core.db

IMPLEMENTATION ORDER:
1. Create + run scripts/enrich-narrators.py — migrate DB, add bio columns, build FTS5 + indexes
2. Update NarratorNode type in lib/chain-db.ts + switch searchNarrators to FTS5
3. pnpm add react-force-graph-2d
4. Build components/NarratorGraph.tsx (tabaqah-colored force graph, SSR-safe)
5. Add CHAIN_I18N (EN/BN/AR) to app/chain/page.tsx + lang toggle in header
6. Replace text-list graphMode section with <NarratorGraph>
7. Add bio fields (death_year, tabaqah badge, reliability, city) to profile card
```

---

## Verification

1. `python3 scripts/enrich-narrators.py` — bio columns populated, FTS5 built, indexes created
2. `sqlite3 src-tauri/resources/hujjah-hadith-core.db "SELECT name_en, tabaqah FROM narrators WHERE name_en IS NOT NULL LIMIT 5;"`
3. `pnpm dev` → `/chain` → search `أَبُو هُرَيْرَةَ`
4. Toggle EN → BN → AR — all labels change correctly
5. Click "Show Graph" → force graph renders with colored nodes
6. Hover node → tooltip shows name_en + tabaqah + death year
7. Click node → navigates to that narrator's profile
