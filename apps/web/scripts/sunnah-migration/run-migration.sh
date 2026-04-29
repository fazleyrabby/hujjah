#!/bin/bash
##
## scripts/sunnah-migration/run-migration.sh
##
## Master migration script - runs all 6 phases
##
## Usage: bash run-migration.sh
##
## Phases:
##   1. Export backup data (narrators, chains, AI translations)
##   2. Import ALL Sunnah.com hadiths (42,694)
##   3. Restore Bengali translations (from hadith-api CDN + AI)
##   4. Rebuild narrator chains
##   5. Regenerate embeddings (queue jobs)
##   6. Validate integrity
##
## IMPORTANT: Run from apps/web directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  Sunnah.com Migration Script"
echo "  Branch: sunnah-migration"
echo "=============================================="

# Check if MySQL is available
echo ""
echo "[Check] Verifying MySQL connection..."
if ! mysql -h localhost -u root -e "USE sunnahdb" 2>/dev/null; then
    echo "ERROR: MySQL sunnahdb not available"
    exit 1
fi
echo "OK"

# Check DB files exist
echo ""
echo "[Check] Verifying database files..."
if [ ! -f "data/hujjah-hadith-core.db" ]; then
    echo "ERROR: Database not found at data/hujjah-hadith-core.db"
    exit 1
fi
echo "OK"

# Check exports directory exists
if [ ! -d "scripts/sunnah-migration/exports" ]; then
    echo "WARNING: exports directory not found - run 01-export-backup.py first"
    echo "         (or skipping if you only want to import Sunnah.com)"
fi

echo ""
echo "=============================================="
echo "  Running Migration Phases"
echo "=============================================="

# Phase 1: Export (optional - only if exports don't exist)
if [ ! -d "scripts/sunnah-migration/exports" ]; then
    echo ""
    echo "[Phase 1] Skipping export (no exports directory)"
else
    echo ""
    echo "[Phase 1] Exporting backup data..."
    python3 scripts/sunnah-migration/01-export-backup.py
fi

# Phase 2: Import Sunnah.com
echo ""
echo "[Phase 2] Importing Sunnah.com hadiths..."
python3 scripts/sunnah-migration/02-import-sunnah-all.py

# Phase 3: Restore Bengali
echo ""
echo "[Phase 3] Restoring Bengali translations..."
python3 scripts/sunnah-migration/03-restore-bengali.py

# Phase 4: Rebuild chains
echo ""
echo "[Phase 4] Rebuilding narrator chains..."
python3 scripts/sunnah-migration/04-rebuild-chains.py

# Phase 5: Embeddings (placeholder - needs async job queue)
echo ""
echo "[Phase 5] Embeddings regeneration..."
echo "  (Skipping - requires async job processing)"
echo "  Run: python3 scripts/sunnah-migration/05-regenerate-embeddings.py"

# Phase 6: Validate
echo ""
echo "[Phase 6] Validating database integrity..."
python3 scripts/sunnah-migration/06-validate.py

echo ""
echo "=============================================="
echo "  Migration Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Test web app: pnpm --filter @hujjah/web dev"
echo "  2. Check hadith search works"
echo "  3. Verify narrator chain graph"
echo ""
echo "If issues, restore from backup:"
echo "  cp data/hujjah-hadith-core.db.pre-migration data/hujjah-hadith-core.db"