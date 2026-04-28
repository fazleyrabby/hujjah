# Session Notes — 2026-04-28 (Updated)

## Chain Graph Visualization (Major Rewrite — Round 2)

### SanadExplorer Component (UPDATED)
- **File**: `packages/ui/src/SanadExplorer.tsx`
- **Edge routing overhaul**: Midpoint curves, close-node straight lines, reduced noise
  - `offset = min(|dx| * 0.08, 40)` (was `|dx| * 0.2`)
  - Midpoint control points: `C x1,midY x2,midY` instead of asymmetric offsets
  - Straight line when `|dx| < 40`
  - Stroke: `rgba(100, 116, 139, 0.6)` instead of `currentColor`
  - Parent edges: `opacity 0.25 / strokeWidth 1` (was `0.5 / 1.2`)
  - Center/child edges: `opacity 0.9 / strokeWidth 2.4`
  - `MAX_EDGES_PER_NODE = 2` limits deep clutter
- **Expansion feedback (NEW)**:
  - `activeNode` state: clicked node gets amber ring + scale for 800ms
  - Connected edges turn amber (`rgba(251, 191, 36, 0.9)`) with `strokeWidth 2.8`
  - `newNodes` diff tracking: newly added nodes flash yellow for 800ms
  - Auto-scrolls expanded node into center view
- **Bug fix**: `useEffect` depending on `allLevels` moved after its `useMemo` declaration

### ChainPreview Component (NEW)
- **File**: `packages/ui/src/ChainPreview.tsx`
- Minimal sanad preview: 1 level teachers + center + 1 level students
- No graph edges, no expansion logic
- Teachers styled sky-blue, students emerald-green, center teal
- "+N more" buttons navigate to full graph view via `onViewMore` callback
- Mobile-friendly `flex-wrap` layout

### RadialSanad Component (NEW)
- **File**: `packages/ui/src/RadialSanad.tsx`
- Radial/circular sanad visualization
- Undirected BFS layering into concentric rings
- `radius = depth * 120`, `angleStep = 2π / count`
- Quadratic Bézier curves for edges with control point pulled toward center
- Hover: connected edges highlight amber, unrelated edges fade to 10%
- Depth-based coloring (rose → amber → emerald → cyan → violet → pink)
- `MAX_PER_LAYER = 40` to prevent overcrowding

### NarratorGraph Component (UPDATED)
- **File**: `packages/ui/src/NarratorGraph.tsx`
- Replaced ASCII connectors (`│ ├ └ ──`) with CSS-based tree lines
- Hover path highlighting: entire sanad path lights up on hover
- Unrelated nodes dim to `opacity-30`
- Smooth expansion animation via `max-height` transition
- Separate click targets: main node navigates, arrow button toggles expand

### Package Exports
- **File**: `packages/ui/src/index.ts`
- Added exports for `ChainPreview` and `RadialSanad`

## Chain Graph Visualization (Major Rewrite)

### SanadExplorer Component (NEW)
- **File**: `packages/ui/src/SanadExplorer.tsx`
- Complete rewrite from recursive tree to BFS layered graph
- **Layout**: Horizontal rows per level, vertical connectors between levels
- **Expansion**: Per-node expand buttons (↑/↓) with actual neighbor loading
- **SVG Lines**: Lightweight connection lines between adjacent levels (no library)
- **Limits**: Base 5 nodes per direction, expands to 10 when toggled
- **Depth**: Default 2 levels, expands to 3 when any node is expanded
- **Hidden counts**: Shows `+N↑` / `+N↓` indicators for remaining nodes
- **Duplicate prevention**: Uses `seen` Set in BFS to avoid same narrator in one layer

### NarratorGraph (Deprecated)
- **File**: `packages/ui/src/NarratorGraph.tsx`
- Old recursive tree component with ASCII connectors
- Still exists but unused in favor of SanadExplorer
- Backup saved as `packages/ui/src/narattorGraphBckup.txt`

