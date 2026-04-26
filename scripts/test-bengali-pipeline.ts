import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const llamaUrl = 'http://127.0.0.1:8081';
const quranDbPath = 'src-tauri/resources/hujjah-quran.db';

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runSqliteJson<T>(dbPath: string, sql: string): Promise<T[]> {
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql]);
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed) as T[];
}

function tokenizeForFts(query: string): string {
  const englishStopwords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'what', 'does', 'about', 'during',
    'according', 'from', 'into', 'when', 'each', 'just', 'beyond', 'their', 'they',
    'them', 'have', 'has', 'how', 'why', 'are', 'can', 'say', 'says', 'main',
    'themes', 'concept', 'difference', 'between', 'required', 'importance', 'islam',
    'quran', 'hadith', 'surah', 'explain', 'summarize', 'mentioned',
  ]);
  const normalized = query
    .toLowerCase()
    .replace(/["']/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && !englishStopwords.has(t));
  return [...new Set(tokens)].slice(0, 8).join(' OR ');
}

async function llamaComplete(prompt: string): Promise<string> {
  const response = await fetch(`${llamaUrl}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `</s><|user|>\n${prompt}</s><|assistant|>\n`,
      n_predict: 512,
      temperature: 0.7,
      top_p: 0.9,
      repeat_penalty: 1.1,
      stop: ['</s>', '</s><|user|>'],
    }),
  });
  const json = (await response.json()) as { content?: string };
  return (json.content ?? '').trim();
}

async function translateToEnglish(bengaliText: string): Promise<string> {
  const prompt = `Translate the following Bengali text to English. Output only the translation.

Bengali: ${bengaliText}

English:`;
  return llamaComplete(prompt);
}

async function translateToBengali(englishText: string): Promise<string> {
  const prompt = `Translate the following text to Bengali. Keep all Quran references like (2:255) intact. Output only the translation.

Text: ${englishText}

Bengali:`;
  return llamaComplete(prompt);
}

async function retrieveVerses(query: string, limit: number): Promise<Array<{ surah: number; ayah: number; text: string }>> {
  const ftsQuery = tokenizeForFts(query);
  if (!ftsQuery) return [];
  const sql = `
    SELECT v.surah, v.ayah, t.text
    FROM quran_search_idx
    JOIN translations t ON t.id = quran_search_idx.rowid
    JOIN verses v ON v.id = t.verse_id
    WHERE quran_search_idx MATCH ${sqlString(ftsQuery)}
      AND quran_search_idx.lang_code = 'en'
    ORDER BY bm25(quran_search_idx)
    LIMIT ${limit}
  `;
  return runSqliteJson(quranDbPath, sql);
}

async function testBengaliQuery(bengaliQuery: string, index: number): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Q${index}: ${bengaliQuery}`);
  console.log('='.repeat(60));

  // Step 1: Translate to English
  console.log('\n[1/4] Translating Bengali → English...');
  const t0 = Date.now();
  const englishQuery = await translateToEnglish(bengaliQuery);
  console.log(`  → "${englishQuery}" (${Date.now() - t0}ms)`);

  // Step 2: Retrieve English verses
  console.log('\n[2/4] Retrieving English verses...');
  const verses = await retrieveVerses(englishQuery, 4);
  console.log(`  → Found ${verses.length} verses: ${verses.map((v) => `${v.surah}:${v.ayah}`).join(', ')}`);
  for (const v of verses.slice(0, 2)) {
    console.log(`     [${v.surah}:${v.ayah}] ${v.text.slice(0, 100)}...`);
  }

  // Step 3: Generate English answer
  console.log('\n[3/4] Generating English answer...');
  const verseLines = verses.map((v) => `[Quran ${v.surah}:${v.ayah}] ${v.text}`).join('\n');
  const contextBlock = verseLines || 'No verses found.';
  const englishPrompt = `You are Hujjah AI. Answer the question using ONLY the provided Quran verses. Be specific and direct.

Verses:
${contextBlock}

Question: ${englishQuery}

Answer (cite verse refs like 2:255):`;

  const t1 = Date.now();
  const englishAnswer = await llamaComplete(englishPrompt);
  console.log(`  → ${englishAnswer.slice(0, 150)}... (${Date.now() - t1}ms)`);

  // Step 4: Translate to Bengali
  console.log('\n[4/4] Translating English → Bengali...');
  const t2 = Date.now();
  const bengaliAnswer = await translateToBengali(englishAnswer);
  const duration = Date.now() - t2;
  console.log(`  → ${bengaliAnswer.slice(0, 150)}... (${duration}ms)`);

  // Quality check
  const isGoodTranslation = bengaliAnswer.length > 10 && bengaliAnswer !== englishAnswer;
  console.log(`\n✅ Bengali translation: ${isGoodTranslation ? 'GOOD' : 'FAILED — fallback to English'}`);
  console.log(`Total time: ${Date.now() - t0}ms`);

  if (!isGoodTranslation) {
    console.log('\nFallback note: বাংলা অনুবাদে সমস্যা হয়েছে। ইংরেজি উত্তর দেখানো হলো:');
    console.log(englishAnswer);
  }
}

async function main() {
  const health = await fetch(`${llamaUrl}/health`);
  if (!health.ok) {
    console.error('llama-server not running');
    process.exit(1);
  }

  const bengaliQuestions = [
    'তাওবার শর্তগুলো কী এবং আল্লাহ কি সব গুনাহ মাফ করেন?',
    'সবর এবং শোকরের মধ্যে পার্থক্য কী?',
    'কুরআনে রিজকের ব্যাপারে কী বলা হয়েছে?',
    'ইসলামে জ্ঞান অর্জনের গুরুত্ব কী?',
    'সূরা ফাতিহার মূল বিষয়বস্তু ব্যাখ্যা করুন',
  ];

  for (const [i, q] of bengaliQuestions.entries()) {
    await testBengaliQuery(q, i + 1);
  }
}

main().catch(console.error);
