#!/usr/bin/env python3
"""
scripts/sunnah-migration/10-generate-embeddings.py

Generate BGE-M3 embeddings for all hadiths with translations.

Targets:
  - EN: translator='sunnah.com'   (42k hadiths)
  - BN: translator='hadith-api'   (24k hadiths)
  - AR: matn_ar field from hadiths table (all hadiths with non-empty matn_ar)

Steps:
  1. Delete orphan embeddings (hadith_id not in hadiths)
  2. Delete stale embeddings for old translators (github-classic)
  3. Generate missing embeddings in batches

Usage:
  # First time setup (run once):
  python3 -m venv .venv
  source .venv/bin/activate
  pip install sentence-transformers tqdm torch

  # Then run:
  source .venv/bin/activate
  python3 10-generate-embeddings.py [--force] [--lang en|bn|ar] [--batch-size 16]
"""

import argparse
import gc
import sqlite3
import struct
import sys
import time
from pathlib import Path

try:
    import torch
    from sentence_transformers import SentenceTransformer
    from tqdm import tqdm
except ImportError:
    print('ERROR: Missing dependencies.')
    print('Setup:')
    print('  python3 -m venv .venv')
    print('  source .venv/bin/activate')
    print('  pip install sentence-transformers tqdm torch')
    sys.exit(1)

SQLITE_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
MODEL_NAME = 'BAAI/bge-m3'
CHUNK_SIZE  = 200
MAX_TEXT_LEN = 2000

# Which translator to embed per language
LANG_TRANSLATOR = {
    'en': 'sunnah.com',
    'bn': 'hadith-api',
    'ar': '__arabic__',  # special: use matn_ar from hadiths table
}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--force', action='store_true', help='Delete and regenerate all embeddings')
    p.add_argument('--lang', choices=['en', 'bn', 'ar', 'all'], default='all')
    p.add_argument('--batch-size', type=int, default=0, help='0 = auto')
    p.add_argument('--limit', type=int, default=0)
    return p.parse_args()


def truncate(text: str, max_len: int = MAX_TEXT_LEN) -> str:
    if len(text) <= max_len:
        return text
    cut = text.rfind(' ', 0, max_len)
    return text[:cut] if cut > 0 else text[:max_len]


def floats_to_blob(arr) -> bytes:
    return struct.pack(f'{len(arr)}f', *arr)


def load_model(low_memory: bool = False) -> SentenceTransformer:
    print(f'[Model] Loading {MODEL_NAME}...')
    t0 = time.time()
    torch.set_num_threads(2 if low_memory else 4)
    model = SentenceTransformer(MODEL_NAME, trust_remote_code=True)
    model.eval()
    print(f'[Model] Ready in {time.time()-t0:.1f}s | dim={model.get_embedding_dimension()}')
    return model


def cleanup_orphans(db: sqlite3.Connection):
    print('[Cleanup] Deleting orphan embeddings...')
    db.execute('DELETE FROM hadith_embeddings WHERE hadith_id NOT IN (SELECT id FROM hadiths)')
    n = db.total_changes
    db.commit()
    print(f'  Deleted: {n:,}')


def cleanup_stale(db: sqlite3.Connection, translators: list[str]):
    for tr in translators:
        db.execute("DELETE FROM hadith_embeddings WHERE translator=?", (tr,))
    n = db.total_changes
    db.commit()
    print(f'[Cleanup] Deleted stale ({", ".join(translators)}): {n:,}')


def get_pending_en_bn(db: sqlite3.Connection, lang: str, translator: str, limit: int = 0):
    sql = """
        SELECT ht.hadith_id, ht.lang_code, ht.matn_text
        FROM hadith_translations ht
        JOIN hadiths h ON h.id = ht.hadith_id
        WHERE ht.lang_code = ? AND ht.translator = ?
          AND ht.matn_text IS NOT NULL AND ht.matn_text != ''
          AND NOT EXISTS (
              SELECT 1 FROM hadith_embeddings e
              WHERE e.hadith_id = ht.hadith_id
                AND e.lang_code = ht.lang_code
                AND e.translator = ht.translator
          )
        ORDER BY ht.hadith_id
    """
    if limit > 0:
        sql += f' LIMIT {limit}'
    return db.execute(sql, (lang, translator)).fetchall()


