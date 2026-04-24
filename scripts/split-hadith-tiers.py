#!/usr/bin/env python3
"""
Split Sanadset 650K into Core + Research tiers.

Core:   Kutub al-Sittah (6 canonical books) ~36K hadith
Research: Everything else (2,006 books) ~616K hadith

Usage:
  python3 scripts/split-hadith-tiers.py

Output:
  src-tauri/resources/hujjah-hadith-core.db    (Tier 2 — bundled)
  src-tauri/resources/hujjah-hadith-research.db (Tier 3 — downloadable)
"""

import csv
import sqlite3
import sys
import re
from pathlib import Path

csv.field_size_limit(sys.maxsize)

def strip_diacritics(text: str) -> str:
    """Strip all Arabic tashkeel (diacritics) for clean FTS5 indexing."""
    return re.sub(r'[\u064B-\u0652\u0670]', '', text)

DATA_DIR = Path("/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/chunks")
OUTPUT_DIR = Path(__file__).parent.parent / "src-tauri" / "resources"
CORE_DB = OUTPUT_DIR / "hujjah-hadith-core.db"
RESEARCH_DB = OUTPUT_DIR / "hujjah-hadith-research.db"
BATCH_SIZE = 1000

KUTUB_AL_SITTAH = {
    "صحيح البخاري",
    "صحيح مسلم",
    "سنن أبي داود",
    "جامع الترمذي",
    "السنن الكبرى للنسائي",
    "سنن ابن ماجه",
}

BOOK_NAMES_EN = {
    "صحيح البخاري": "Sahih al-Bukhari",
    "صحيح مسلم": "Sahih Muslim",
    "سنن أبي داود": "Sunan Abu Dawood",
    "جامع الترمذي": "Jami' at-Tirmidhi",
    "السنن الكبرى للنسائي": "Sunan al-Kubra (al-Nasa'i)",
    "سنن ابن ماجه": "Sunan Ibn Majah",
}

def parse_sanad(raw: str) -> list[str]:
    if not raw or raw == "No SANAD":
        return []
    if raw.startswith("['") and raw.endswith("']"):
        raw = raw[2:-2]
    return [
        re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()
        for s in raw.split("', '")
        if s.strip()
    ]

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA mmap_size = 268435456;

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

CREATE TABLE narrator_edges (
  from_narrator_id INTEGER NOT NULL REFERENCES narrators(id),
  to_narrator_id INTEGER NOT NULL REFERENCES narrators(id),
  hadith_count INTEGER DEFAULT 1,
  PRIMARY KEY (from_narrator_id, to_narrator_id)
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

CREATE TRIGGER hadiths_ai AFTER INSERT ON hadiths BEGIN
  INSERT INTO hadith_search_idx(rowid, matn_ar, hadith_id, book_id)
  VALUES (new.id, new.matn_ar, new.id, new.book_id);
END;

CREATE TRIGGER hadiths_ad AFTER DELETE ON hadiths BEGIN
  INSERT INTO hadith_search_idx(hadith_search_idx, rowid, matn_ar, hadith_id, book_id)
  VALUES ('delete', old.id, old.matn_ar, old.id, old.book_id);
END;

CREATE TRIGGER hadiths_au AFTER UPDATE ON hadiths BEGIN
  INSERT INTO hadith_search_idx(hadith_search_idx, rowid, matn_ar, hadith_id, book_id)
  VALUES ('delete', old.id, old.matn_ar, old.id, old.book_id);
  INSERT INTO hadith_search_idx(rowid, matn_ar, hadith_id, book_id)
  VALUES (new.id, new.matn_ar, new.id, new.book_id);
END;

CREATE INDEX idx_hadiths_book ON hadiths(book_id, num_in_book);
CREATE INDEX idx_hadith_narrators_nar ON hadith_narrators(narrator_id);
CREATE INDEX idx_edges_from ON narrator_edges(from_narrator_id);
CREATE INDEX idx_edges_to ON narrator_edges(to_narrator_id);
"""

def seed_tier(db_path: Path, is_core: bool):
    """Seed either Core (Kutub al-Sittah) or Research (everything else)."""
    if db_path.exists():
        db_path.unlink()

    db = sqlite3.connect(str(db_path))
    db.executescript(SCHEMA)

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

    tier_name = "Core" if is_core else "Research"
    print(f"\n📖 Seeding {tier_name} tier...")

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

                    # Core = Kutub al-Sittah, Research = everything else
                    in_core = book in KUTUB_AL_SITTAH
                    if is_core and not in_core:
                        continue
                    if not is_core and in_core:
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
                        if hadith_count % 10000 == 0:
                            print(f"  ... {hadith_count:,} hadith inserted")
                except (ValueError, KeyError, TypeError):
                    continue

            if batch:
                hadith_count += insert_batch(db, batch, narrator_cache)

    print(f"  ✅ {hadith_count:,} hadith inserted")

    # Update counts
    db.execute("""
        UPDATE hadith_books SET hadith_count = (
            SELECT COUNT(*) FROM hadiths WHERE hadiths.book_id = hadith_books.id
        )
    """)

    # Build edges
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
    stats = db.execute("SELECT name_ar, hadith_count FROM hadith_books WHERE hadith_count > 0 ORDER BY hadith_count DESC").fetchall()
    total_narrators = db.execute("SELECT COUNT(*) FROM narrators").fetchone()[0]
    total_edges = db.execute("SELECT COUNT(*) FROM narrator_edges").fetchone()[0]

    print(f"\n📊 {tier_name} Summary")
    print("=" * 40)
    for name, count in stats[:10]:
        print(f"  {name}: {count:,}")
    if len(stats) > 10:
        print(f"  ... and {len(stats) - 10} more books")
    print(f"\nTotal hadith: {hadith_count:,}")
    print(f"Total narrators: {total_narrators:,}")
    print(f"Total edges: {total_edges:,}")

    size = db_path.stat().st_size
    print(f"\n💾 DB Size: {size / 1024 / 1024:.1f} MB")
    print(f"📍 Location: {db_path}")

    db.close()
    return hadith_count


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
            # Insert into FTS5 with diacritics stripped (unicode61 strips some but not all Arabic diacritics)
            stripped_matn = strip_diacritics(matn)
            cur.execute(
                "INSERT INTO hadith_search_idx(rowid, matn_ar, hadith_id, book_id) VALUES (?, ?, ?, ?)",
                (hadith_id, stripped_matn, hadith_id, book_id)
            )
        except sqlite3.IntegrityError:
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


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    core_count = seed_tier(CORE_DB, is_core=True)
    research_count = seed_tier(RESEARCH_DB, is_core=False)

    print("\n" + "=" * 50)
    print("🏛️  TIER SPLIT COMPLETE")
    print("=" * 50)
    print(f"Tier 2 (Core):    {core_count:,} hadith")
    print(f"Tier 3 (Research): {research_count:,} hadith")
    print(f"Total:            {core_count + research_count:,} hadith")


if __name__ == "__main__":
    main()
