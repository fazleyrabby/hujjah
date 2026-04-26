#!/usr/bin/env python3
"""
generate_arabic_embeddings.py

High-performance embedding pipeline for Hujjah Quran Arabic text.
Uses BAAI/bge-m3 via sentence-transformers to generate 1024-dim
embeddings stored in the 'verses' table of the SQLite database.
"""

import argparse
import sqlite3
import struct
import sys
import time
from pathlib import Path

try:
    from sentence_transformers import SentenceTransformer
    from tqdm import tqdm
except ImportError:
    print("❌ Missing dependencies. Run:")
    print("   pip install sentence-transformers tqdm")
    sys.exit(1)

# ─── Configuration ───
DEFAULT_DB = "src-tauri/resources/hujjah-quran.db"
DEFAULT_MODEL = "BAAI/bge-m3"
DEFAULT_BATCH_SIZE = 32
CHUNK_SIZE = 1000  # Rows to fetch at a time


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Quran Arabic embeddings with bge-m3")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to SQLite database")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SentenceTransformer model name")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Encoding batch size")
    parser.add_argument("--force", action="store_true", help="Clear existing embeddings and regenerate")
    parser.add_argument("--limit", type=int, default=0, help="Limit rows (0 = all)")
    return parser.parse_args()


def init_model(model_name: str) -> SentenceTransformer:
    """Load the embedding model."""
    print(f"📦 Loading model: {model_name}")
    start = time.time()
    model = SentenceTransformer(model_name, trust_remote_code=True)
    model.eval()
    elapsed = time.time() - start
    print(f"  ✅ Model loaded in {elapsed:.1f}s")
    print(f"  📐 Embedding dimension: {model.get_embedding_dimension()}")
    return model


def get_pending_rows(conn: sqlite3.Connection, limit: int = 0) -> list[tuple[int, str]]:
    """Fetch rows from verses table that need embeddings."""
    sql = """
        SELECT id, text_ar FROM verses
        WHERE embedding IS NULL
        ORDER BY id
    """
    params = []
    if limit > 0:
        sql += " LIMIT ?"
        params.append(limit)

    cursor = conn.execute(sql, params)
    return cursor.fetchall()


def count_embedded(conn: sqlite3.Connection) -> int:
    """Count how many embeddings already exist in verses table."""
    cursor = conn.execute(
        "SELECT COUNT(*) FROM verses WHERE embedding IS NOT NULL",
    )
    return cursor.fetchone()[0]


def count_total(conn: sqlite3.Connection) -> int:
    """Count total rows in verses table."""
    cursor = conn.execute(
        "SELECT COUNT(*) FROM verses",
    )
    return cursor.fetchone()[0]


def main():
    args = parse_args()
    db_path = Path(args.db)

    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)

    print("🔥 Arabic Embedding Generation Pipeline")
    print("=" * 40)
    print(f"DB:        {db_path}")
    print(f"Model:     {args.model}")
    print(f"Batch:     {args.batch_size}")
    print()

    # Open DB
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    # Clear if forced
    if args.force:
        print("🗑️  Clearing existing Arabic embeddings...")
        conn.execute("UPDATE verses SET embedding = NULL")
        conn.commit()
        print("  ✅ Cleared")

    # Stats
    total = count_total(conn)
    done = count_embedded(conn)
    print(f"\n📊 Total verses: {total:,} | Already embedded: {done:,} | Pending: {total - done:,}")

    if total == 0:
        print("❌ No verses found in database")
        conn.close()
        sys.exit(1)

    if done == total:
        print("✅ All Arabic embeddings already generated (use --force to regenerate)")
        conn.close()
        return

    # Fetch pending rows
    print("\n📖 Fetching pending rows...")
    pending = get_pending_rows(conn, args.limit)
    pending_count = len(pending)
    print(f"  {pending_count:,} verses to process")

    if pending_count == 0:
        print("✅ Nothing to do")
        conn.close()
        return

    print(f"\n🚀 Starting embedding generation (single-process, batched)...")
    start_time = time.time()

    model = init_model(args.model)
    dim = model.get_embedding_dimension()
    print(f"  📝 Processing {pending_count:,} Arabic texts...\n")

    processed = 0
    failed = 0
    total_bytes = 0

    # Process in chunks
    with tqdm(total=pending_count, unit="rows", ncols=80) as pbar:
        for i in range(0, pending_count, CHUNK_SIZE):
            chunk = pending[i : i + CHUNK_SIZE]
            ids = [row[0] for row in chunk]
            texts = [row[1] for row in chunk]

            try:
                embeddings = model.encode(
                    texts,
                    batch_size=args.batch_size,
                    show_progress_bar=False,
                    normalize_embeddings=True,
                    convert_to_numpy=True,
                )

                # Prepare for DB insert
                items = []
                for row_id, vec in zip(ids, embeddings):
                    blob = struct.pack(f"<{dim}f", *vec.astype(float))
                    items.append((blob, row_id))
                    total_bytes += len(blob)

                # Batch update
                conn.executemany(
                    "UPDATE verses SET embedding = ? WHERE id = ?",
                    items,
                )
                conn.commit()

                processed += len(chunk)
                pbar.update(len(chunk))

            except Exception as e:
                print(f"\n⚠️  Chunk failed: {e}")
                failed += len(chunk)
                pbar.update(len(chunk))

    elapsed = time.time() - start_time
    rate = processed / elapsed if elapsed > 0 else 0

    # Final stats
    final_done = count_embedded(conn)
    conn.close()

    print(f"\n{'=' * 40}")
    print(f"✅ Done!")
    print(f"   Processed:  {processed:,} verses")
    print(f"   Failed:     {failed:,} verses")
    print(f"   Total done: {final_done:,}/{total:,}")
    print(f"   Time:       {elapsed:.1f}s")
    print(f"   Speed:      {rate:.1f} verses/sec")
    print(f"   Data:       {total_bytes / 1024 / 1024:.1f} MB stored")
    print(f"{'=' * 40}")


if __name__ == "__main__":
    main()
