#!/usr/bin/env node

/**
 * Split Sanadset CSV into browser-importable chunks
 * Usage: node scripts/split_sanadset.js [lines_per_chunk]
 */

import fs from 'fs';
import path from 'path';

const INPUT_FILE = '/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/sanadset.csv';
const OUTPUT_DIR = '/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/chunks';
const LINES_PER_CHUNK = parseInt(process.argv[2]) || 10000; // Default 10K per chunk (safer for browser)

if (!fs.existsSync(INPUT_FILE)) {
  console.error('❌ Input file not found:', INPUT_FILE);
  process.exit(1);
}

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const fileSize = fs.statSync(INPUT_FILE).size;
console.log('🕌 Sanadset CSV Splitter\n');
console.log('📂 Input:', INPUT_FILE);
console.log('📊 File size:', (fileSize / 1024 / 1024).toFixed(2), 'MB');
console.log('📦 Chunk size:', LINES_PER_CHUNK.toLocaleString(), 'lines');
console.log('📁 Output:', OUTPUT_DIR);
console.log('\n⏳ Processing...\n');

const stream = fs.createReadStream(INPUT_FILE, { encoding: 'utf-8' });
let chunkIndex = 0;
let lineCount = 0;
let totalLines = 0;
let header = '';
let currentChunk = '';

stream.on('data', (chunk) => {
  const lines = chunk.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // First line is header
    if (totalLines === 0) {
      header = line;
      totalLines++;
      continue;
    }
    
    if (!line.trim()) continue;
    
    if (lineCount === 0) {
      // Start new chunk with header
      currentChunk = header + '\n';
    }
    
    currentChunk += line + '\n';
    lineCount++;
    totalLines++;
    
    if (lineCount >= LINES_PER_CHUNK) {
      // Write chunk to file
      const outputPath = path.join(OUTPUT_DIR, `sanadset_chunk_${String(chunkIndex).padStart(3, '0')}.csv`);
      fs.writeFileSync(outputPath, currentChunk);
      console.log(`✓ Chunk ${chunkIndex + 1}: ${outputPath} (${lineCount.toLocaleString()} lines, ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)}MB)`);
      
      chunkIndex++;
      lineCount = 0;
      currentChunk = '';
    }
  }
});

stream.on('end', () => {
  // Write remaining lines
  if (currentChunk && lineCount > 0) {
    const outputPath = path.join(OUTPUT_DIR, `sanadset_chunk_${String(chunkIndex).padStart(3, '0')}.csv`);
    fs.writeFileSync(outputPath, currentChunk);
    console.log(`✓ Chunk ${chunkIndex + 1}: ${outputPath} (${lineCount.toLocaleString()} lines, ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)}MB)`);
  }
  
  const totalChunks = chunkIndex + (lineCount > 0 ? 1 : 0);
  console.log(`\n✅ Complete!`);
  console.log(`📊 Total lines processed: ${totalLines.toLocaleString()}`);
  console.log(`📦 Total chunks created: ${totalChunks}`);
  console.log(`\n📝 To import:`);
  console.log(`   1. Go to http://localhost:3000/import`);
  console.log(`   2. Select "الحديث الشريف (CSV)"`);
  console.log(`   3. Click "Add Files" and select all chunk files`);
  console.log(`   4. Click "🔄 Sync All"`);
  console.log(`\n⚠️  Note: Each chunk will take ~2-5 minutes to process (embedding + DB insert)`);
  console.log(`   Total estimated time: ${totalChunks * 3} minutes\n`);
});

stream.on('error', (err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
