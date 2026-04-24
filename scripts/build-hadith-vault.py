#!/usr/bin/env python3
"""
Build Hadith Vault — Phase 1: Kutub al-Sittah

Creates src-tauri/resources/hujjah-hadith.db from Sanadset 650K CSV chunks.
Only seeds the 6 canonical books (~24K hadith).
"""

import csv
import sqlite3
import sys
import re
from pathlib import Path

csv.field_size_limit(sys.maxsize)

def strip_diacritics(text: str) -> str:
    return re.sub(r'[\u064B-\u0652\u0670]', '', text)

# ─── Config ───
DATA_DIR = Path("/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/chunks")
OUTPUT_DIR = Path(__file__).parent.parent / "src-tauri" / "resources"
DB_PATH = OUTPUT_DIR / "hujjah-hadith.db"
BATCH_SIZE = 1000

# Kutub al-Sittah (canonical 6 books) — exact names from dataset
KUTUB_AL_SITTAH = {
    "صحيح البخاري",
    "صحيح مسلم",
    "سنن أبي داود",
    "جامع الترمذي",
    "السنن الكبرى للنسائي",
    "سنن ابن ماجه",
}

# English mapping for display
BOOK_NAMES_EN = {
    "صحيح البخاري": "Sahih al-Bukhari",
    "صحيح مسلم": "Sahih Muslim",
    "سنن أبي داود": "Sunan Abu Dawood",
    "جامع الترمذي": "Jami' at-Tirmidhi",
    "السنن الكبرى للنسائي": "Sunan al-Kubra (al-Nasa'i)",
    "سنن ابن ماجه": "Sunan Ibn Majah",
}

# ─── Sanad Parser ───
def parse_sanad(raw: str) -> list[str]:
    if not raw or raw == "No SANAD":
        return []
    # Strip [' and '] then split
    if raw.startswith("['") and raw.endswith("']"):
        raw = raw[2:-2]
    return [
        re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()
        for s in raw.split("', '")
        if s.strip()
    ]

# ─── Schema ───
SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE hadith_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL UNIQUE,
  name_en TEXT,
  hadith_count INTEGER DEFAULT 0
);

CREATE TABLE hadiths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES hadith_books(id),
  num_in_book INTEGER NOT NULL,
  hadith_ar TEXT NOT NULL,
  matn_ar TEXT NOT NULL,
  sanad_length INTEGER DEFAULT 0,
  UNIQUE(book_id, num_in_book)
);

CREATE TABLE narrators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL UNIQUE
);

