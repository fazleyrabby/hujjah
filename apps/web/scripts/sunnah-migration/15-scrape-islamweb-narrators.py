#!/usr/bin/env python3
"""
scripts/sunnah-migration/15-scrape-islamweb-narrators.py

Scrape narrator biographical data from islamweb.net library
(classical books: Tahdhib al-Kamal, Siyar A'lam al-Nubala, etc.)

Saves to: scraped/islamweb-narrators.json
Format: [{"islamweb_id": N, "name_ar": "...", "death_year": N, "city": "...",
           "reliability": "...", "teachers": [...], "students": [...]}, ...]

robots.txt: allows crawling (only /newislamweb/ blocked)
Legal: classical Islamic scholarship (isnad/rijal data) — not copyrightable
       Email sent to islamweb.net requesting data partnership.

Import with: python3 16-import-islamweb-narrators.py

Usage:
  python3 15-scrape-islamweb-narrators.py --limit 20        # test
  python3 15-scrape-islamweb-narrators.py --start 1 --end 5000
  python3 15-scrape-islamweb-narrators.py --all             # full run (slow)
"""

import argparse
import json
import os
import re
import time
import urllib.request
import urllib.error
import sys

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'scraped')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'islamweb-narrators.json')

BASE_URL    = 'https://www.islamweb.net/ar/library/content/60/{id}/'
RATE_LIMIT  = 3.0   # req/sec (conservative)
TIMEOUT     = 15
MAX_ID      = 50000  # upper bound to scan

# Patterns for extracting biographical data from HTML
DEATH_RE       = re.compile(r'(?:توف[يى]|المتوف[يى]|ت[:\s]+)\s*(?:سنة\s+)?(\d{2,4})\s*(?:هـ|ه)', re.UNICODE)
BIRTH_RE       = re.compile(r'(?:ولد|المولود)\s*(?:سنة\s+)?(\d{2,4})\s*(?:هـ|ه)', re.UNICODE)
CITY_RE        = re.compile(r'(?:من أهل|نسبة إلى|البصري|الكوفي|المدني|الدمشقي|المصري|البغدادي|البخاري)\s*([\u0600-\u06FF\s]{3,30})', re.UNICODE)
RELIABILITY_RE = re.compile(r'(ثقة|صدوق|ضعيف|متروك|كذاب|مجهول|حسن الحديث|لا بأس به|وثقه|ضعفه)', re.UNICODE)


def fetch_page(islamweb_id: int) -> str | None:
    url = BASE_URL.format(id=islamweb_id)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; Hujjah-Research/1.0; mailto:fazley111@gmail.com)',
        'Accept-Language': 'ar,en;q=0.9',
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except Exception:
        return None


def extract_text(html: str) -> str:
    """Strip HTML tags."""
    text = re.sub(r'<[^>]+>', ' ', html)
    return re.sub(r'\s+', ' ', text).strip()


def parse_narrator(islamweb_id: int, html: str) -> dict | None:
    text = extract_text(html)

    # Skip non-narrator pages (too short or no Arabic)
    arabic_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    if arabic_chars < 50:
        return None

    # Extract name from <title> or <h1>
    title_m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
    h1_m    = re.search(r'<h1[^>]*>([^<]+)</h1>', html, re.IGNORECASE)
    name_raw = (h1_m or title_m)
    name_ar = extract_text(name_raw.group(1)) if name_raw else ''
    # Clean site name suffix
    name_ar = re.sub(r'\s*[\|–-].*', '', name_ar).strip()

    if not name_ar or len(name_ar) < 3:
        return None

    death_m = DEATH_RE.search(text)
    birth_m = BIRTH_RE.search(text)
    reliability_matches = RELIABILITY_RE.findall(text)

    # Most frequent reliability verdict
    reliability = ''
    if reliability_matches:
        from collections import Counter
        reliability = Counter(reliability_matches).most_common(1)[0][0]

    return {
        'islamweb_id': islamweb_id,
        'name_ar':     name_ar,
        'death_year':  int(death_m.group(1)) if death_m else None,
        'birth_year':  int(birth_m.group(1)) if birth_m else None,
        'reliability': reliability or None,
        'text_snippet': text[:500],
    }


def load_existing() -> dict[int, dict]:
    if not os.path.exists(OUTPUT_FILE):
        return {}
    with open(OUTPUT_FILE, encoding='utf-8') as f:
        data = json.load(f)
    return {entry['islamweb_id']: entry for entry in data}


def save(results: dict[int, dict]):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(list(results.values()), f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--end',   type=int, default=5000)
    parser.add_argument('--all',   action='store_true', help=f'Scan all IDs up to {MAX_ID}')
    parser.add_argument('--limit', type=int, default=0, help='Max pages to fetch this run')
    args = parser.parse_args()

    start = 1 if args.all else args.start
    end   = MAX_ID if args.all else args.end

    existing = load_existing()
    print(f'Resuming — {len(existing):,} already scraped')
    print(f'Scanning IDs {start}–{end} | rate={RATE_LIMIT}/sec')

    interval  = 1.0 / RATE_LIMIT
    fetched   = 0
    found     = 0
    not_found = 0
    errors    = 0

    for islamweb_id in range(start, end + 1):
        if islamweb_id in existing:
            continue
        if args.limit and fetched >= args.limit:
            break

        t0 = time.time()
        try:
            html = fetch_page(islamweb_id)
        except Exception as e:
            print(f'  ERROR {islamweb_id} — {e}')
            errors += 1
            time.sleep(2)
            continue

        fetched += 1

        if html is None:
            not_found += 1
        else:
            entry = parse_narrator(islamweb_id, html)
            if entry:
                existing[islamweb_id] = entry
                found += 1

        # Save every 100
        if fetched % 100 == 0:
            save(existing)
            pct = (islamweb_id - start) / (end - start) * 100 if end > start else 0
            print(f'  id={islamweb_id} | fetched={fetched:,} | found={found:,} | not_found={not_found:,} | errors={errors:,} ({pct:.0f}%)')

        elapsed = time.time() - t0
        wait = interval - elapsed
        if wait > 0:
            time.sleep(wait)

    save(existing)
    print(f'\n[Done] found={found:,} narrators | saved to {OUTPUT_FILE}')


if __name__ == '__main__':
    main()
