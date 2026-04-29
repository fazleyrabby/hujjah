-- Phase 1: Sunnah.com Data Integration Schema Migrations
-- Run this BEFORE the merge script

-- Add source tracking columns to hadiths table
ALTER TABLE hadiths ADD COLUMN source TEXT DEFAULT 'sanadset';
ALTER TABLE hadiths ADD COLUMN sunnah_arabic_urn INTEGER;
ALTER TABLE hadiths ADD COLUMN sunnah_english_urn INTEGER;
ALTER TABLE hadiths ADD COLUMN sunnah_collection TEXT;
ALTER TABLE hadiths ADD COLUMN sunnah_book_number TEXT;
ALTER TABLE hadiths ADD COLUMN sunnah_hadith_number TEXT;
ALTER TABLE hadiths ADD COLUMN grade_ar TEXT;
ALTER TABLE hadiths ADD COLUMN grade_en TEXT;

-- Create index for sunnah.com URN lookups
CREATE INDEX IF NOT EXISTS idx_hadiths_sunnah_urn ON hadiths(sunnah_arabic_urn);
CREATE INDEX IF NOT EXISTS idx_hadiths_sunnah_collection ON hadiths(sunnah_collection, sunnah_book_number, sunnah_hadith_number);

-- Create sunnah.com collections mapping table
CREATE TABLE IF NOT EXISTS sunnah_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL UNIQUE,
  name_ar TEXT,
  name_en TEXT,
  book_count INTEGER DEFAULT 0
);

-- Insert known sunnah.com collections
INSERT OR IGNORE INTO sunnah_collections (collection, name_ar, name_en) VALUES
  ('bukhari', 'صحيح البخاري', 'Sahih al-Bukhari'),
  ('muslim', 'صحيح مسلم', 'Sahih Muslim'),
  ('abudawud', 'سنن أبي داود', 'Sunan Abi Dawud'),
  ('tirmidhi', 'جامع الترمذي', 'Jami` at-Tirmidhi'),
  ('nasai', 'سنن النسائي', 'Sunan an-Nasa\'i'),
  ('ibnmajah', 'سنن ابن ماجه', 'Sunan Ibn Majah'),
  ('ahmad', 'مسند أحمد', 'Musnad Ahmad'),
  ('mishkat', 'مشكاة المصابيح', 'Mishkat al-Masabih'),
  ('riyadussalihin', 'رياض الصالحين', 'Riyad as-Salihin'),
  ('adab', 'الأدب المفرد', 'Al-Adab Al-Mufrad'),
  ('shamail', 'الشمائل المحمدية', 'Shama'il Muhammadiyah'),
  ('bulugh', 'بلوغ المرام', 'Bulugh al-Maram'),
  ('hisn', 'حصن المسلم', 'Hisn al-Muslim'),
  ('forty', 'الأربعون النووية', '40 Hadith Nawawi');

-- Add source column to narrators (for Phase 2)
ALTER TABLE narrators ADD COLUMN data_source TEXT DEFAULT 'sanadset';
ALTER TABLE narrators ADD COLUMN name_normalized TEXT;
ALTER TABLE narrators ADD COLUMN sunnah_narrator_id INTEGER;

-- Create index for narrator normalization
CREATE INDEX IF NOT EXISTS idx_narrators_normalized ON narrators(name_normalized);
