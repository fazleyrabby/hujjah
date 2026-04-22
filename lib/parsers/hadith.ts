export interface ParsedHadith {
  content: string;
  source_ref: string;
  category: 'hadith';
}

/**
 * Parser for Sanadset.csv
 * Cleans tags for embedding but keeps them for UI display.
 */
export async function parseHadithCSV(file: File): Promise<ParsedHadith[]> {
  const text = await file.text();
  const lines = text.split('\n');
  const results: ParsedHadith[] = [];
  
  // Headers check (optional, but good for robust parsing)
  // Assuming format: book,number,text
  // Sanadset often has: Sanad, Matn, Book, Number
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV split (handling quotes would be better in a production lib)
    // For Sanadset, we often see TAB or COMMA. Let's assume standard CSV for now.
    const parts = line.split(',');
    if (parts.length < 3) continue;
    
    // Matn/Content usually has <SANAD> and <MATN> tags
    const content = parts[2] || ''; 
    const book = parts[0] || 'Unknown';
    const number = parts[1] || i.toString();
    
    results.push({
      content,
      source_ref: `${book} Hadith #${number}`,
      category: 'hadith'
    });
  }
  
  return results;
}

/**
 * Helper to clean tags for embedding generation ONLY.
 */
export function cleanForEmbedding(text: string): string {
  return text
    .replace(/<SANAD>/g, '')
    .replace(/<\/SANAD>/g, '')
    .replace(/<MATN>/g, '')
    .replace(/<\/MATN>/g, '')
    .trim();
}
