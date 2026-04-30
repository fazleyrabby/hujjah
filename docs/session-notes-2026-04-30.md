# Session Notes — 2026-04-30

## Narrator Chain Recovery — Backup DB Restoration

### Problem
- sunnah.com API provides no narrator chain markup (only ~1/42,000 has embedded chains)
- Original 36K Kutub al-Sittah chains lost during sunnah.com data import
- Backup DB (`/Users/rabbi/Desktop/HujjahBackup/hujjah-hadith-core.db`) has full chains for 36K hadiths

### Scripts Written

| Script | Purpose | Result |
|--------|---------|--------|
| `15-restore-chains-from-backup.py` | Match sunnah.com hadiths → backup DB by (book_id, sunnah_hadith_number = num_in_book) | 25,510 chains restored |
| `16-restore-subdivision-chains.py` | Map letter subdivisions (901a, 901b) to base hadith's chain | Subdivisions mapped |

### Recovery Stats

| Collection | Sunnah Hadiths | Matched | With Chains | Coverage |
|-----------|---------------|---------|-------------|----------|
| Ibn Majah | 4,345 | 4,335 | 4,332 | 99.7% |
| Muslim | 7,459 | 7,214 | 7,206 | 96.6% |
| Tirmidhi | 3,114 | 3,016 | 2,973 | 95.5% |
| Bukhari | 7,277 | 6,448 | 6,439 | 88.5% |
| Abu Dawud | 5,276 | 4,568 | 4,560 | 86.4% |
| **Total** | **27,471** | | **25,510** | **92.9%** |

### Narrator Data
- Narrators: 24,190 (matched by name, no duplicates)
- Narrator links: 173,985
- Narrator edges: 58,416
- `sanad_length` updated: 25,650 hadiths now have chain length > 0

### Remaining Gaps
- ~1,700 pure numeric gaps (sunnah.com has different hadith numbering than backup)
- Nasai: 0% — sunnah.com Sunan Sughra ≠ backup Sunan Kubra (different books)
- Non-Kutub al-Sittah (Mishkat, Riyadh, etc.): no chain source yet

### Data Sources Used

| Source | Data | License |
|--------|------|---------|
| Backup DB (HujjahBackup) | Narrator chains for Kutub al-Sittah | Local backup — original data owner |

### Snapshot
`/Volumes/1TB SSD/HujjahDB/snapshots/2026-04-30_163545/`

## Chain Explorer UI

### Pages
- `/chain` — HadithChain (`/chain?hadith=X`) + NarratorExplorer (`/chain?id=X`)
- `/chain/graph` — Tree (SanadExplorer), Chain, Radial views
- "View Chain" links appear on hadith cards when `sanad_length > 0`

### SanadExplorer (Tree View)
- BFS from center node, fixed depth 1
- Per-level limit: 5 teachers/5 students (doubled to 10 when expanded)
- Up/Down arrows toggle expanded state for center node only
- SVG connection lines, hover highlights, node click navigation
- Tabqah labels (Sahaba, Tabi'un, Tabi' al-Tabi'in, Later Scholar)

### Bug Fixes
- TreeView infinite recursion → replaced with SanadExplorer
- Duplicate React keys in hadith list
- SettingsDropdown missing from chain/graph page header

## About Page Update
- Narrator Chains label changed: `IMPORTING` → `RESTORED`
- Stats updated: 24,190 narrators, 173,985 links, 25,510 hadiths