### Chain API Endpoints (NEW)
- **File**: `apps/web/app/api/chain/route.ts`
- `GET /api/chain?action=narratorParents&id=X&limit=5` — paginated parent narrators
- `GET /api/chain?action=narratorChildren&id=X&limit=5` — paginated child narrators
- Sorted by `hadith_count DESC` for relevance

### Chain Graph Page Update
- **File**: `apps/web/app/chain/graph/page.tsx`
- Uses SanadExplorer instead of NarratorGraph
- Loads graph data via `/api/chain?action=graph&id=X&depth=2`
- Node click navigates to `/chain?id=X`

## Audio Playback Improvements

### Reciter Selection (NEW)
- **File**: `apps/web/lib/reciters.ts`
- Support for multiple reciters: Alafasy, Husary, Minshawi, Ayyoub, Shaatree, Maher Muaiqly
- Each reciter has multiple CDN sources: `verses.quran.com`, `cdn.islamic.network`, `everyayah.com`

### Audio API Proxy
- **File**: `apps/web/app/api/audio/route.ts`
- Fetches from upstream CDNs with fallback chain
- Prioritizes `islamic.network` (works on VPS), falls back to `everyayah.com`
- Timeout: 25s for upstream fetch
- Returns audio/mpeg with proper headers

### AudioPlayer Component
- **File**: `apps/web/components/AudioPlayer.tsx`
- Bottom bar + floating controls
- Reciter selector dropdown
- Surah progress tracking with verse-by-verse navigation

### AudioContext Updates
- **File**: `apps/web/contexts/AudioContext.tsx`
- Global audio state management
- `loadingRef` guard prevents duplicate audio on rapid clicks
- Verse highlighting and auto-scroll during playback
- Keyboard shortcut: Space to play/pause

## UI Fixes

### Mobile Nav Overflow
- **File**: `packages/ui/src/AppNav.tsx`
- Horizontal scroll on small screens
- Compact padding on mobile

### Sidebar z-index Fix
- **File**: `apps/web/app/page.tsx`
- Mobile overlay: `z-[55]`, Sidebar: `z-[60]`, Header: `z-50`

### ThemeProvider
- **File**: `packages/ui/src/ThemeProvider.tsx`
- Centralized dark mode + font size state
- Used by settings pages

## Deployment

### Docker Build
- Multi-stage build with `better-sqlite3` native rebuild
- Static files copied to correct path: `/app/apps/web/.next/static`
- SQLite binary copied to runner stage

### VPS Deploy Script
- **File**: `scripts/deploy-web.sh`
- Builds locally with `docker buildx`
- Transfers image via `docker save | ssh | docker load`
- Uses Docker Compose for container management
- Cloudflare tunnel for HTTPS

### Environment
- Web app runs on port 3002 (host) → 3000 (container)
- DB files in `/data/hujjah/` (volume mounted)
- Domain: https://hujjah.fazleyrabbi.xyz

## Files Changed

```
packages/ui/src/SanadExplorer.tsx        # NEW - BFS layered graph explorer
packages/ui/src/NarratorGraph.tsx        # Deprecated (tree component)
packages/ui/src/narattorGraphBckup.txt   # Backup of old tree component
packages/ui/src/index.ts                 # Export SanadExplorer
apps/web/app/chain/graph/page.tsx        # Use SanadExplorer
apps/web/app/api/chain/route.ts          # New API: narratorParents, narratorChildren
apps/web/app/api/audio/route.ts          # CDN proxy with fallbacks
apps/web/contexts/AudioContext.tsx       # Global audio state
apps/web/components/AudioPlayer.tsx      # Bottom bar player
apps/web/lib/reciters.ts                 # NEW - Reciter definitions
apps/web/app/page.tsx                    # Audio integration, sidebar fixes
apps/web/app/globals.css                 # Audio highlight styles
```

## Known Issues

- **Turbopack NFT warning**: Dynamic `path.join` in `web-db.ts` — harmless
- **Audio timeout on VPS**: `everyayah.com` may be blocked; `islamic.network` prioritized
- **SVG lines**: Simple straight lines between all nodes in adjacent levels (not precise edges)
