#!/usr/bin/env python3
"""
scripts/translate-bn.py

Transliterates Arabic narrator names to Bengali script using the local
Qwen3.5-9B model via MLX server OpenAI-compatible API at port 8080.

Also handles static city name mapping (no LLM needed).

Usage:
  python3 scripts/translate-bn.py          # Dry run (tests server, shows 3 demos)
  python3 scripts/translate-bn.py --apply  # Process all narrators
  python3 scripts/translate-bn.py --apply --limit 100  # Process first 100

Requires: MLX server running at http://localhost:8080
  mlx-lm serve --model mlx-community/Qwen3.5-9B-OptiQ-4bit --port 8080
"""

import json
import re
import sqlite3
import time
import urllib.request
import urllib.error
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"
LLAMA_URL = os.environ.get("LLAMA_URL", "http://127.0.0.1:8080").rstrip("/")
MODEL_ID = os.environ.get("LLAMA_MODEL", "mlx-community/Qwen3.5-9B-OptiQ-4bit")
REQUEST_TIMEOUT = int(os.environ.get("LLAMA_TIMEOUT", "180"))
REQUEST_RETRIES = int(os.environ.get("LLAMA_RETRIES", "2"))
REQUEST_RETRY_DELAY = float(os.environ.get("LLAMA_RETRY_DELAY", "2"))

PROMPT_TEMPLATE = """Transliterate this Islamic narrator name into standard Bengali script.

Rules:
- Use the English name as the primary canonical form.
- Use the Arabic name only to confirm identity.
- Write only the Bengali transliteration, with no explanation.
- Keep standard Islamic name particles consistent:
  Abu = আবু
  Ibn = ইবনে
  Bint = বিনতে
  al- = আল-
  Abi = আবি

Examples:
Ali ibn Abi Talib -> আলী ইবনে আবি তালিব
Umar ibn al-Khattab -> উমর ইবনে আল-খাত্তাব
Abu Hurayra -> আবু হুরাইরা
Uthman ibn Affan -> উসমান ইবনে আফফান

Arabic name: {name_ar}
English name: {name_en}"""

CACHE: dict[str, str | None] = {}


