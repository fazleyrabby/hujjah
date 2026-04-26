import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const llamaUrl = 'http://127.0.0.1:8081';
const projectRoot = process.cwd();
const quranDbPath = path.join(projectRoot, 'src-tauri', 'resources', 'hujjah-quran.db');

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

  // Step 1: Retrieve English verses using Bengali query (simulating BGE-M3)
  console.log('\n[1/3] Retrieving verses (simulated BGE-M3)...');
  // Since BGE-M3 is hard to run in node script without transformers.js setup,
  // we'll use a keyword search on the Bengali terms if possible, or just use the English translation
  // For this test, we'll assume the user asked in English to test the NLLB translation
  // But to simulate the pipeline, let's just use the English equivalent for retrieval
  const englishKeywords = bengaliQuery.includes('তাওবা') ? 'repentance forgiveness sin' :
                         bengaliQuery.includes('সবর') ? 'patience gratitude thankfulness' :
                         bengaliQuery.includes('রিজক') ? 'sustenance provision rizq' :
                         bengaliQuery.includes('জ্ঞান') ? 'knowledge learning education' :
                         bengaliQuery.includes('ফাতিহা') ? 'fatiha opening chapter' : bengaliQuery;
  
  const verses = await retrieveVerses(englishKeywords, 3);
  console.log(`  → Found ${verses.length} verses: ${verses.map((v) => `${v.surah}:${v.ayah}`).join(', ')}`);

  // Step 2: Generate English answer
  console.log('\n[2/3] Generating English answer...');
  const verseLines = verses.map((v) => `[Quran ${v.surah}:${v.ayah}] ${v.text}`).join('\n');
  const contextBlock = verseLines || 'No verses found.';
  const englishPrompt = `You are Hujjah AI. Answer the question using ONLY the provided Quran verses. Be specific and direct.

Verses:
${contextBlock}

Question: ${bengaliQuery}

Answer (cite verse refs like 2:255):`;

  const t1 = Date.now();
  const englishAnswer = await llamaComplete(englishPrompt);
  console.log(`  → ${englishAnswer.slice(0, 150)}... (${Date.now() - t1}ms)`);

  console.log('\n[3/3] NLLB translation would happen here in the browser.');
  console.log('  → Check the app UI to see NLLB translate this answer to Bengali.');
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
