#!/usr/bin/env python3
"""
generate_hadith_embeddings.py

Memory-optimized embedding pipeline for Hujjah Hadith corpus.
Uses BAAI/bge-m3 via sentence-transformers to generate 1024-dim
multilingual embeddings stored in SQLite.

Usage:
    python3 scripts/generate_hadith_embeddings.py
    python3 scripts/generate_hadith_embeddings.py --batch-size 16
    python3 scripts/generate_hadith_embeddings.py --low-memory
    python3 scripts/generate_hadith_embeddings.py --force
"""

import argparse
import gc
import os
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
    print("❌ Missing dependencies. Run:")
    print("   python3 -m venv .venv36")
    print("   source .venv36/bin/activate")
    print("   pip install sentence-transformers tqdm")
    sys.exit(1)

# ─── Configuration ───
DEFAULT_DB = "src-tauri/resources/hujjah-hadith-core.db"
DEFAULT_MODEL = "BAAI/bge-m3"
DEFAULT_BATCH_SIZE = 16
LOW_MEMORY_BATCH_SIZE = 8
CHUNK_SIZE = 100        # Reduced from 500 to limit RAM
MAX_TEXT_LEN = 2000     # Truncate to ~512 tokens


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Hadith embeddings with bge-m3")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to SQLite database")
    parser.add_argument("--batch-size", type=int, default=0, help="Encoding batch size (0 = auto)")
    parser.add_argument("--force", action="store_true", help="Clear existing embeddings and regenerate")
    parser.add_argument("--limit", type=int, default=0, help="Limit rows (0 = all)")
    parser.add_argument("--low-memory", action="store_true", help="Aggressive memory-saving mode")
    return parser.parse_args()


def truncate_text(text: str, max_len: int = MAX_TEXT_LEN) -> str:
    """Truncate text at word boundary."""
    if len(text) <= max_len:
        return text
    cut = text.rfind(' ', 0, max_len)
    if cut > 0:
        return text[:cut]
    return text[:max_len]


def init_model(model_name: str, low_memory: bool = False) -> SentenceTransformer:
    """Load the embedding model with memory optimizations."""
    print(f"[Model] Loading: {model_name}")
    start = time.time()

    # Limit torch threads to reduce memory fragmentation
    torch.set_num_threads(2 if low_memory else 4)

    # Load model - trust_remote_code for BGE-M3
    model = SentenceTransformer(model_name, trust_remote_code=True)
    model.eval()

    elapsed = time.time() - start
    print(f"[Model] Loaded in {elapsed:.1f}s | Dimension: {model.get_embedding_dimension()}")
    return model


def count_stats(conn: sqlite3.Connection) -> tuple:
    """Return (total_translations, existing_embeddings)."""
    total = conn.execute("""
        SELECT COUNT(*) FROM hadith_translations ht
        WHERE ht.translator = 'github-classic'
          AND (ht.matn_text IS NOT NULL AND ht.matn_text != '')
    """).fetchone()[0]
    existing = conn.execute("SELECT COUNT(*) FROM hadith_embeddings").fetchone()[0]
    return total, existing


def create_table(conn: sqlite3.Connection) -> None:
    """Create embeddings table if not exists."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hadith_embeddings (
            id INTEGER PRIMARY KEY,
            lang_code TEXT NOT NULL,
            translator TEXT NOT NULL,
            hadith_id INTEGER NOT NULL REFERENCES hadiths(id),
            embedding BLOB NOT NULL,
            UNIQUE(hadith_id, lang_code, translator)
        )
    """)
    conn.commit()


def store_batch(conn: sqlite3.Connection, items: list[tuple]) -> None:
    """Store a batch of embeddings."""
    conn.executemany("""
        INSERT OR REPLACE INTO hadith_embeddings (id, lang_code, translator, hadith_id, embedding)
        VALUES (?, ?, 'github-classic', ?, ?)
    """, items)
    conn.commit()


def get_pending_cursor(conn: sqlite3.Connection, limit: int = 0):
    """Return a streaming cursor for pending rows (no fetchall)."""
    sql = """
        SELECT ht.id, ht.hadith_id, ht.lang_code, ht.matn_text, h.matn_ar
        FROM hadith_translations ht
        JOIN hadiths h ON h.id = ht.hadith_id
        WHERE ht.translator = 'github-classic'
          AND (ht.matn_text IS NOT NULL AND ht.matn_text != '')
          AND NOT EXISTS (
              SELECT 1 FROM hadith_embeddings he
              WHERE he.hadith_id = ht.hadith_id
                AND he.lang_code = ht.lang_code
                AND he.translator = ht.translator
          )
        ORDER BY ht.id
    """
    if limit > 0:
        sql += f" LIMIT {limit}"
    return conn.execute(sql)


