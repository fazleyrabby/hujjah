export interface ParsedHadith {
  content: string;
  source_ref: string;
  category: 'hadith';
}

/**
 * Robust CSV parser for Sanadset.csv
 * Handles quoted fields with embedded commas
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current.trim());
  return fields;
}

/**
 * Parser for Sanadset.csv
 * Cleans tags for embedding but keeps them for UI display.
 */
export async function parseHadithCSV(file: File): Promise<ParsedHadith[]> {
  const text = await file.text();
  const lines = text.split('\n');
  const results: ParsedHadith[] = [];
  
  // Headers: Hadith,Book,Num_hadith,Matn,Sanad,Sanad_Length
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = parseCSVLine(line);
    
    // Need at least: Hadith, Book, Num_hadith
    if (parts.length < 3) continue;
    
    const rawContent = parts[0].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    const book = parts[1].replace(/^"|"$/g, '').trim();
    const number = parts[2].replace(/^"|"$/g, '').trim();
    
    // Skip if no content
    if (!rawContent || !book) continue;
    
    results.push({
      content: rawContent,
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
    .replace(/<NAR>/g, '')
    .replace(/<\/NAR>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract narrator names from SANAD for optional indexing
 */
export function extractNarrators(sanadField: string): string[] {
  // Parse Python list format: ['name1', 'name2']
  const match = sanadField.match(/\[(.*)\]/);
  if (!match) return [];
  
  return match[1]
    .split(',')
    .map(n => n.trim().replace(/^'|'$/g, ''))
    .filter(n => n && n !== 'No SANAD');
}
