#!/usr/bin/env python3
"""
generate_embeddings.py

High-performance embedding pipeline for Hujjah Quran translations.
Uses BAAI/bge-m3 via sentence-transformers to generate 1024-dim
multilingual embeddings stored in SQLite.

Usage:
    python3 scripts/generate_embeddings.py
    python3 scripts/generate_embeddings.py --batch-size 64 --workers 4
    python3 scripts/generate_embeddings.py --lang en --force

Features:
    - Batch processing with configurable size
    - Parallel encoding (multiprocessing)
    - Resume support (skips already embedded rows)
    - Progress bar with ETA
    - Memory-efficient streaming
"""

import argparse
import sqlite3
import struct
import sys
import time
from multiprocessing import Pool, cpu_count
from pathlib import Path

try:
    from sentence_transformers import SentenceTransformer
    from tqdm import tqdm
except ImportError:
    print("❌ Missing dependencies. Run:")
    print("   python3 -m venv .venv")
    print("   source .venv/bin/activate")
    print("   pip install sentence-transformers tqdm")
    sys.exit(1)

# ─── Configuration ───
DEFAULT_DB = "src-tauri/resources/hujjah-quran.db"
DEFAULT_MODEL = "BAAI/bge-m3"
DEFAULT_BATCH_SIZE = 32
DEFAULT_WORKERS = max(1, cpu_count() // 2)
DEFAULT_LANG = "en"
CHUNK_SIZE = 1000  # Rows to fetch at a time


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Quran embeddings with bge-m3")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to SQLite database")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SentenceTransformer model name")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Encoding batch size")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Parallel workers")
    parser.add_argument("--lang", default=DEFAULT_LANG, help="Language code to embed (en/bn/ar)")
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


def get_pending_rows(conn: sqlite3.Connection, lang: str, limit: int = 0) -> list[tuple[int, str]]:
    """Fetch rows that need embeddings."""
    sql = """
        SELECT id, text FROM translations
        WHERE lang_code = ? AND embedding IS NULL
        ORDER BY id
    """
    params = [lang]
    if limit > 0:
        sql += " LIMIT ?"
        params.append(limit)

    cursor = conn.execute(sql, params)
    return cursor.fetchall()


def count_embedded(conn: sqlite3.Connection, lang: str) -> int:
    """Count how many embeddings already exist."""
    cursor = conn.execute(
        "SELECT COUNT(*) FROM translations WHERE lang_code = ? AND embedding IS NOT NULL",
        (lang,),
    )
    return cursor.fetchone()[0]


def count_total(conn: sqlite3.Connection, lang: str) -> int:
    """Count total rows for this language."""
    cursor = conn.execute(
        "SELECT COUNT(*) FROM translations WHERE lang_code = ?",
        (lang,),
    )
    return cursor.fetchone()[0]


def encode_batch(model: SentenceTransformer, texts: list[str], batch_size: int) -> list[list[float]]:
    """Generate normalized embeddings for a batch of texts."""
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        normalize_embeddings=True,  # L2 normalize for cosine similarity
        convert_to_numpy=True,
    )
    return embeddings.tolist()


def store_embeddings(conn: sqlite3.Connection, items: list[tuple[int, bytes]]) -> None:
    """Store embeddings as float32 binary blobs."""
    cursor = conn.executemany(
        "UPDATE translations SET embedding = ? WHERE id = ?",
        [(emb, row_id) for row_id, emb in items],
    )
    conn.commit()
    return cursor.rowcount


def float32_list_to_bytes(vec: list[float]) -> bytes:
    """Convert list of floats to compact float32 bytes."""
    return struct.pack(f"<{len(vec)}f", *vec)


def process_chunk(args: tuple) -> list[tuple[int, bytes]]:
    """Worker function: encode a chunk of texts."""
    model_name, texts_with_ids, batch_size = args
    model = SentenceTransformer(model_name, trust_remote_code=True)
    model.eval()

    ids = [t[0] for t in texts_with_ids]
    texts = [t[1] for t in texts_with_ids]

    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )

    results = []
    for row_id, vec in zip(ids, embeddings):
        blob = struct.pack(f"<{len(vec)}f", *vec.astype(float))
        results.append((row_id, blob))

    return results


def main():
    args = parse_args()
    db_path = Path(args.db)

    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)

    print("🔥 Embedding Generation Pipeline")
    print("=" * 40)
    print(f"DB:        {db_path}")
    print(f"Model:     {args.model}")
    print(f"Language:  {args.lang}")
    print(f"Batch:     {args.batch_size}")
    print(f"Workers:   {args.workers}")
    print()

    # Open DB
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    # Clear if forced
    if args.force:
        print("🗑️  Clearing existing embeddings...")
        conn.execute(
            "UPDATE translations SET embedding = NULL WHERE lang_code = ?",
            (args.lang,),
        )
        conn.commit()
        print("  ✅ Cleared")

    # Stats
    total = count_total(conn, args.lang)
    done = count_embedded(conn, args.lang)
    print(f"\n📊 Total rows: {total:,} | Already embedded: {done:,} | Pending: {total - done:,}")

    if total == 0:
        print("❌ No rows found for this language")
        conn.close()
        sys.exit(1)

    if done == total:
        print("✅ All embeddings already generated (use --force to regenerate)")
        conn.close()
        return

    # Fetch pending rows
    print("\n📖 Fetching pending rows...")
    pending = get_pending_rows(conn, args.lang, args.limit)
    pending_count = len(pending)
    print(f"  {pending_count:,} rows to process")

    if pending_count == 0:
        print("✅ Nothing to do")
        conn.close()
        return

    # Single-process mode (more reliable for model loading)
    # For bge-m3, multiprocessing with model copies wastes RAM
    # Instead we use a single process with large batches
    print(f"\n🚀 Starting embedding generation (single-process, batched)...")
    start_time = time.time()

    model = init_model(args.model)
    dim = model.get_embedding_dimension()
    print(f"  📝 Processing {pending_count:,} texts...\n")

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
                    "UPDATE translations SET embedding = ? WHERE id = ?",
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
    final_done = count_embedded(conn, args.lang)
    conn.close()

    print(f"\n{'=' * 40}")
    print(f"✅ Done!")
    print(f"   Processed:  {processed:,} rows")
    print(f"   Failed:     {failed:,} rows")
    print(f"   Total done: {final_done:,}/{total:,}")
    print(f"   Time:       {elapsed:.1f}s")
    print(f"   Speed:      {rate:.1f} rows/sec")
    print(f"   Data:       {total_bytes / 1024 / 1024:.1f} MB stored")
    print(f"{'=' * 40}")


if __name__ == "__main__":
    main()