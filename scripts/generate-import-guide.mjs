#!/usr/bin/env node

/**
 * Generate import instructions and file lists
 * Usage: node scripts/generate-import-guide.mjs
 */

import fs from 'fs';
import path from 'path';

const RESOURCES_DIR = '/Users/rabbi/Desktop/hujjah resources';
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'import-guide.txt');

console.log('📝 Generating Import Guide...\n');

const guide = [];

guide.push('='.repeat(70));
guide.push('🕌 HUJJAH - BATCH IMPORT GUIDE');
guide.push('='.repeat(70));
guide.push('');
guide.push('📋 QUICK START');
guide.push('-'.repeat(70));
guide.push('1. Open: http://localhost:3000/batch-import');
guide.push('2. Click "Quick Add" buttons for each dataset');
guide.push('3. Click "▶️ Start Import"');
guide.push('4. Wait for completion (can take several hours)');
guide.push('');
guide.push('📂 FILE LOCATIONS');
guide.push('-'.repeat(70));
guide.push('');

// 1. Hadith Chunks
const hadithChunksDir = path.join(RESOURCES_DIR, 'Sanadset 650K Data on Hadith Narrators', 'chunks');
if (fs.existsSync(hadithChunksDir)) {
  const chunks = fs.readdirSync(hadithChunksDir).filter(f => f.endsWith('.csv'));
  guide.push('✅ HADITH DATASET');
  guide.push(`   Location: ${hadithChunksDir}`);
  guide.push(`   Files: ${chunks.length} chunk files`);
  guide.push(`   Total Records: ~672,794 hadiths`);
  guide.push(`   Estimated Time: 2-3 hours`);
  guide.push('');
  guide.push('   Files to select (ALL):');
  chunks.forEach((chunk, i) => {
    const size = fs.statSync(path.join(hadithChunksDir, chunk)).size;
    guide.push(`   - ${chunk} (${(size / 1024 / 1024).toFixed(1)}MB)`);
  });
  guide.push('');
}

// 2. English Commentary
const commentaryDir = path.join(RESOURCES_DIR, 'global quran data');
if (fs.existsSync(commentaryDir)) {
  const enFiles = fs.readdirSync(commentaryDir).filter(f => f.startsWith('en.') && f.endsWith('.json'));
  
  guide.push('✅ ENGLISH COMMENTARY/TRANSLATIONS');
  guide.push(`   Location: ${commentaryDir}`);
  guide.push(`   Files: ${enFiles.length} English translation files`);
  guide.push(`   Total Records: ~87,000 verses (14 translations × 6,236 verses)`);
  guide.push(`   Estimated Time: 30-45 minutes`);
  guide.push('');
  guide.push('   Files to select (ALL):');
  enFiles.forEach(file => {
    const size = fs.statSync(path.join(commentaryDir, file)).size;
    guide.push(`   - ${file} (${(size / 1024 / 1024).toFixed(1)}MB)`);
  });
  guide.push('');
  
  // Arabic Tafsir
  const arFiles = fs.readdirSync(commentaryDir).filter(f => f.startsWith('ar.') && f.endsWith('.json'));
  if (arFiles.length > 0) {
    guide.push('✅ ARABIC TAFSIR (Commentary)');
    guide.push(`   Files: ${arFiles.length} Arabic tafsir files`);
    guide.push(`   Estimated Time: 10-15 minutes`);
    guide.push('');
    guide.push('   Files to select:');
    arFiles.forEach(file => {
      const size = fs.statSync(path.join(commentaryDir, file)).size;
      guide.push(`   - ${file} (${(size / 1024 / 1024).toFixed(1)}MB)`);
    });
    guide.push('');
  }
  
  // All other languages
  const otherFiles = fs.readdirSync(commentaryDir).filter(f => {
    const lang = f.split('.')[0];
    return !['en', 'ar', 'quran'].includes(lang) && f.endsWith('.json');
  });
  
  if (otherFiles.length > 0) {
    guide.push('✅ OTHER LANGUAGES (Optional)');
    guide.push(`   Files: ${otherFiles.length} files in ${new Set(otherFiles.map(f => f.split('.')[0])).size} languages`);
    guide.push(`   Estimated Time: 2-3 hours for all`);
    guide.push('');
    guide.push('   Languages available:');
    const byLang = {};
    otherFiles.forEach(f => {
      const lang = f.split('.')[0];
      byLang[lang] = (byLang[lang] || 0) + 1;
    });
    Object.entries(byLang).sort((a, b) => b[1] - a[1]).forEach(([lang, count]) => {
      guide.push(`   - ${lang}: ${count} file(s)`);
    });
    guide.push('');
  }
}