def process_chunk(
    conn: sqlite3.Connection,
    model: SentenceTransformer,
    rows: list[tuple],
    dim: int,
    batch_size: int,
    pbar: tqdm,
) -> tuple[int, int, int]:
    """Process a single chunk and return (processed, failed, bytes_stored)."""
    if not rows:
        return 0, 0, 0

    ids = [row[0] for row in rows]
    lang_codes = [row[2] for row in rows]
    hadith_ids = [row[1] for row in rows]
    texts = [truncate_text(row[3] or row[4]) for row in rows]

    try:
        with torch.no_grad():
            embeddings = model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )

        items = []
        total_bytes = 0
        for row_id, lang_code, hadith_id, vec in zip(ids, lang_codes, hadith_ids, embeddings):
            blob = struct.pack(f"<{dim}f", *vec.astype(float))
            items.append((row_id, lang_code, hadith_id, blob))
            total_bytes += len(blob)

        store_batch(conn, items)
        pbar.update(len(rows))

        # ─── Aggressive cleanup ───
        del embeddings, items, texts, ids, lang_codes, hadith_ids
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return len(rows), 0, total_bytes

    except Exception as e:
        print(f"\n[Error] Chunk: {e}")
        pbar.update(len(rows))
        return 0, len(rows), 0


def main():
    args = parse_args()
    db_path = Path(args.db)

    if not db_path.exists():
        print(f"[Error] Database not found: {db_path}")
        sys.exit(1)

    # Determine batch size
    if args.batch_size > 0:
        batch_size = args.batch_size
    elif args.low_memory:
        batch_size = LOW_MEMORY_BATCH_SIZE
    else:
        batch_size = DEFAULT_BATCH_SIZE

    print("=" * 50)
    print(" Hadith Embedding Generation (BGE-M3)")
    print("=" * 50)
    print(f"[Config] DB: {db_path}")
    print(f"[Config] Batch size: {batch_size}")
    print(f"[Config] Chunk size: {CHUNK_SIZE}")
    print(f"[Config] Low memory: {args.low_memory}")
    print(f"[Config] Max text length: {MAX_TEXT_LEN} chars")
    print()

    # Open DB
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    create_table(conn)

    # Clear if forced
    if args.force:
        print("[DB] Clearing existing embeddings...")
        conn.execute("DELETE FROM hadith_embeddings")
        conn.commit()
        print("[DB] Cleared")

    # Stats
    total, existing = count_stats(conn)
    pending_count = total - existing
    print(f"[Stats] Total translations: {total:,}")
    print(f"[Stats] Existing embeddings: {existing:,}")
    print(f"[Stats] Need to generate: {pending_count:,}")

    if pending_count == 0:
        print("[Done] All embeddings already generated")
        conn.close()
        return

    # Load model
    model = init_model(DEFAULT_MODEL, low_memory=args.low_memory)
    dim = model.get_embedding_dimension()
    print(f"[Model] Output dimension: {dim}")

    # Count actual pending with limit
    actual_limit = args.limit if args.limit > 0 else pending_count

    # Process with streaming cursor
    print(f"\n[Process] Starting generation...")
    start_time = time.time()
    processed = 0
    failed = 0
    total_bytes = 0

    cursor = get_pending_cursor(conn, args.limit)

    with tqdm(total=actual_limit, unit="texts", ncols=80, initial=0) as pbar:
        chunk = []
        for row in cursor:
            chunk.append(row)
            if len(chunk) >= CHUNK_SIZE:
                p, f, b = process_chunk(conn, model, chunk, dim, batch_size, pbar)
                processed += p
                failed += f
                total_bytes += b
                chunk = []
                # Periodic GC between chunks
                gc.collect()

        # Final partial chunk
        if chunk:
            p, f, b = process_chunk(conn, model, chunk, dim, batch_size, pbar)
            processed += p
            failed += f
            total_bytes += b

    cursor.close()
    elapsed = time.time() - start_time
    rate = processed / elapsed if elapsed > 0 else 0

    # Final stats
    final_done = conn.execute("SELECT COUNT(*) FROM hadith_embeddings").fetchone()[0]
    conn.close()

    print()
    print("=" * 50)
    print(" RESULTS")
    print("=" * 50)
    print(f"  Processed:    {processed:,} texts")
    print(f"  Failed:      {failed:,} texts")
    print(f"  Total done:  {final_done:,}/{total:,}")
    print(f"  Time:        {elapsed:.1f}s ({rate:.1f} texts/sec)")
    print(f"  Data stored: {total_bytes / 1024 / 1024:.1f} MB")
    print("=" * 50)


if __name__ == "__main__":
    main()