def get_pending_ar(db: sqlite3.Connection, limit: int = 0):
    sql = """
        SELECT h.id, 'ar', h.matn_ar
        FROM hadiths h
        WHERE h.matn_ar IS NOT NULL AND h.matn_ar != ''
          AND NOT EXISTS (
              SELECT 1 FROM hadith_embeddings e
              WHERE e.hadith_id = h.id AND e.lang_code = 'ar' AND e.translator = 'arabic'
          )
        ORDER BY h.id
    """
    if limit > 0:
        sql += f' LIMIT {limit}'
    return db.execute(sql).fetchall()


def embed_and_store(
    db: sqlite3.Connection,
    model: SentenceTransformer,
    rows: list,
    translator: str,
    batch_size: int,
    desc: str,
) -> int:
    if not rows:
        return 0

    inserted = 0
    for chunk_start in tqdm(range(0, len(rows), CHUNK_SIZE), desc=desc):
        chunk = rows[chunk_start:chunk_start + CHUNK_SIZE]
        hadith_ids = [r[0] for r in chunk]
        lang_codes  = [r[1] for r in chunk]
        texts = [truncate(r[2] or '') for r in chunk]

        # Encode in sub-batches
        with torch.no_grad():
            embeddings = model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,
            )

        batch = []
        for hid, lang, emb in zip(hadith_ids, lang_codes, embeddings):
            blob = floats_to_blob(emb.tolist())
            batch.append((lang, translator, hid, blob))

        db.executemany(
            'INSERT OR REPLACE INTO hadith_embeddings (lang_code, translator, hadith_id, embedding) VALUES (?,?,?,?)',
            batch
        )
        db.commit()
        inserted += len(batch)

        gc.collect()

    return inserted


def main():
    args = parse_args()
    langs = ['en', 'bn', 'ar'] if args.lang == 'all' else [args.lang]

    db = sqlite3.connect(SQLITE_DB)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA synchronous = NORMAL')

    # Show current state
    total_h = db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0]
    existing = db.execute('SELECT lang_code, translator, COUNT(*) FROM hadith_embeddings GROUP BY lang_code, translator').fetchall()
    print(f'\n[State] Total hadiths: {total_h:,}')
    for lang, tr, cnt in existing:
        print(f'  {lang}/{tr}: {cnt:,}')
    print()

    # Cleanup
    cleanup_orphans(db)
    if args.force:
        for lang in langs:
            tr = 'arabic' if lang == 'ar' else LANG_TRANSLATOR[lang]
            cleanup_stale(db, [tr])
    else:
        # Always clean up old github-classic embeddings
        cleanup_stale(db, ['github-classic'])

    # Load model
    model = load_model()
    batch_size = args.batch_size or (8 if not torch.cuda.is_available() else 32)
    print(f'[Config] Batch size: {batch_size} | Device: {"cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"}')

    total_inserted = 0

    for lang in langs:
        print(f'\n[{lang.upper()}] Loading pending rows...')

        if lang == 'ar':
            rows = get_pending_ar(db, args.limit)
            translator = 'arabic'
        else:
            translator = LANG_TRANSLATOR[lang]
            rows = get_pending_en_bn(db, lang, translator, args.limit)

        print(f'  Pending: {len(rows):,}')
        if not rows:
            print('  Nothing to do.')
            continue

        n = embed_and_store(db, model, rows, translator, batch_size, desc=f'{lang.upper()} embeddings')
        print(f'  Inserted: {n:,}')
        total_inserted += n

    # Final state
    print(f'\n[Done] Total inserted: {total_inserted:,}')
    final = db.execute(
        'SELECT lang_code, translator, COUNT(*) FROM hadith_embeddings e JOIN hadiths h ON h.id=e.hadith_id GROUP BY lang_code, translator'
    ).fetchall()
    print('[Final coverage]')
    for lang, tr, cnt in final:
        print(f'  {lang}/{tr}: {cnt:,}')

    db.close()


if __name__ == '__main__':
    main()