def strip_response_wrappers(text: str) -> str:
    """Remove common model wrappers before validation."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<\|[^>]+\|>", "", text)
    text = re.sub(r"```(?:text)?", "", text)
    return text.strip()

# Static city name mapping
CITY_BN = {
    'Medina': 'মদিনা',
    'Mecca': 'মক্কা',
    'Basra': 'বসরা',
    'Kufa': 'কুফা',
    'Baghdad': 'বাগদাদ',
    'Egypt': 'মিশর',
    'Damascus': 'দামেশক',
    'Yemen': 'ইয়েমেন',
    'Sanaa': 'সানা',
    'Bukhara': 'বোখারা',
    'Nishapur': 'নিশাপুর',
    'Wasit': 'ওয়াসিত',
    'Merv': 'মার্ভ',
    'Rayy': 'রেয়',
    'Harran': 'হাররান',
    'Yamama': 'ইয়ামামা',
    'Khorasan': 'খোরাসান',
    'Samarkand': 'সামারকান্দ',
    'Balkh': 'বালখ',
    'Syria': 'সিরিয়া',
}


def call_llama(name_ar: str, name_en: str) -> str | None:
    """Call MLX server OpenAI-compatible chat completions API."""
    payload = {
        "model": MODEL_ID,
        "messages": [{
            "role": "user",
            "content": PROMPT_TEMPLATE.format(name_ar=name_ar, name_en=name_en)
        }],
        "max_tokens": 30,
        "temperature": 0.1,
        "stream": False,
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        f"{LLAMA_URL}/v1/chat/completions",
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    for attempt in range(1, REQUEST_RETRIES + 2):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                result = json.loads(resp.read())
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                return strip_response_wrappers(content)
        except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"    Error (attempt {attempt}): {e}")
            if attempt > REQUEST_RETRIES:
                return None
            time.sleep(REQUEST_RETRY_DELAY)


def validate_bengali(text: str) -> bool:
    """Check if text contains Bengali Unicode characters (0x0980-0x09FF)."""
    return bool(re.search(r'[\u0980-\u09FF]', text))


def transliterate_name(name_ar: str, name_en: str) -> str | None:
    """Transliterate a single Arabic name to Bengali."""
    cache_key = " ".join(name_en.split()).strip().lower()
    if cache_key in CACHE:
        return CACHE[cache_key]

    result = call_llama(name_ar, name_en)
    if result:
        # Clean up
        result = strip_response_wrappers(result.strip())
        # Remove common prefixes
        for prefix in ["Bengali:", "bn:", "বাংলা:", "Name:", "Transliteration:"]:
            if result.startswith(prefix):
                result = result[len(prefix):].strip()
        # Remove trailing punctuation
        result = result.rstrip('.,;:!؟')
        # Validate it contains Bengali
        if validate_bengali(result):
            CACHE[cache_key] = result
            return result
        print(f"    Warning: No Bengali chars in '{result}'")
    CACHE[cache_key] = None
    return None


def apply_city_mapping(con: sqlite3.Connection) -> int:
    """Apply static Bengali city name mapping."""
    cur = con.cursor()
    updated = 0
    for city_en, city_bn in CITY_BN.items():
        cur.execute("""
            UPDATE narrators SET city = ? WHERE city = ?
        """, (city_bn, city_en))
        updated += cur.rowcount
    con.commit()
    return updated


def main(dry_run: bool = False, limit: int = 0):
    print("=== Bengali Name Transliteration (MLX Qwen3.5-9B) ===\n")

    # Check if MLX server is running
    try:
        req = urllib.request.Request(f"{LLAMA_URL}/health", method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            health = resp.read().decode('utf-8')
            print(f"  MLX server status: {health}")
    except Exception as e:
        print(f"  ERROR: Cannot reach MLX server at {LLAMA_URL}")
        print(f"  Start it with: mlx-lm serve --model {MODEL_ID} --port 8080")
        return

    # Test inference with a simple request
    print("  Testing inference...")
    test_result = call_llama("أبو هريرة", "Abu Hurayra")
    if not test_result:
        print("  ERROR: MLX server inference failed (timeout or error)")
        print("  Possible causes:")
        print("    1. Model not loaded — wait for server to finish loading")
        print("    2. Insufficient RAM — 9B model needs ~6GB free")
        print("    3. Server not started with correct flags")
        print("  Start command:")
        print(f"    mlx-lm serve --model {MODEL_ID} --port 8080")
        return
    print(f"  Inference test OK: أبو هريرة → {test_result}")

    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    # Get narrators with name_en but no name_bn
    sql = """
        SELECT id, name_ar, name_en
        FROM narrators
        WHERE name_bn IS NULL
        AND name_en IS NOT NULL
        AND name_ar IS NOT NULL
        ORDER BY tabaqah, id
    """
    cur.execute(sql)
    all_names = cur.fetchall()

    if limit > 0:
        all_names = all_names[:limit]

    print(f"  Narrators needing Bengali names: {len(all_names):,}")

    if not all_names:
        print("  Nothing to do — all narrators with name_en have name_bn.")
        con.close()
        return

    if dry_run:
        # Process first 3 as demo
        demo = all_names[:min(3, len(all_names))]
        print(f"\n  Demo (first {len(demo)}):")
        for nid, name_ar, name_en in demo:
            bn_name = transliterate_name(name_ar, name_en)
            if bn_name:
                print(f"    {name_ar} ({name_en}) → {bn_name}")
            else:
                print(f"    {name_ar} ({name_en}) → (failed)")
        print(f"\n  To process all {len(all_names):,} narrators, run:")
        print("  python3 scripts/translate-bn.py --apply")
        con.close()
        return

    # Process all
    total_processed = 0
    total_success = 0
    total_failed = 0

    for nid, name_ar, name_en in all_names:
        bn_name = transliterate_name(name_ar, name_en)
        if bn_name:
            cur.execute("UPDATE narrators SET name_bn = ? WHERE id = ?", (bn_name, nid))
            con.commit()
            total_success += 1
            print(f"  {name_ar} → {bn_name}")
        else:
            total_failed += 1
        total_processed += 1

        # Small delay
        time.sleep(0.2)

        if total_processed % 10 == 0:
            print(f"  Progress: {total_processed}/{len(all_names)} ({total_processed/len(all_names)*100:.1f}%)")

    con.close()

    print(f"\n{'=' * 60}")
    print(f"  Total processed: {total_processed:,}")
    print(f"  Successful:      {total_success:,}")
    print(f"  Failed:          {total_failed:,}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    import sys
    dry_run = '--apply' not in sys.argv
    limit = 0
    for i, arg in enumerate(sys.argv):
        if arg == '--limit' and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    if dry_run:
        main(dry_run=True)
    else:
        main(dry_run=False, limit=limit)