// 3. Books CSV
const booksCsv = path.join(RESOURCES_DIR, 'Sanadset 650K Data on Hadith Narrators', 'books.csv');
if (fs.existsSync(booksCsv)) {
  const size = fs.statSync(booksCsv).size;
  guide.push('✅ BOOKS METADATA');
  guide.push(`   Location: ${booksCsv}`);
  guide.push(`   File Size: ${(size / 1024).toFixed(1)}KB`);
  guide.push(`   Records: ~957 books`);
  guide.push(`   Estimated Time: < 1 minute`);
  guide.push('');
  guide.push('   File to select:');
  guide.push(`   - books.csv`);
  guide.push('');
}

// 4. Quran SQL
const quranSql = path.join(RESOURCES_DIR, 'quran-uthmani.sql');
if (fs.existsSync(quranSql)) {
  const size = fs.statSync(quranSql).size;
  guide.push('✅ QURAN ARABIC TEXT');
  guide.push(`   Location: ${quranSql}`);
  guide.push(`   File Size: ${(size / 1024 / 1024).toFixed(2)}MB`);
  guide.push(`   Records: 6,236 verses`);
  guide.push(`   Estimated Time: 5-10 minutes`);
  guide.push('');
  guide.push('   File to select:');
  guide.push(`   - quran-uthmani.sql`);
  guide.push('');
}

guide.push('🎯 RECOMMENDED IMPORT ORDER');
guide.push('-'.repeat(70));
guide.push('1. ✅ Hadith Chunks (68 files) - Most important, largest dataset');
guide.push('2. ✅ English Commentary (14 files) - Essential for understanding');
guide.push('3. ✅ Books Metadata (1 file) - Quick, provides book info');
guide.push('4. ✅ Arabic Tafsir (2 files) - For Arabic speakers');
guide.push('5.  Other Languages (94 files) - Optional, as needed');
guide.push('');

guide.push('💡 TIPS');
guide.push('-'.repeat(70));
guide.push('• You can pause/resume the import at any time');
guide.push('• Completed files are automatically skipped on restart');
guide.push('• You can close the tab - imports continue in background');
guide.push('• DO NOT close the browser completely during import');
guide.push('• Check progress at: http://localhost:3000/verify-import');
guide.push('');

guide.push('📊 EXPECTED FINAL TOTALS');
guide.push('-'.repeat(70));
guide.push('• Hadith:        672,794 records');
guide.push('• Quran:             6,236 records (already imported)');
guide.push('• Commentary:      685,960 records (all languages)');
guide.push('• Books:               957 records');
guide.push('• TOTAL:         1,365,947 records');
guide.push('');

guide.push('🔧 TROUBLESHOOTING');
guide.push('-'.repeat(70));
guide.push('If import fails:');
guide.push('1. Check browser console (F12) for errors');
guide.push('2. Reduce batch size in hooks/useIngestion.ts (default: 50)');
guide.push('3. Import smaller batches first to test');
guide.push('4. Clear browser cache and retry');
guide.push('');

guide.push('='.repeat(70));
guide.push(`Generated: ${new Date().toLocaleString()}`);
guide.push('='.repeat(70));

// Write to file
fs.writeFileSync(OUTPUT_FILE, guide.join('\n'));

console.log('✅ Import guide generated!');
console.log(`📄 Saved to: ${OUTPUT_FILE}`);
console.log('');
console.log('🌐 View online at: http://localhost:3000/import-guide.txt');
console.log('');

// Also print summary
console.log(guide.join('\n'));