CREATE TABLE hadith_narrators (
  hadith_id INTEGER NOT NULL REFERENCES hadiths(id),
  narrator_id INTEGER NOT NULL REFERENCES narrators(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (hadith_id, narrator_id, position)
);

CREATE VIRTUAL TABLE hadith_search_idx USING fts5(
  matn_ar,
  hadith_id UNINDEXED,
  book_id UNINDEXED,
  tokenize = 'unicode61'
);




CREATE TABLE narrator_edges (
  from_narrator_id INTEGER NOT NULL REFERENCES narrators(id),
  to_narrator_id INTEGER NOT NULL REFERENCES narrators(id),
  hadith_count INTEGER DEFAULT 1,
  PRIMARY KEY (from_narrator_id, to_narrator_id)
);

CREATE INDEX idx_hadiths_book ON hadiths(book_id, num_in_book);
CREATE INDEX idx_hadith_narrators_nar ON hadith_narrators(narrator_id);
CREATE INDEX idx_edges_from ON narrator_edges(from_narrator_id);
CREATE INDEX idx_edges_to ON narrator_edges(to_narrator_id);
"""

# ─── Main ───
def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    db = sqlite3.connect(str(DB_PATH))
    db.executescript(SCHEMA)

    # Seed all 956 books first (we'll only use 6, but keep the catalog)
    print("📚 Seeding book catalog...")
    files = sorted(DATA_DIR.glob("sanadset_chunk_*.csv"))
    all_books = set()
    for f in files:
        with open(f, "r", encoding="utf-8") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                book = row.get("Book", "")
                if book:
                    all_books.add(book.strip())

    cur = db.cursor()
    book_id_map = {}
    for book in sorted(all_books):
        en = BOOK_NAMES_EN.get(book, "")
        cur.execute("INSERT INTO hadith_books (name_ar, name_en) VALUES (?, ?)", (book, en))
        book_id_map[book] = cur.lastrowid

    print(f"  ✅ {len(all_books)} books catalogued")

    # Now seed hadiths for Kutub al-Sittah only
    print(f"\n📖 Seeding Kutub al-Sittah hadith...")
    cur = db.cursor()

    narrator_cache = {}
    hadith_count = 0

    for f in files:
        with open(f, "r", encoding="utf-8") as fp:
            reader = csv.DictReader(fp)
            batch = []
            for row in reader:
                try:
                    book = row.get("Book", "")
                    if book is None:
                        continue
                    book = book.strip()
                    if book not in KUTUB_AL_SITTAH:
                        continue

                    num_str = row.get("Num_hadith", "0") or "0"
                    num = int(num_str)
                    hadith_text = row.get("Hadith", "") or ""
                    matn = row.get("Matn", "") or ""
                    sanad_raw = row.get("Sanad", "") or ""
                    sanad_len_str = row.get("Sanad_Length", "0") or "0"
                    sanad_len = int(sanad_len_str)
                    book_id = book_id_map[book]

                    batch.append((book_id, num, hadith_text, matn, sanad_len, sanad_raw))

                    if len(batch) >= BATCH_SIZE:
                        hadith_count += insert_batch(db, batch, narrator_cache)
                        batch = []
                        if hadith_count % 5000 == 0:
                            print(f"  ... {hadith_count:,} hadith inserted")
                except (ValueError, KeyError, TypeError):
                    continue

            if batch:
                hadith_count += insert_batch(db, batch, narrator_cache)

    print(f"  ✅ {hadith_count:,} hadith inserted")

    # Update counts
    print("\n📊 Updating book counts...")
    db.execute("""
        UPDATE hadith_books SET hadith_count = (
            SELECT COUNT(*) FROM hadiths WHERE hadiths.book_id = hadith_books.id
        )
    """)

    # Build narrator edges (adjacency list from chains)
    print("🔗 Building narrator edges...")
    db.execute("""
        INSERT INTO narrator_edges (from_narrator_id, to_narrator_id, hadith_count)
        SELECT
          hn1.narrator_id as from_narrator_id,
          hn2.narrator_id as to_narrator_id,
          COUNT(*) as hadith_count
        FROM hadith_narrators hn1
        JOIN hadith_narrators hn2
          ON hn1.hadith_id = hn2.hadith_id
          AND hn1.position + 1 = hn2.position
        GROUP BY hn1.narrator_id, hn2.narrator_id
    """)

    # Optimize
    print("🗜️  Optimizing...")
    db.commit()
    db.execute("VACUUM;")
    db.execute("ANALYZE;")

    # Stats
    stats = db.execute("SELECT name_ar, hadith_count FROM hadith_books WHERE hadith_count > 0").fetchall()
    total_narrators = db.execute("SELECT COUNT(*) FROM narrators").fetchone()[0]
    total_hn = db.execute("SELECT COUNT(*) FROM hadith_narrators").fetchone()[0]
    total_edges = db.execute("SELECT COUNT(*) FROM narrator_edges").fetchone()[0]

    print("\n📊 Summary")
    print("=========")
    for name, count in stats:
        print(f"  {name}: {count:,}")
    print(f"\nTotal hadith: {hadith_count:,}")
    print(f"Total narrators: {total_narrators:,}")
    print(f"Total chain links: {total_hn:,}")
    print(f"Total narrator edges: {total_edges:,}")

    size = DB_PATH.stat().st_size
    print(f"\n💾 DB Size: {size / 1024 / 1024:.1f} MB")
    print(f"📍 Location: {DB_PATH}")

    db.close()


def insert_batch(db, batch, narrator_cache):
    cur = db.cursor()
    count = 0
    for book_id, num, hadith_text, matn, sanad_len, sanad_raw in batch:
        try:
            cur.execute(
                "INSERT INTO hadiths (book_id, num_in_book, hadith_ar, matn_ar, sanad_length) VALUES (?, ?, ?, ?, ?)",
                (book_id, num, hadith_text, matn, sanad_len)
            )
            hadith_id = cur.lastrowid
            count += 1
            # Insert into FTS5 with diacritics stripped
            stripped_matn = strip_diacritics(matn)
            cur.execute(
                "INSERT INTO hadith_search_idx(rowid, matn_ar, hadith_id, book_id) VALUES (?, ?, ?, ?)",
                (hadith_id, stripped_matn, hadith_id, book_id)
            )
        except sqlite3.IntegrityError:
            # Duplicate (book_id, num_in_book) — skip
            continue

        narrators = parse_sanad(sanad_raw)
        for pos, name in enumerate(narrators):
            nar_id = narrator_cache.get(name)
            if nar_id is None:
                cur.execute("INSERT OR IGNORE INTO narrators (name_ar) VALUES (?)", (name,))
                cur.execute("SELECT id FROM narrators WHERE name_ar = ?", (name,))
                row = cur.fetchone()
                if row:
                    nar_id = row[0]
                else:
                    continue
                narrator_cache[name] = nar_id
            cur.execute(
                "INSERT INTO hadith_narrators (hadith_id, narrator_id, position) VALUES (?, ?, ?)",
                (hadith_id, nar_id, pos)
            )
    return count


if __name__ == "__main__":
    main()
