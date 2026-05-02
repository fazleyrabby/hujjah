# Session Notes — 2026-05-02

## Narrator Deduplication (fix/narrator-chain-rebuild branch)

### Problem
- Narrator IDs from sanadset had duplicates — same `name_en` appearing with multiple IDs
- e.g., "Sufyan al-Thawri" had 20 IDs, "Anas ibn Malik" had 17 IDs
- Abu Hurayrah appeared as both teacher AND student in chain graph → loops
- Caused by sanadset import assigning new auto-increment IDs to same narrator names

### Fix Applied
Ran deduplication script on local DB (`apps/web/data/hujjah-hadith-core.db`):

```python
# For each duplicate name_en group:
#   - Keep smallest ID as canonical
#   - DELETE all other narrator IDs from hadith_narrators, narrator_edges, narrators
```

**Results:**
| Metric | Before | After |
|--------|--------|-------|
| Narrator rows | 24,190 | 19,526 |
| Duplicate groups | 2,705 | 0 |
| hadith_narrators rows | 175,088 | 135,941 |
| narrator_edges rows | 61,545 | 36,790 |
| Duplicate narrator IDs removed | — | 4,664 |

**Narrator graph loops eliminated.** Abu Hurayrah and other duplicate-named narrators no longer appear as separate nodes in the same chain.

### VPS name_bn Sync
- 4,732 narrators on VPS missing `name_bn` (Bengali translations)
- Local DB had all translations filled
- CSV exported: `/Users/rabbi/Desktop/Work Notes/narrators_202605021120.csv`
- Synced to VPS via python update script

## Chain Data Status

### Coverage (local DB)
| Book | Total | With Chains | Coverage |
|------|-------|-------------|----------|
| Sahih Muslim | 7,459 | 7,309 | 98.0% |
| Sahih al-Bukhari | 7,277 | 6,465 | 88.8% |
| Jami' at-Tirmidhi | 3,114 | 2,982 | 95.8% |
| Sunan Ibn Majah | 4,345 | 4,334 | 99.7% |
| Sunan Abu Dawud | 5,276 | 4,560 | 86.4% |
| Sunan al-Kubra (al-Nasa'i) | 11,292 | 11,281 | 99.9% |
| Sunan an-Nasa'i | 5,180 | 0 | 0.0% |
| Musnad Ahmad | 1,359 | 0 | 0.0% |
| Mishkat al-Masabih | 4,433 | 0 | 0.0% |
| **Total** | **53,986** | **36,931** | **68.4%** |

### Chain Gap Analysis
- ~17K hadiths missing chains (mostly secondary sources outside Kutub al-Sittah)
- sanadset 650K data has 246K narrator names NOT in local DB — different narrator name set
- Attempted sanadset chain import via text matching hit this mismatch
- Current chains come from backup DB restoration (scripts 15-16-restore-chains) which worked for Kutub al-Sittah

### Hadith 74986 Issue (example of remaining gaps)
- Local: book=1689 (Sahih Muslim), num_in_book=1, chain=5 narrators
- Sanadset: Muslim #1 has different matn text entirely (not the same hadith)
- Jibril hadith (Islam/Iman) is sanadset Muslim #12 with 34 narrators
- Numbering mismatch between sources — exact chain for this hadith requires text-hash matching

**Not fixed** — this requires a dedicated text-matching re-import to resolve properly.

## Sanadset 650K Data Assessment

| Aspect | Finding |
|--------|---------|
| sanadset narrator names | 263,916 unique names |
| Local DB narrator names | 19,526 after dedup |
| Overlap | ~17K names shared |
| Missing from local | 246,104 names |

**Implication:** sanadset uses a different narrator naming convention than local DB. Direct name-based matching is unreliable. Any full chain re-import requires first importing all 246K missing narrators.

## Backup Location
Local DB snapshot: `/Volumes/1TB SSD/HujjahDB/snapshots/2026-05-02_121019_hadith-core.db`

## What's Working
- `/chain?id=X` — narrator profile, teachers/students, edge hadiths
- `/chain?hadith=Y` — hadith chain view with sanad
- `/chain/graph` — 2-hop network graph
- Duplicate narrator loops in graph — FIXED

## What Needs More Work
- ~17K hadiths missing chains (non-Kutub al-Sittah sources)
- Sunan an-Nasa'i vs Sunan al-Kubra duplication (same content, different numbering)
- Hadith numbering mismatch between sanadset and sunnah.com sources
- Full 246K narrator import from sanadset (future project)
