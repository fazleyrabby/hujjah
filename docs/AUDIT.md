# Hujjah Web App — Audit Task List

**Last Updated:** 2026-05-01
**Priority:** Web first, Tauri later

---

## Critical (Fix Now)

- [x] **C1:** docker-compose.yml mounts DB read-only but web-db.ts enables WAL — ✅ Fixed (removed `:ro`)
- [x] **C2:** No graceful DB unavailability handling — ✅ Fixed (web-db.ts returns failing wrapper, API routes catch and return 500)
- [x] **C3:** `AudioPlayer` component never rendered — ✅ Fixed (already in layout.tsx)

---

## High Priority

- [x] **H1:** No test coverage for web app — ✅ Fixed (added vitest.config.ts, search-utils tests, hadith helper tests, 14 tests passing)
- [x] **H2:** Stale closure bug — ✅ Fixed (`loadSurah` and `handleLangChange` now include `lang` in dependency arrays)
- [x] **H3:** docker-compose.yml healthcheck uses `curl` but image doesn't have it — ✅ Fixed (curl installed in runner image)

---

## Medium Priority

- [ ] **M1:** Hardcoded `VERSE_COUNTS` array in `app/api/audio/route.ts` — should query from DB
- [ ] **M2:** Hardcoded `SITTAH` book IDs `[1688, 1689, 1648, 2014, 1652, 1444]` — should query hadith_books at runtime
- [ ] **M3:** Dockerfile hardcodes `better-sqlite3@11.10.0` version — extract dynamically

---

## Low Priority

- [ ] **L1:** `/chat` page is a stub — remove route or make proper disabled state
- [ ] **L2:** `FeatureGate` is a no-op passthrough — dead infrastructure, remove or implement
- [ ] **L3:** `SettingsDropdown.langOptions` vs `AppNav.langs` prop name mismatch potential
- [ ] **L4:** `DB_DATA_DIR` cwd-dependent resolution in dev — resolve relative to __dirname or apps/web
- [ ] **L5:** Add `tsc --noEmit` to CI / pre-commit hooks

---

## Resolved

- **ChainExplorer tree tab** — Replaced SanadExplorer with ChainGraphFlow (React Flow v12) for mobile responsiveness, draggable nodes, proper bezier edges, click/hover highlighting. Build now passes after fixing useSearchParams suspense boundary in chain/page.tsx.
