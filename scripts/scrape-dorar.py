#!/usr/bin/env python3
"""
scripts/scrape-dorar.py

dorar.net narrator bio scraper.

STATUS: BLOCKED — dorar.net narrator data is 100% JavaScript-rendered.
The search page (/search?query=...&scope=narrator) returns HTML with
collapsible cards but NO individual narrator detail links or data.
All narrator content is loaded via client-side JS after page load.

Tested approaches (all failed):
1. GET /narrators/search?q=... → 404
2. GET /narrator/{id} → 404
3. GET /raji/{id} → 404
4. POST /search with X-Requested-With → 405
5. api.dorar.net → DNS resolution failure
6. Parsing search page HTML → no narrator data in server-rendered HTML

Alternative targets to investigate:
- islamweb.net/ar/narrators/ (also returned 404)
- sunnah.com (has narrator info but limited)
- hadith.inoor.ir (Iranian, may have API)
- shamela.ws (may have downloadable narrator database)

If a working source is found, this script should:
1. Get top 3000 narrators by degree from narrator_edges
2. For each, search the source and extract: death_year, tabaqah, reliability, city
3. Rate limit: 1.5s between requests
4. Save progress to dorar-narrators.json (resumable)
5. Apply to DB with normalized matching
"""

import sqlite3
import json
import time
import re
from pathlib import Path
from urllib.parse import quote

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"
PROGRESS_FILE = Path("/Users/rabbi/Desktop/hujjah resources/dorar-narrators.json")

def normalize_arabic(text: str) -> str:
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)
    text = re.sub(r'[ٱآإأ]', 'ا', text)
    text = text.replace('ة', 'ه')
    text = text.replace('ى', 'ي')
    text = text.replace('ـ', '')
    return text.strip()

def get_top_narrators(limit: int = 3000) -> list:
    """Get top narrators by degree (connection count)."""
    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()
    cur.execute("""
        SELECT n.id, n.name_ar, COUNT(*) as deg
        FROM narrators n
        JOIN narrator_edges e ON e.from_narrator_id = n.id OR e.to_narrator_id = n.id
        GROUP BY n.id
        ORDER BY deg DESC
        LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    con.close()
    return [{'id': r[0], 'name_ar': r[1], 'degree': r[2]} for r in rows]

def load_progress() -> dict:
    """Load previously scraped data."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {}

def save_progress(data: dict):
    """Save scraped data."""
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    print("=== dorar.net Narrator Scraper ===\n")
    print("STATUS: BLOCKED")
    print("dorar.net narrator data is 100% JavaScript-rendered.")
    print("No server-side API or detail page URLs found.\n")

    print("Tested approaches:")
    print("  1. GET /narrators/search?q=... → 404")
    print("  2. GET /narrator/{id} → 404")
    print("  3. GET /raji/{id} → 404")
    print("  4. POST /search → 405")
    print("  5. api.dorar.net → DNS failure")
    print("  6. Parse search HTML → no narrator data\n")

    print("Alternative sources to investigate:")
    print("  - sunnah.com (limited narrator info)")
    print("  - hadith.inoor.ir (Iranian API)")
    print("  - shamela.ws (downloadable database)")
    print("  - islamweb.net/ar/narrators/ (also 404)\n")

    # Show what we'd scrape if we had access
    narrators = get_top_narrators(10)
    print("Top 10 narrators by degree (would be scraped):")
    for n in narrators:
        print(f"  {n['name_ar']} (degree: {n['degree']})")

if __name__ == "__main__":
    main()
