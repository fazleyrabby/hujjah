export interface ParsedCommentary {
  content: string;
  source_ref: string;
  category: 'commentary';
}

/**
 * Parser for Quran commentary/translation JSON files
 * Handles various formats from global quran data folder
 */
export async function parseCommentaryJSON(file: File): Promise<ParsedCommentary[]> {
  const text = await file.text();
  const data = JSON.parse(text);
  const results: ParsedCommentary[] = [];
  
  // Extract filename without extension for source reference
  const fileName = file.name.replace('.json', '');
  
  // Handle object format (keyed by ID like quran-buck.json)
  // Format: { "919": { id, surah, ayah, verse }, ... }
  if (typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const item = value as any;
      
      if (typeof item === 'string') {
        // Simple format: { "1": "text", "2": "text" }
        results.push({
          content: item,
          source_ref: `${fileName} ${key}`,
          category: 'commentary'
        });
      } else if (item && typeof item === 'object') {
        // Complex format: { "919": { id, surah, ayah, verse } }
        const surah = item.surah || item.chapter || item.s || '';
        const ayah = item.ayah || item.verse || item.a || '';
        const text = item.verse || item.text || item.t || item.content || '';
        
        if (text) {
          results.push({
            content: text,
            source_ref: `${fileName} ${surah}:${ayah}`,
            category: 'commentary'
          });
        }
      }
    }
  }
  // Handle array format
  else if (Array.isArray(data)) {
    for (const item of data) {
      let surah: number | string = item.surah || item.chapter || item.s || '';
      let ayah: number | string = item.ayah || item.verse || item.a || '';
      let text: string = item.text || item.t || item.content || item.verse || '';
      
      // If no surah/ayah, try to use number field
      if (!surah && item.number) {
        surah = 'unknown';
        ayah = item.number;
      }
      
      if (text) {
        results.push({
          content: text,
          source_ref: `${fileName} ${surah}:${ayah}`,
          category: 'commentary'
        });
      }
    }
  }
  
  console.log(`[Commentary Parser] ${file.name}: ${results.length} entries`);
  return results;
}
