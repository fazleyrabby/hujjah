#!/usr/bin/env ts-node
/**
 * Migration: Surah Metadata + FTS5 Rebuild + Embedding Column
 *
 * 1. Creates 'surahs' table with names in Arabic, English, and Bengali
 * 2. Drops old 'search_idx' and creates 'quran_search_idx' (unicode61, en+bn only)
 * 3. Adds 'embedding' BLOB column to 'translations' for vector search
 * 4. Creates 'vec_idx' table for semantic search fallbacks
 *
 * Run: npx ts-node scripts/migrate-db.ts
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);

// ─── 1. Surahs Metadata ───
console.log('📖 Creating surahs table...');

db.exec(`
  DROP TABLE IF EXISTS surahs;
  CREATE TABLE surahs (
    id INTEGER PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_bn TEXT NOT NULL
  );
`);

const surahs: [number, string, string, string][] = [
  [1, 'الفاتحة', 'Al-Fatiha', 'আল-ফাতিহা'],
  [2, 'البقرة', 'Al-Baqarah', 'আল-বাকারাহ'],
  [3, 'آل عمران', 'Aal-E-Imran', 'আলে-ইমরান'],
  [4, 'النساء', 'An-Nisa', 'আন-নিসা'],
  [5, 'المائدة', 'Al-Maidah', 'আল-মায়িদাহ'],
  [6, 'الأنعام', 'Al-Anam', 'আল-আনআম'],
  [7, 'الأعراف', 'Al-Araf', 'আল-আরাফ'],
  [8, 'الأنفال', 'Al-Anfal', 'আল-আনফাল'],
  [9, 'التوبة', 'At-Tawbah', 'আত-তাওবাহ'],
  [10, 'يونس', 'Yunus', 'ইউনুস'],
  [11, 'هود', 'Hud', 'হুদ'],
  [12, 'يوسف', 'Yusuf', 'ইউসুফ'],
  [13, 'الرعد', 'Ar-Rad', 'আর-রাদ'],
  [14, 'إبراهيم', 'Ibrahim', 'ইব্রাহীম'],
  [15, 'الحجر', 'Al-Hijr', 'আল-হিজর'],
  [16, 'النحل', 'An-Nahl', 'আন-নাহল'],
  [17, 'الإسراء', 'Al-Isra', 'আল-ইসরা'],
  [18, 'الكهف', 'Al-Kahf', 'আল-কাহফ'],
  [19, 'مريم', 'Maryam', 'মারইয়াম'],
  [20, 'طه', 'Ta-Ha', 'ত্ব-হা'],
  [21, 'الأنبياء', 'Al-Anbiya', 'আল-আনবিয়া'],
  [22, 'الحج', 'Al-Hajj', 'আল-হাজ্জ'],
  [23, 'المؤمنون', 'Al-Muminun', 'আল-মুমিনুন'],
  [24, 'النور', 'An-Nur', 'আন-নূর'],
  [25, 'الفرقان', 'Al-Furqan', 'আল-ফুরকান'],
  [26, 'الشعراء', 'Ash-Shuara', 'আশ-শুআরা'],
  [27, 'النمل', 'An-Naml', 'আন-নমল'],
  [28, 'القصص', 'Al-Qasas', 'আল-কাসাস'],
  [29, 'العنكبوت', 'Al-Ankabut', 'আল-আনকাবুত'],
  [30, 'الروم', 'Ar-Rum', 'আর-রূম'],
  [31, 'لقمان', 'Luqman', 'লুকমান'],
  [32, 'السجدة', 'As-Sajda', 'আস-সাজদাহ'],
  [33, 'الأحزاب', 'Al-Ahzab', 'আল-আহজাব'],
  [34, 'سبإ', 'Saba', 'সাবা'],
  [35, 'فاطر', 'Fatir', 'ফাতির'],
  [36, 'يس', 'Ya-Sin', 'ইয়াসীন'],
  [37, 'الصافات', 'As-Saffat', 'আস-সাফফাত'],
  [38, 'ص', 'Sad', 'সাদ'],
  [39, 'الزمر', 'Az-Zumar', 'আয-যুমার'],
  [40, 'غافر', 'Ghafir', 'গাফির'],
  [41, 'فصلت', 'Fussilat', 'ফুসসিলাত'],
  [42, 'الشورى', 'Ash-Shura', 'আশ-শূরা'],
  [43, 'الزخرف', 'Az-Zukhruf', 'আয-যুখরুফ'],
  [44, 'الدخان', 'Ad-Dukhan', 'আদ-দুখান'],
  [45, 'الجاثية', 'Al-Jathiya', 'আল-জাসিয়াহ'],
  [46, 'الأحقاف', 'Al-Ahqaf', 'আল-আহকাফ'],
  [47, 'محمد', 'Muhammad', 'মুহাম্মাদ'],
  [48, 'الفتح', 'Al-Fath', 'আল-ফাতহ'],
  [49, 'الحجرات', 'Al-Hujurat', 'আল-হুজুরাত'],
  [50, 'ق', 'Qaf', 'কাফ'],
  [51, 'الذاريات', 'Adh-Dhariyat', 'আয-যারিয়াত'],
  [52, 'الطور', 'At-Tur', 'আত-তূর'],
  [53, 'النجم', 'An-Najm', 'আন-নাজম'],
  [54, 'القمر', 'Al-Qamar', 'আল-কামার'],
  [55, 'الرحمن', 'Ar-Rahman', 'আর-রাহমান'],
  [56, 'الواقعة', 'Al-Waqia', 'আল-ওয়াকিয়াহ'],
  [57, 'الحديد', 'Al-Hadid', 'আল-হাদীদ'],
  [58, 'المجادلة', 'Al-Mujadila', 'আল-মুজাদিলাহ'],
  [59, 'الحشر', 'Al-Hashr', 'আল-হাশর'],
  [60, 'الممتحنة', 'Al-Mumtahanah', 'আল-মুমতাহিনাহ'],
  [61, 'الصف', 'As-Saff', 'আস-সফফ'],
  [62, 'الجمعة', 'Al-Jumuah', 'আল-জুমুআহ'],
  [63, 'المنافقون', 'Al-Munafiqun', 'আল-মুনাফিকুন'],
  [64, 'التغابن', 'At-Taghabun', 'আত-তাগাবুন'],
  [65, 'الطلاق', 'At-Talaq', 'আত-তালাক'],
  [66, 'التحريم', 'At-Tahrim', 'আত-তাহরীম'],
  [67, 'الملك', 'Al-Mulk', 'আল-মুলক'],
  [68, 'القلم', 'Al-Qalam', 'আল-কলম'],
  [69, 'الحاقة', 'Al-Haqqah', 'আল-হাক্কাহ'],
  [70, 'المعارج', 'Al-Maarij', 'আল-মাআরিজ'],
  [71, 'نوح', 'Nuh', 'নূহ'],
  [72, 'الجن', 'Al-Jinn', 'আল-জিন'],
  [73, 'المزمل', 'Al-Muzzammil', 'আল-মুজ্জাম্মিল'],
  [74, 'المدثر', 'Al-Muddaththir', 'আল-মুদ্দাস্সির'],
  [75, 'القيامة', 'Al-Qiyamah', 'আল-কিয়ামাহ'],
  [76, 'الإنسان', 'Al-Insan', 'আল-ইনসান'],
  [77, 'المرسلات', 'Al-Mursalat', 'আল-মুরসালাত'],
  [78, 'النبإ', 'An-Naba', 'আন-নাবা'],
  [79, 'النازعات', 'An-Naziat', 'আন-নাযিয়াত'],
  [80, 'عبس', 'Abasa', 'আবাসা'],
  [81, 'التكوير', 'At-Takwir', 'আত-তাকভীর'],
  [82, 'الإنفطار', 'Al-Infitar', 'আল-ইনফিতার'],
  [83, 'المطففين', 'Al-Mutaffifin', 'আল-মুতাফ্ফিফীন'],
  [84, 'الإنشقاق', 'Al-Inshiqaq', 'আল-ইনশিকাক'],
  [85, 'البروج', 'Al-Buruj', 'আল-বুরুজ'],
  [86, 'الطارق', 'At-Tariq', 'আত-তারিক'],
  [87, 'الأعلى', 'Al-Ala', 'আল-আলা'],
  [88, 'الغاشية', 'Al-Ghashiyah', 'আল-গাশিয়াহ'],
  [89, 'الفجر', 'Al-Fajr', 'আল-ফাজর'],
  [90, 'البلد', 'Al-Balad', 'আল-বালাদ'],
  [91, 'الشمس', 'Ash-Shams', 'আশ-শামস'],
  [92, 'الليل', 'Al-Layl', 'আল-লাইল'],
  [93, 'الضحى', 'Ad-Duha', 'আদ-দুহা'],
  [94, 'الشرح', 'Ash-Sharh', 'আশ-শরহ'],
  [95, 'التين', 'At-Tin', 'আত-তিন'],
  [96, 'العلق', 'Al-Alaq', 'আল-আলাক'],
  [97, 'القدر', 'Al-Qadr', 'আল-কদর'],
  [98, 'البينة', 'Al-Bayyinah', 'আল-বাইয়্যিনাহ'],
  [99, 'الزلزلة', 'Az-Zilzal', 'আয-যিলজাল'],
  [100, 'العاديات', 'Al-Adiyat', 'আল-আদিয়াত'],
  [101, 'القارعة', 'Al-Qariah', 'আল-কারিআহ'],
  [102, 'التكاثر', 'At-Takathur', 'আত-তাকাসুর'],
  [103, 'العصر', 'Al-Asr', 'আল-আসর'],
  [104, 'الهمزة', 'Al-Humazah', 'আল-হুমাযাহ'],
  [105, 'الفيل', 'Al-Fil', 'আল-ফীল'],
  [106, 'قريش', 'Quraysh', 'কুরাইশ'],
  [107, 'الماعون', 'Al-Maun', 'আল-মাঊন'],
  [108, 'الكوثر', 'Al-Kawthar', 'আল-কাওসার'],
  [109, 'الكافرون', 'Al-Kafirun', 'আল-কাফিরুন'],
  [110, 'النصر', 'An-Nasr', 'আন-নাসর'],
  [111, 'المسد', 'Al-Masad', 'আল-মাসাদ'],
  [112, 'الإخلاص', 'Al-Ikhlas', 'আল-ইখলাস'],
  [113, 'الفلق', 'Al-Falaq', 'আল-ফালাক'],
  [114, 'الناس', 'An-Nas', 'আন-নাস'],
];

const insertSurah = db.prepare('INSERT INTO surahs (id, name_ar, name_en, name_bn) VALUES (?, ?, ?, ?)');
const insertAll = db.transaction((rows: typeof surahs) => {
  for (const row of rows) insertSurah.run(row[0], row[1], row[2], row[3]);
});
insertAll(surahs);
console.log(`  ✅ ${surahs.length} surahs inserted`);

// ─── 2. Rebuild FTS5 as quran_search_idx (en + bn only) ───
console.log('\n🔍 Rebuilding FTS5 index as quran_search_idx (en + bn only)...');

db.exec(`
  -- Drop old index and triggers
  DROP TABLE IF EXISTS search_idx;
  DROP TRIGGER IF EXISTS translations_ai;
  DROP TRIGGER IF EXISTS translations_ad;
  DROP TRIGGER IF EXISTS translations_au;

  -- Create new FTS5 index
  CREATE VIRTUAL TABLE quran_search_idx USING fts5(
    text,
    verse_id UNINDEXED,
    lang_code UNINDEXED,
    tokenize = 'unicode61',
    content='translations',
    content_rowid='id'
  );

  -- Populate with en and bn only
  INSERT INTO quran_search_idx(rowid, text, verse_id, lang_code)
  SELECT id, text, verse_id, lang_code FROM translations WHERE lang_code IN ('en', 'bn');

  -- Sync triggers
  CREATE TRIGGER translations_ai AFTER INSERT ON translations BEGIN
    INSERT INTO quran_search_idx(rowid, text, verse_id, lang_code)
    VALUES (new.id, new.text, new.verse_id, new.lang_code);
  END;

  CREATE TRIGGER translations_ad AFTER DELETE ON translations BEGIN
    INSERT INTO quran_search_idx(quran_search_idx, rowid, text, verse_id, lang_code)
    VALUES ('delete', old.id, old.text, old.verse_id, old.lang_code);
  END;

  CREATE TRIGGER translations_au AFTER UPDATE ON translations BEGIN
    INSERT INTO quran_search_idx(quran_search_idx, rowid, text, verse_id, lang_code)
    VALUES ('delete', old.id, old.text, old.verse_id, old.lang_code);
    INSERT INTO quran_search_idx(rowid, text, verse_id, lang_code)
    VALUES (new.id, new.text, new.verse_id, new.lang_code);
  END;
`);

const ftsCount = db.prepare("SELECT COUNT(*) as c FROM quran_search_idx").get() as { c: number };
console.log(`  ✅ quran_search_idx: ${ftsCount.c.toLocaleString()} rows (en + bn)`);

// ─── 3. Add embedding column ───
console.log('\n🧠 Adding embedding column to translations...');
try {
  db.exec(`ALTER TABLE translations ADD COLUMN embedding BLOB;`);
  console.log('  ✅ embedding BLOB column added');
} catch (e: any) {
  if (e.message.includes('duplicate column')) {
    console.log('  ℹ️ embedding column already exists');
  } else {
    throw e;
  }
}

// ─── 4. Create vec_idx table (verse-level for semantic fallback) ───
console.log('\n📐 Creating vec_idx table...');

db.exec(`
  DROP TABLE IF EXISTS vec_idx;
  CREATE TABLE vec_idx (
    verse_id INTEGER PRIMARY KEY,
    embedding BLOB NOT NULL
  );
`);
console.log('  ✅ vec_idx table created');

// ─── Optimize ───
db.exec('VACUUM;');
db.exec('ANALYZE;');

console.log('\n🎉 Migration complete!');
console.log(`📍 Database: ${DB_PATH}`);

db.close();
