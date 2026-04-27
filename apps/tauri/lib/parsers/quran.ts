export interface ParsedVerse {
  content: string;
  source_ref: string;
  category: 'quran';
}

/**
 * Parser for quran-uthmani.sql (Tanzil style)
 * Matches: INSERT INTO `quran_text` VALUES (sura, ayah, text);
 * Or similar variants.
 */
export async function parseQuranSQL(file: File): Promise<ParsedVerse[]> {
  const text = await file.text();
  const results: ParsedVerse[] = [];
  
  // Tanzil SQL format: (index, sura, ayah, text)
  // Example: (1, 1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')
  const regex = /\(\d+,\s*(\d+),\s*(\d+),\s*'([^']+)'\)/g;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const sura = match[1];
    const ayah = match[2];
    const content = match[3];
    
    results.push({
      content,
      source_ref: `Quran ${sura}:${ayah}`,
      category: 'quran'
    });
  }
  
  return results;
}
