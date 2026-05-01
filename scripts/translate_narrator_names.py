#!/usr/bin/env python3
"""
scripts/translate_narrator_names.py

Batch-translate Arabic narrator names → English + Bengali using Qwen via mlx_lm server.
Updates narrators in hujjah-hadith-core.db where name_en/name_bn is NULL.

Usage:
    python scripts/translate_narrator_names.py                  # full run
    python scripts/translate_narrator_names.py --dry-run      # preview only
    python scripts/translate_narrator_names.py --limit 20   # limit
"""

import argparse
import os
import re
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).parent.parent
APPS_WEB = REPO_ROOT / "apps" / "web"
DB_PATH = APPS_WEB / "data" / "hujjah-hadith-core.db"

API_URL = os.environ.get("OLLAMA_URL", "http://localhost:8081/v1/chat/completions")
MODEL = os.environ.get("OLLAMA_MODEL", "/Users/rabbi/ai/models/Qwen3.5-9B-OptiQ-4bit")

BATCH_SIZE = 10
MAX_TOKENS = 600
MAX_RETRIES = 3
REQUEST_TIMEOUT = 60
WORKERS = 2  # concurrent workers against the server

# Module-level DB handle (set in main())
_db_module = sqlite3

# Module-level DB handle (set in main())
_db_module = sqlite3

# Thread-local DB connections (sqlite3 is thread-bound)
_thread_db = {}


def get_thread_db():
    global _db_module
    tid = threading.get_ident()
    if tid not in _thread_db:
        _thread_db[tid] = _db_module.connect(str(DB_PATH))
    return _thread_db[tid]

# Thread-local session storage
_local = threading.local()


def get_session():
    if not hasattr(_local, "session"):
        _local.session = requests.Session()
    return _local.session


def normalize_arabic(text: str) -> str:
    text = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", text)
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ة", "ه")
    return text.strip()


