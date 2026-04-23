export interface ParsedBook {
  content: string;
  source_ref: string;
  category: 'hadith_book';
}

/**
 * Parser for books.csv - simple single column format
 */
export async function parseBooksCSV(file: File): Promise<ParsedBook[]> {
  const text = await file.text();
  const lines = text.split('\n');
  const results: ParsedBook[] = [];
  
  console.log('[Books Parser] File:', file.name, 'Size:', file.size, 'Lines:', lines.length);
  
  // Skip header if present
  let startIndex = 0;
  if (lines[0] && (lines[0].trim() === 'Book' || lines[0].trim() === 'book')) {
    startIndex = 1;
    console.log('[Books Parser] Skipping header line');
  }
  
  for (let i = startIndex; i < lines.length; i++) {
    const bookName = lines[i].trim();
    
    // Skip empty lines
    if (!bookName) continue;
    
    // Skip if line is too short (likely corrupt)
    if (bookName.length < 3) continue;
    
    results.push({
      content: `كتاب: ${bookName}`,
      source_ref: `Book: ${bookName}`,
      category: 'hadith_book'
    });
  }
  
  console.log('[Books Parser] Parsed', results.length, 'books');
  return results;
}