def translate_batch(names_ar: list[str]) -> str:
    names_list = "\n".join(names_ar)
    prompt = f"""You are a translator for Islamic hadith narrator names.

For each Arabic narrator name below, provide BOTH:
1. English transliteration (standard academic format)
2. Bengali transliteration

Respond EXACTLY one line per name, in this format (no extra text, no numbers):
ARABIC_NAME | English Transliteration | বাংলা অনুবাদ

Rules:
- Use standard academic Arabic transliteration (e.g., ibn, not "bin")
- Bengali: transliterate the NAME only (write ইবনে for "son of")
- Keep Arabic names as-is in the first column
- If a name has kunya (like Abu), keep it: Abu Bakr not "Father of Bakr"
- NO explanation, NO markdown, NO preamble

Names to translate:
{names_list}"""

    session = get_session()
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a precise Islamic names translator."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": MAX_TOKENS,
    }

    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.post(
                API_URL,
                json=payload,
                timeout=REQUEST_TIMEOUT,
                headers={"Connection": "keep-alive"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            last_err = f"HTTP {resp.status_code}"
        except Exception as e:
            last_err = str(e)

        if attempt < MAX_RETRIES - 1:
            time.sleep(0.5 * (attempt + 1))

    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts: {last_err}")


def parse_response(response_text: str, batch: list[dict]) -> list[dict]:
    lines = response_text.strip().split("\n")
    results = []
    batch_map = {normalize_arabic(n["name_ar"]): n for n in batch}

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 3:
            name_ar, name_en, name_bn = parts[0], parts[1], parts[2]
            norm_key = normalize_arabic(name_ar)
            match = batch_map.get(norm_key)
            if match and name_en and name_bn:
                results.append({
                    "id": match["id"],
                    "name_ar": match["name_ar"],
                    "name_en": name_en,
                    "name_bn": name_bn,
                })
    return results


def process_batch(batch: list[dict], dry_run: bool, update_fn) -> tuple[int, int]:
    names_ar = [n["name_ar"] for n in batch]
    try:
        raw = translate_batch(names_ar)
        translations = parse_response(raw, batch)
        wrote = 0
        for t in translations:
            if dry_run:
                print(f"  dry-run: id={t['id']} → en={t['name_en']!r} bn={t['name_bn']!r}")
            else:
                update_fn(t["name_en"], t["name_bn"], t["id"])
            wrote += 1
        skipped = len(batch) - wrote
        return wrote, skipped
    except Exception as e:
        print(f"  ✗ failed: {e}")
        return 0, len(batch)


def find_better_sqlite3_path() -> Path:
    # Search order: apps/web/node_modules, repo root node_modules
    candidates = [
        APPS_WEB / "node_modules" / "better-sqlite3",
        REPO_ROOT / "node_modules" / "better-sqlite3",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]  # fallback


def main():
    parser = argparse.ArgumentParser(description="Translate narrator names using Qwen")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of narrators to process")
    parser.add_argument("--workers", type=int, default=WORKERS, help="Concurrent workers (default: 2)")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"ERROR: DB not found at {DB_PATH}")
        print("Run from repo root or set DB_PATH env var")
        sys.exit(1)

    # Import better-sqlite3 from apps/web node_modules
    global _db_module
    bsq_path = find_better_sqlite3_path()
    sys.path.insert(0, str(bsq_path.parent))
    try:
        import better_sqlite3
        _db_module = better_sqlite3
        print("Using better-sqlite3")
    except ImportError:
        print("⚠️ better-sqlite3 not available, using stdlib sqlite3")

    db = _db_module.connect(str(DB_PATH))

    # Count missing
    total_missing = db.execute(
        "SELECT COUNT(*) FROM narrators WHERE name_en IS NULL OR name_bn IS NULL"
    ).fetchone()[0]
    print(f"📊 Total narrators missing translations: {total_missing:,}")

    # Fetch narrators
    query = "SELECT id, name_ar FROM narrators WHERE name_en IS NULL OR name_bn IS NULL ORDER BY id"
    params = ()
    if args.limit:
        query += " LIMIT ?"
        params = (args.limit,)

    cursor = db.execute(query, params)
    rows = cursor.fetchall()

    if not rows:
        print("✅ Nothing to process")
        return

    narrators = [{"id": r[0], "name_ar": r[1]} for r in rows]
    print(f"📊 Fetched {len(narrators)} narrators to process\n")

    if args.dry_run:
        print("🔍 DRY RUN — no DB writes will occur\n")

    # Prepared update statement
    # For stdlib sqlite3, each worker thread gets its own connection
    if args.dry_run:
        update_fn = None
    else:
        def update_fn(en, bn, id):
            tdb = get_thread_db()
            tdb.execute("UPDATE narrators SET name_en = ?, name_bn = ?, data_source = 'qwen-translated' WHERE id = ?", (en, bn, id))
            tdb.commit()

    total_processed = 0
    total_skipped = 0
    total_batches = (len(narrators) + BATCH_SIZE - 1) // BATCH_SIZE

    def submit_batch(batch_idx: int):
        batch_start = batch_idx * BATCH_SIZE
        batch = narrators[batch_start:batch_start + BATCH_SIZE]
        return process_batch(batch, args.dry_run, update_fn)

    print(f"[Workers: {args.workers}] Starting {total_batches} batches\n")

    batch_num = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = []
        for batch_idx in range(total_batches):
            futures.append(executor.submit(submit_batch, batch_idx))

        for future in as_completed(futures):
            batch_num += 1
            try:
                wrote, skipped = future.result()
                total_processed += wrote
                total_skipped += skipped
                print(f"[{batch_num}/{total_batches}] ✓ wrote {wrote}, skipped {skipped}")
            except Exception as e:
                print(f"[{batch_num}/{total_batches}] ✗ error: {e}")

    print(f"\n✅ Done. Processed: {total_processed}, Skipped: {total_skipped}")
    if args.dry_run:
        print("\n⚠️  Run without --dry-run to write to DB.")

    db.close()


if __name__ == "__main__":
    main()
