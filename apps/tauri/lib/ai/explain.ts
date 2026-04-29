/**
 * lib/ai/explain.ts
 *
 * Local AI Explanation Pipeline
 *
 * Generates a 3-sentence explanation strictly from retrieved verses.
 * Uses a text-generation model via Transformers.js Web Worker.
 *
 * Model path is configured in lib/ai/model-config.ts
 */

import { getDB } from '@/lib/db';
import { embedOne, cosineSimilarity } from './embedding';
import { retrieveHybrid } from './retrieve';
import { searchHadithForAI, type HadithResult } from '@/lib/hadith-db';
import { withNativeFallback } from './native';
import { withLlamaFallback, USE_LLAMA_CPP } from './llama';
import { logInferenceStart, logInferenceEnd } from './rollout';
import { IS_MOCK_MODE, mockExplainQuery } from '@/lib/mocks';

export interface VerseContext {
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
}

export interface HadithContext {
  id: number;
  book_name_ar: string;
  book_name_en: string | null;
  num_in_book: number;
  matn_ar: string;
  matn_en: string | null;  // English translation — used in prompts instead of Arabic
  sanad_length: number;
}

/**
 * Search hadith corpus for relevant results (FTS5 keyword search).
 * Uses github-classic translations only (via searchHadithForAI from hadith-db).
 * Returns top matching hadith as HadithContext.
 */
async function retrieveHadithContext(query: string, limit = 3): Promise<HadithContext[]> {
  try {
    const results = await searchHadithForAI(query, limit);
    return results.map((r: HadithResult) => ({
      id: r.id,
      book_name_ar: r.book_name_ar,
      book_name_en: r.book_name_en,
      num_in_book: r.num_in_book,
      matn_ar: r.matn_ar,
      matn_en: r.matn_en ?? r.translations?.sunnah ?? null,
      sanad_length: r.sanad_length,
    }));
  } catch {
    return [];
  }
}

/**
 * Map of Bengali Islamic terms → English equivalents for hadith FTS.
 * Bengali query text cannot FTS-match English hadith translations directly.
 */
const BN_HADITH_KEYWORDS: Record<string, string> = {
  'তাওবা': 'repentance tawbah',       'তওবা': 'repentance tawbah',
  'সালাত': 'prayer salah',             'নামাজ': 'prayer salah',
  'রোজা': 'fasting sawm',             'সিয়াম': 'fasting sawm',
  'কিয়ামত': 'judgment day resurrection signs',
  'আলামত': 'signs judgment day',
  'সবর': 'patience sabr',             'শোকর': 'gratitude shukr',
  'তাওয়াক্কুল': 'tawakkul reliance trust',
  'রিজক': 'rizq provision sustenance',
  'জ্ঞান': 'knowledge ilm seeking',
  'হজ': 'hajj pilgrimage',            'যাকাত': 'zakat charity',
  'সদকা': 'sadaqah charity',          'দুআ': 'dua supplication prayer',
  'আয়াতুল কুরসি': 'throne verse ayatul kursi',
  'সূরা কাহফ': 'surah kahf cave friday',
  'সূরা মুলক': 'surah mulk dominion',
  'সূরা ফাতিহা': 'surah fatiha opening',
  'মা-বাবা': 'parents rights',         'মা বাবা': 'parents rights',
  'খুশু': 'khushu concentration prayer focus',
  'জান্নাত': 'paradise jannah',        'জাহান্নাম': 'hellfire jahannam',
  'ঈমান': 'faith iman belief',         'তাকওয়া': 'taqwa piety',
  'গুনাহ': 'sin forgiveness',          'মাফ': 'forgiveness',
  'নফস': 'soul nafs self',
};

/**
 * Extract English search terms from a Bengali query for hadith FTS.
 * Returns empty string if no known terms found.
 */
function extractHadithKeywordsFromBengali(query: string): string {
  const hits = new Set<string>();
  for (const [bn, en] of Object.entries(BN_HADITH_KEYWORDS)) {
    if (query.includes(bn)) hits.add(en);
  }
  return [...hits].join(' ');
}

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/generation.worker.ts', import.meta.url));
    worker.addEventListener('message', (event: MessageEvent<{ id: string; type: string; text?: string; error?: string }>) => {
      const { id, type, text, error } = event.data;
      // Ignore intermediate status messages — only terminal types resolve/reject
      if (type === 'loading') return;
      const handler = pending.get(id);
      if (!handler) return;
      pending.delete(id);
      if (type === 'generate' && text !== undefined) {
        handler.resolve(text);
      } else {
        handler.reject(new Error(error || 'Generation failed'));
      }
    });
  }
  return worker;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Pre-load the generation model in the background.
 * Call this on app startup so the first query is fast.
 */
export function warmUpGenerationModel(): void {
  const w = getWorker();
  const id = makeId();
  w.postMessage({ id, type: 'init' });
}

/**
 * Generate text via the Web Worker with a 30s timeout.
 */
async function generate(prompt: string, maxNewTokens = 80): Promise<string> {
  const id = makeId();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('AI generation timed out after 120 seconds'));
    }, 120000);

    pending.set(id, {
      resolve: (text: string) => {
        clearTimeout(timeout);
        resolve(text);
      },
      reject: (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
    w.postMessage({ id, type: 'generate', prompt, maxNewTokens });
  });
}

/**
 * Format verses as a readable fallback when the LLM fails.
 */
function truncate(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '...';
}

function formatVersesFallback(verses: VerseContext[], query: string = '', lang: string = 'en'): string {
  if (verses.length === 0) {
    if (lang === 'bn') {
      return `আমি এই বিষয়ে সরাসরি কুরআনের আয়াত খুঁজে পাইনি। তবে আপনি যদি আরও বিস্তারিত জানতে চান, অন্য কীওয়ার্ড দিয়ে চেষ্টা করতে পারেন, অথবা আমাকে সরাসরি জিজ্ঞাসা করুন — আমি আমার জ্ঞান থেকে সাহায্য করব।`;
    }
    if (lang === 'ar') {
      return `لم أتمكن من العثور على آيات قرآنية مباشرة حول هذا الموضوع بالضبط. ومع ذلك، لا تتردد في سؤالي مباشرة - يمكنني مشاركة الأفكار من معرفتي، أو يمكنك تجربة كلمات رئيسية مختلفة للعثور على الآيات ذات الصلة.`;
    }
    return `I couldn't find direct Quranic verses on this exact topic. However, feel free to ask me directly — I can share insights from my knowledge, or you could try different keywords to find related verses.`;
  }

  const refs = verses.map((v) => `${v.surah}:${v.ayah}`).join(', ');
  const top = verses.slice(0, 3);

  if (lang === 'bn') {
    const intros = [
      `কুরআনে "${query}" সম্পর্কে কয়েকটি চমৎকার আয়াত পেয়েছি:`,
      `"${query}" বিষয়ে কুরআন যা বলেছে, তার কিছু অংশ:`,
      `আপনার প্রশ্নের সাথে মিলে এমন কিছু আয়াত:`
    ];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const snippets = top.map((v) => `• [${v.surah}:${v.ayah}] ${truncate(v.text, 180)}`).join('\n\n');
    const closings = [
      `এই আয়াতগুলোর মাধ্যমে কুরআন আমাদের সুন্দর নির্দেশনা দিয়েছে।`,
      `এগুলো থেকে আমরা গভীর শিক্ষা পেতে পারি।`,
      `আশা করি এই আয়াতগুলো আপনাকে সাহায্য করবে।`
    ];
    return `${intro}\n\n${snippets}\n\n${closings[Math.floor(Math.random() * closings.length)]}`;
  }

  if (lang === 'ar') {
    const intros = [
      `إليك ما قاله القرآن الكريم عن "${query}":`,
      `لقد وجدت بعض الآيات المتعلقة بـ "${query}":`,
      `يقدم القرآن توجيهات رائعة حول "${query}":`
    ];
    const intro = query.trim() ? intros[Math.floor(Math.random() * intros.length)] : `آيات ذات صلة (${refs}):`;
    const snippets = top.map((v) => `• [${v.surah}:${v.ayah}] ${truncate(v.text, 180)}`).join('\n\n');
    const closings = [
      `تقدم هذه الآيات توجيهاً عميقاً في هذا الشأن.`,
      `هناك حكمة عميقة في هذه الآيات لنتأمل فيها.`,
      `آمل أن تجلب هذه الآيات الوضوح والسلام إلى قلبك.`
    ];
    return `${intro}\n\n${snippets}\n\n${closings[Math.floor(Math.random() * closings.length)]}`;
  }

  const intros = [
    `Here is what the Quran beautifully says about "${query}":`,
    `I found some meaningful verses related to "${query}":`,
    `The Quran offers wonderful guidance on "${query}":`
  ];
  const intro = query.trim() ? intros[Math.floor(Math.random() * intros.length)] : `Relevant verses (${refs}):`;
  const snippets = top.map((v) => `• [${v.surah}:${v.ayah}] ${truncate(v.text, 180)}`).join('\n\n');
  const closings = [
    `These verses offer profound guidance on this matter.`,
    `There's deep wisdom in these verses for us to reflect on.`,
    `I hope these verses bring clarity and peace to your heart.`
  ];
  return `${intro}\n\n${snippets}\n\n${closings[Math.floor(Math.random() * closings.length)]}`;
}

/**
 * Detect casual greetings / chitchat so we can reply naturally
 * without running the LLM on empty verse context.
 */
function detectChitchat(query: string, lang: string = 'en'): string | null {
  const q = query.toLowerCase().trim();
  const isBn = lang === 'bn';
  const isAr = lang === 'ar';

  const greetings = ['hi', 'hello', 'hey', 'salam', 'as-salamu alaykum', 'assalamualaikum', 'আসসালামু', 'সালাম', 'হ্যালো', 'مرحبا', 'السلام عليكم'];
  const howAreYou = ['how are you', 'how r u', 'how is it going', 'কেমন আছ', 'কেমন আছেন', 'كيف حالك'];
  const identity = ['who are you', 'who am i talking to', 'what is your name', 'what are you', 'তুমি কে', 'আপনি কে', 'من أنت'];
  const thanks = ['thank you', 'thanks', 'shukran', 'jazakallah', 'ধন্যবাদ', 'জাযাকাল্লাহ', 'শুকরিয়া', 'شكرا', 'جزاك الله'];

  if (greetings.some((g) => q.includes(g))) {
    if (isBn) return "ওয়ালাইকুম আসসালাম! 🌙 আমি হুজ্জাহ এআই — আপনার কুরআন সঙ্গী। কোনো আয়াত বুঝতে চান? বা কোনো বিষয়ে জানতে চান? যেকোনো কিছু জিজ্ঞাসা করুন!";
    if (isAr) return "وعليكم السلام! 🌙 أنا هجة AI - رفيقك في القرآن. هل تريد فهم آية؟ أو استكشاف موضوع؟ اسألني أي شيء!";
    return "Wa alaykum as-salam! 🌙 I'm Hujjah AI — your Quran companion. Want to understand a verse? Or explore a topic? Ask me anything!";
  }
  if (howAreYou.some((h) => q.includes(h))) {
    if (isBn) return "আলহামদুলিল্লাহ, অনেক ভালো আছি! আজ কী নিয়ে আলোচনা করব? কোনো সূরা, আয়াত, বা বিষয় — আপনাকে সাহায্য করতে প্রস্তুত!";
    if (isAr) return "الحمد لله، أنا بخير! ماذا سنستكشف اليوم؟ سورة، آية، أو موضوع - أنا هنا من أجلك!";
    return "Alhamdulillah, doing wonderfully! What shall we explore today? A surah, a verse, a topic — I'm here for you!";
  }
  if (identity.some((i) => q.includes(i))) {
    if (isBn) return "আমি হুজ্জাহ এআই — একজন বন্ধু যে কুরআন বুঝতে সাহায্য করে! 📖 আমি ১০০% অফলাইন কাজ করি, আপনার তথ্য কখনো বাইরে যায় না। প্রশ্ন করুন, আমি আয়াত দিয়ে উত্তর দেব।";
    if (isAr) return "أنا هجة AI - صديق يساعدك على فهم القرآن! 📖 أنا أعمل ١٠٠٪ بدون إنترنت، بياناتك لا تغادر جهازك أبدًا. اسألني أي شيء، وسأجيب بالآيات.";
    return "I'm Hujjah AI — a friend who helps you understand the Quran! 📖 I work 100% offline, your data never leaves your device. Ask me anything, I'll answer with verses.";
  }
  if (thanks.some((t) => q.includes(t))) {
    if (isBn) return "আপনাকে জাযাকাল্লাহু খাইরান! 🙏 কুরআন শেখা ও শেখানো সবচেয়ে বড় সওয়াবের কাজ। যেকোনো সময় ফিরে আসুন!";
    if (isAr) return "جزاك الله خيراً! 🙏 البحث عن المعرفة القرآنية ومشاركتها من بين أفضل الأعمال. عد في أي وقت!";
    return "JazakAllahu khairan! 🙏 Seeking and sharing Quranic knowledge is among the best deeds. Come back anytime!";
  }
  // New: User asks what can you do
  const capabilities = ['what can you do', 'help me', 'কী করতে পারো', 'সাহায্য করো', 'features', 'options', 'ماذا يمكنك أن تفعل'];
  if (capabilities.some((c) => q.includes(c))) {
    if (isBn) return "আমি আপনাকে এগুলোতে সাহায্য করতে পারি:\n\n📖 যেকোনো আয়াত ব্যাখ্যা করতে পারি\n📚 সূরার সারাংশ দিতে পারি\n🔍 বিষয়ভিত্তিক অনুসন্ধান করতে পারি (যেমন: tawbah, sabr)\n📖 কুরআন থেকে উদ্ধৃতি দিতে পারি\n❓ ইসলামী প্রশ্নের উত্তর দিতে পারি\n\nযেকোনো কিছু জিজ্ঞাসা করুন!";
    if (isAr) return "إليك كيف يمكنني مساعدتك:\n\n📖 شرح أي آية قرآنية\n📚 تلخيص السور\n🔍 البحث حسب الموضوع (مثل: التوبة، الصبر، الرزق)\n📖 تقديم مراجع الآيات\n❓ الإجابة على الأسئلة الإسلامية\n\nماذا تود أن تستكشف؟";
    return "Here's how I can help you:\n\n📖 Explain any Quranic verse\n📚 Summarize surahs\n🔍 Search by topic (e.g., tawbah, sabr, rizq)\n📖 Provide verse references\n❓ Answer Islamic questions\n\nWhat would you like to explore?";
  }
  return null;
}

// ─── Query Intent Classification ───

export type QueryIntent = 'explain' | 'summarize' | 'analyze' | 'factual' | 'search';

/**
 * Classify the user's intent to tailor the prompt and response style.
 * - explain: "what does X mean", "explain", "why", "how"
 * - summarize: "summarize", "brief overview", "tldr"
 * - analyze: "analyze", "deep dive", "what does it teach us", "lessons"
 * - factual: "what is", "who is", "when", "where"
 * - search: "find", "show me", "list", bare noun queries
 */
export function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();
  // English (with boundaries) + Bengali/Arabic (without boundaries for script compatibility)
  if (/\b(analyze|deep dive|lessons|wisdom|insight|reflect)\b|(বিশ্লেষণ|শিক্ষা|তাৎপর্য|تأمل|تحليل|دروس|عبر|حكم)/.test(q)) return 'analyze';
  if (/\b(summarize|summary|overview|brief|tldr)\b|(সারাংশ|সারসংক্ষেপ|সংক্ষিপ্ত|ملخص|خلاصة|موجز|نبذة)/.test(q)) return 'summarize';
  if (/\b(explain|clarify|elaborate|describe|tell me about|what does .+ mean|why |how )\b|(ব্যাখ্যা|বর্ণনা|কিভাবে|কেন|تحدث|اشرح|وضح|صف|ما معنى|لماذا|كيف)/.test(q)) return 'explain';
  if (/\b(what is|what are|who is|who are|when |where |define)\b|(কি|কে|কখন|কোথায়|সংজ্ঞা|ما هو|من هو|متى|أين|عرف)/.test(q)) return 'factual';
  return 'search';
}

// ─── Phase 2 Step 3: Structured Context Builder ───

interface StructuredContext {
  quran: Array<{ ref: string; arabic: string; translation: string }>;
  hadith: Array<{ ref: string; arabic: string }>;
}

function buildStructuredContext(
  verses: VerseContext[],
  hadith: HadithContext[]
): StructuredContext {
  return {
    quran: verses.slice(0, 5).map((v) => ({
      ref: `${v.surah}:${v.ayah}`,
      arabic: v.text_ar,
      translation: v.text,
    })),
    hadith: hadith.slice(0, 2).map((h) => ({
      ref: `${h.book_name_en || h.book_name_ar} #${h.num_in_book}`,
      arabic: (h.matn_en ?? h.matn_ar).slice(0, 300),
    })),
  };
}

// ─── Phase 2 Step 4: Strict Grounding Prompt ───

function buildStrictPrompt(query: string, ctx: StructuredContext, lang: string, intent?: QueryIntent): string {
  const quranLines = ctx.quran
    .map((v) => `[Quran ${v.ref}] ${v.translation}`)
    .join('\n');
  const hadithLines = ctx.hadith
    .map((h) => `[Hadith ${h.ref}] ${h.arabic}`)
    .join('\n');
  const contextBlock = [quranLines, hadithLines].filter(Boolean).join('\n\n');

  if (!contextBlock.trim()) {
    return lang === 'bn'
      ? `প্রদত্ত উৎসে পাওয়া যায়নি।`
      : `Not found in provided sources.`;
  }

  if (lang === 'bn') {
    return `তুমি হুজ্জাহ এআই। শুধুমাত্র নিচের আয়াত ও হাদিস ব্যবহার করে প্রশ্নের সরাসরি উত্তর দাও। "ধন্যবাদ" দিয়ে শুরু করো না। সাধারণ ইসলামিক ওভারভিউ দিও না। ঠিক যা জানতে চাওয়া হয়েছে তার উত্তর দাও।

আয়াতসমূহ:
${contextBlock}

প্রশ্ন: ${query}

উত্তর (আয়াত রেফারেন্স দাও যেমন ২:২৫৫):`;
  }

  if (lang === 'ar') {
    return `أنت هجة AI. أجب على السؤال باستخدام الآيات والأحاديث المقدمة فقط. كن محدداً ومباشراً. لا تبدأ بـ"شكراً". لا تعطِ نظرة عامة إسلامية. أجب على السؤال المحدد المطروح.

الآيات:
${contextBlock}

السؤال: ${query}

الإجابة (اذكر المراجع مثل ٢:٢٥٥):`;
  }

  const instruction =
    intent === 'summarize'
      ? 'Provide a warm, friendly summary. Highlight key themes and practical takeaways. Use your own words, not just repeating the text.'
      : intent === 'analyze'
      ? 'Analyze deeply with warmth. Explore layers of meaning, linguistic nuances, historical context, and practical applications. Be insightful and thought-provoking.'
      : intent === 'explain'
      ? 'Explain clearly and warmly. Use relatable examples, explain Arabic terms simply, connect to modern life, and provide depth without being verbose.'
      : 'Respond warmly and conversationally. Use everyday language, give practical examples, draw connections, and make it feel like a friendly discussion.';

  return `You are Hujjah AI. Answer the question using ONLY the provided Quran verses and hadith. Be specific and direct. Do NOT start with "Thank you". Do NOT give a generic Islamic overview. Answer the EXACT question asked.

Verses:
${contextBlock}

Question: ${query}

Answer (${intent}, cite verse refs like 2:255):`;
}

// ─── Phase 2 Step 5: Output Validation ───

/**
 * Light validation — just check response isn't empty or clearly off-topic.
 * Allows LLM creativity and general knowledge.
 */
function validateOutput(output: string, _ctx: StructuredContext): boolean {
  if (!output || output.length < 10) return false;
  
  // Reject if it looks like a refusal or error
  const lower = output.toLowerCase();
  if (lower.includes('i cannot') && lower.includes('answer')) return false;
  if (lower.includes('not found in provided sources') && output.length < 50) return false;
  
  return true;
}

// ─── Phase 6: Low-End Device Detection ───

/**
 * Detect if device has constrained memory (< 3GB).
 * Uses navigator.deviceMemory (Chrome/Edge) when available.
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined) return mem < 3;
  return false;
}

// ─── Phase 7: Query Cache ───

interface CacheEntry {
  explanation: string;
  verses: VerseContext[];
  hadith: HadithContext[];
}

const queryCache = new Map<string, CacheEntry>();
const CACHE_MAX = 10;

function cacheGet(key: string): CacheEntry | undefined {
  return queryCache.get(key);
}

function cacheSet(key: string, value: CacheEntry): void {
  if (queryCache.size >= CACHE_MAX) {
    // Evict oldest entry
    const firstKey = queryCache.keys().next().value;
    if (firstKey) queryCache.delete(firstKey);
  }
  queryCache.set(key, value);
}

// ─── Prompt Builder (kept for verse-only fallback) ───

function buildPrompt(query: string, verses: VerseContext[], lang: string = 'en'): string {
  const ctx = buildStructuredContext(verses, []);
  return buildStrictPrompt(query, ctx, lang);
}

/**
 * Generate a grounded explanation from retrieved verses.
 * Falls back to extractive summary if model fails or output fails validation.
 */
export async function explainVerse(query: string, verses: VerseContext[], lang: string = 'en'): Promise<string> {
  if (IS_MOCK_MODE) {
    const chitchat = detectChitchat(query, lang);
    if (chitchat) return chitchat;
    return mockExplainQuery(query, lang).explanation;
  }

  // Handle greetings / small talk instantly without LLM
  const chitchat = detectChitchat(query, lang);
  if (chitchat) return chitchat;

  if (verses.length === 0) {
    return lang === 'bn'
      ? "প্রদত্ত উৎসে পাওয়া যায়নি।"
      : "Not found in provided sources.";
  }

  // Low-end devices: skip LLM, return extractive summary only
  if (isLowEndDevice()) {
    return formatVersesFallback(verses, query, lang);
  }

  const ctx = buildStructuredContext(verses, []);
  try {
    const prompt = buildPrompt(query, verses, lang);
    const text = await generate(prompt, 150);
    if (text) {
      if (validateOutput(text, ctx)) return text;
      // Output failed validation — fall back to extractive
      console.warn('[Explain] Output failed grounding validation, using extractive fallback');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Explain] Generation failed, using fallback:', message);
  }
  return formatVersesFallback(verses, query, lang);
}

/**
 * Detect if the query references a specific surah or verse range.
 * Returns specific verses if matched, null otherwise.
 */
async function detectSpecificVerses(query: string, lang: string): Promise<VerseContext[] | null> {
  const q = query.toLowerCase();
  const db = await getDB();

  // Pattern 1: "surah fatiha" / "chapter 2" / "سورة الفاتحة"
  const surahMatch = q.match(/(?:surah|chapter|সূরা|سورة)\s+([\w\s-]+|[\u0600-\u06FF\s]+)/);
  const numMatch = q.match(/(?:surah|chapter|সূরা|سورة)\s+(\d+)/);

  let surahId: number | null = null;

  if (numMatch) {
    surahId = parseInt(numMatch[1], 10);
  } else if (surahMatch) {
    let name = surahMatch[1].trim();
    // Search in en, bn, or ar surah names
    // 1. Try exact match
    const sql = `SELECT id FROM surahs WHERE LOWER(name_en) = LOWER(?) OR LOWER(name_bn) = LOWER(?) OR name_ar = ? LIMIT 1`;
    let rows = await db.select<{ id: number }[]>(sql, [name, name, name]);
    
    // 2. Try match without "Al-" prefix
    if (rows.length === 0 && (name.toLowerCase().startsWith('al-') || name.toLowerCase().startsWith('an-') || name.toLowerCase().startsWith('as-'))) {
      const stripped = name.split('-').slice(1).join('-');
      rows = await db.select<{ id: number }[]>(sql, [stripped, stripped, stripped]);
    }
    
    // 3. Try partial match
    if (rows.length === 0) {
      const sql2 = `SELECT id FROM surahs WHERE LOWER(name_en) LIKE LOWER(?) OR LOWER(name_bn) LIKE LOWER(?) OR name_ar LIKE ? LIMIT 1`;
      const pattern = `%${name}%`;
      rows = await db.select<{ id: number }[]>(sql2, [pattern, pattern, pattern]);
    }
    
    if (rows.length > 0) surahId = rows[0].id;
  }

  // Fallback: If no explicit "surah" keyword but intent is explain/summarize, check for surah name directly
  // e.g., "summarize fatiha"
  if (!surahId) {
    const words = q.split(/\s+/);
    for (const word of words) {
      if (word.length < 4 && !/[\u0600-\u06FF]/.test(word)) continue;
      // Skip common intent words
      if (['summarize', 'summary', 'explain', 'analyze', 'wisdom', 'lessons'].includes(word)) continue;
      
      const sql = `SELECT id FROM surahs WHERE LOWER(name_en) = LOWER(?) OR LOWER(name_bn) = LOWER(?) OR name_ar = ? OR LOWER(name_en) LIKE LOWER(?) OR LOWER(name_bn) LIKE LOWER(?) LIMIT 1`;
      const rows = await db.select<{ id: number }[]>(sql, [word, word, word, `%${word}%`, `%${word}%`]);
      if (rows.length > 0) {
        surahId = rows[0].id;
        break;
      }
    }
  }

  // Pattern 2: explicit range "2:1-5" or "verses 2:1 to 2:5"
  const rangeMatch = q.match(/(\d+):(\d+)\s*(?:-|to|through)\s*(\d+):(\d+)/);
  const simpleRangeMatch = q.match(/(\d+):(\d+)\s*(?:-|to|through)\s*(\d+)/);

  if (rangeMatch) {
    const s1 = parseInt(rangeMatch[1], 10);
    const a1 = parseInt(rangeMatch[2], 10);
    const a2 = parseInt(rangeMatch[4], 10);
    return fetchVerseRange(s1, a1, a2, lang);
  }
  if (simpleRangeMatch) {
    const s = parseInt(simpleRangeMatch[1], 10);
    const a1 = parseInt(simpleRangeMatch[2], 10);
    const a2 = parseInt(simpleRangeMatch[3], 10);
    return fetchVerseRange(s, a1, a2, lang);
  }

  // If we found a surah, determine how many verses to fetch
  if (surahId) {
    // "first few verses" / "beginning" / "first 5 verses"
    const fewMatch = q.match(/first\s+(\d+)/);
    const isBeginning = q.includes('beginning') || q.includes('first few') || q.includes('start') || q.includes('opening');
    const isFull = q.includes('all') || q.includes('whole') || q.includes('entire') || q.includes('full');

    if (fewMatch) {
      const count = parseInt(fewMatch[1], 10);
      return fetchVerseRange(surahId, 1, count, lang);
    }
    if (isBeginning) {
      return fetchVerseRange(surahId, 1, Math.min(7, await getSurahVerseCount(surahId)), lang);
    }
    if (isFull) {
      const count = await getSurahVerseCount(surahId);
      return fetchVerseRange(surahId, 1, count, lang);
    }

    // Default: fetch first 5 verses of the mentioned surah for context
    return fetchVerseRange(surahId, 1, Math.min(5, await getSurahVerseCount(surahId)), lang);
  }

  return null;
}

async function getSurahVerseCount(surah: number): Promise<number> {
  const db = await getDB();
  const sql = 'SELECT COUNT(*) as count FROM verses WHERE surah = ?';
  const rows = await db.select<{ count: number }[]>(sql, [surah]);
  return rows[0]?.count ?? 0;
}

async function fetchVerseRange(surah: number, startAyah: number, endAyah: number, lang: string): Promise<VerseContext[]> {
  const db = await getDB();
  const sql = `
    SELECT v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
    FROM verses v
    JOIN translations t ON v.id = t.verse_id
    WHERE v.surah = ? AND v.ayah >= ? AND v.ayah <= ? AND t.lang_code = ?
    ORDER BY v.ayah
    LIMIT 50
  `;
  const rows = await db.select<VerseContext[]>(sql, [surah, startAyah, endAyah, lang]);

  // Deduplicate: keep only one translation per verse (prefer 'sahih' or 'bengali')
  const seen = new Set<string>();
  const deduped: VerseContext[] = [];
  for (const r of rows) {
    const key = `${r.surah}:${r.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

/**
 * Native AI inference stub (Phase 4).
 * Called ONLY when NEXT_PUBLIC_USE_NATIVE_AI=true.
 * Currently returns mock response; will be wired to Rust backend.
 */
async function nativeExplainQuery(
  query: string,
  _lang: string = 'en'
): Promise<{ explanation: string; verses: VerseContext[]; hadith: HadithContext[] }> {
  const start = logInferenceStart('native', query.length);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const response = await invoke<string>('run_inference', { prompt: query });
    logInferenceEnd(start, 'native', query.length, response.length);
    return { explanation: response, verses: [], hadith: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logInferenceEnd(start, 'native', query.length, 0, message);
    console.warn('[NativeAI] Inference failed:', err);
    throw err;
  }
}

/**
 * Original Transformers.js RAG pipeline.
 * Always works, used as fallback.
 */
async function jsExplainQuery(
  query: string,
  lang: string = 'en'
): Promise<{ explanation: string; verses: VerseContext[]; hadith: HadithContext[] }> {
  const start = logInferenceStart('transformers.js', query.length);

  try {
    // Fast path: greetings / small talk — no RAG needed
    const chitchat = detectChitchat(query, lang);
    if (chitchat) {
      logInferenceEnd(start, 'transformers.js', query.length, chitchat.length);
      return { explanation: chitchat, verses: [], hadith: [] };
    }

    // Phase 7: Check query cache (last 10 queries)
    const cacheKey = `${lang}:${query.trim().toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      logInferenceEnd(start, 'transformers.js', query.length, cached.explanation.length);
      return cached;
    }

    // Classify intent to tailor prompt
    const intent = classifyIntent(query);

    // Phase 6: Low-end device — keyword-only, no embedding
    const lowEnd = isLowEndDevice();

    // Try to detect specific surah / verse references first
    const specificVerses = await detectSpecificVerses(query, lang);
    if (specificVerses && specificVerses.length > 0) {
      const explanation = await explainVerse(query, specificVerses, lang);
      const result = { explanation, verses: specificVerses, hadith: [] };
      cacheSet(cacheKey, result);
      logInferenceEnd(start, 'transformers.js', query.length, explanation.length);
      return result;
    }

    const db = await getDB();

    let scored: VerseContext[] = [];

    if (lowEnd) {
    // Low-end: FTS5 keyword search only, no embedding computation
    const ftsQuery = query.trim().toLowerCase();
    const ftsSql = `
      SELECT v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
      FROM quran_search_idx
      JOIN translations t ON t.id = quran_search_idx.rowid
      JOIN verses v ON v.id = t.verse_id
      WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ?
      ORDER BY bm25(quran_search_idx)
      LIMIT 5
    `;
    try {
      const ftsRows = await db.select<VerseContext[]>(ftsSql, [ftsQuery, lang]);
      scored = ftsRows;
    } catch {
      scored = [];
    }
  } else {
    // Use hybrid retrieval: FTS5 pre-filter → embedding rerank
    const hybridResults = await retrieveHybrid(query, lang, 5);
    scored = hybridResults.map((r) => ({
      surah: r.surah,
      ayah: r.ayah,
      text_ar: r.text_ar,
      text: r.text,
      translator_slug: r.translator_slug,
    }));
  }

  // Step 4: Search hadith corpus (github-classic only, top 2 results)
  const hadithResults = lowEnd ? [] : await retrieveHadithContext(query, 2);

  // Step 5: Build structured context and strict prompt
  let explanation: string;
  if (scored.length === 0 && hadithResults.length === 0) {
    explanation = lang === 'bn'
      ? 'প্রদত্ত উৎসে পাওয়া যায়নি।'
      : 'Not found in provided sources.';
  } else if (lowEnd) {
    // Low-end: extractive only, no LLM
    explanation = formatVersesFallback(scored, query, lang);
  } else {
    const ctx = buildStructuredContext(scored, hadithResults);
    try {
      const prompt = buildHadithPrompt(query, scored, hadithResults, lang, intent);
      console.log('[Explain] Prompt length:', prompt.length, '— calling generation worker...');
      const raw = await generate(prompt, 150);
      console.log('[Explain] Generation returned:', raw?.slice(0, 100), '...');
      if (raw && validateOutput(raw, ctx)) {
        explanation = raw;
        console.log('[Explain] Output passed validation ✓');
      } else {
        if (raw) console.warn('[Explain] Output failed grounding validation, using extractive fallback');
        else console.warn('[Explain] Generation returned empty, using fallback');
        explanation = formatVersesFallback(scored, query, lang);
      }
    } catch (err) {
      console.error('[Explain] Generation failed:', err);
      explanation = formatVersesFallback(scored, query, lang);
    }
  }

  const result = { explanation, verses: scored, hadith: hadithResults };
  cacheSet(cacheKey, result);
  logInferenceEnd(start, 'transformers.js', query.length, explanation.length);
  return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logInferenceEnd(start, 'transformers.js', query.length, 0, message);
    throw err;
  }
}

/**
 * Public API: routes to native or Transformers.js based on feature flag.
 * Default: Transformers.js (native disabled).
 * If native fails, falls back to Transformers.js automatically.
 * Phase 8: Logs all inference attempts for rollout monitoring.
 *
 * @param onProgress Optional callback for progress messages (used for Bengali two-pass pipeline)
 */
export async function explainQuery(
  query: string,
  lang: string = 'en',
  onProgress?: (msg: string) => void
): Promise<{ explanation: string; verses: VerseContext[]; hadith: HadithContext[] }> {
  // Mock mode: bypass all LLM infrastructure entirely
  if (IS_MOCK_MODE) {
    const chitchat = detectChitchat(query, lang);
    if (chitchat) return { explanation: chitchat, verses: [], hadith: [] };
    return mockExplainQuery(query, lang);
  }

  const start = logInferenceStart('fallback', query.length);

  // CRITICAL: Check chitchat BEFORE routing to any backend.
  // Greetings should NEVER hit the LLM — they reply instantly.
  const chitchat = detectChitchat(query, lang);
  if (chitchat) {
    logInferenceEnd(start, 'fallback', query.length, chitchat.length);
    return { explanation: chitchat, verses: [], hadith: [] };
  }

  try {
    let result;
    if (USE_LLAMA_CPP) {
      // Route to llama.cpp Rust backend
      result = await withLlamaFallback(
        () => llamaExplainQuery(query, lang, onProgress),
        () => jsExplainQuery(query, lang),
        'explainQuery'
      );
    } else {
      // Legacy path disabled — llama.cpp is required
      throw new Error('llama.cpp is disabled. Enable it in Settings to use AI chat.');
    }
    logInferenceEnd(start, 'fallback', query.length, result.explanation.length);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logInferenceEnd(start, 'fallback', query.length, 0, message);

    // Graceful degradation: return error as assistant message
    const errorExplanation = lang === 'bn'
      ? `আমি দুঃখিত, AI ব্যাকএন্ডে একটি সমস্যা হয়েছে:\n\n${message}\n\nআপনি কি llama-cli ইনস্টল করেছেন? Settings > AI Model দেখুন।`
      : lang === 'ar'
      ? `عذراً، حدثت مشكلة في الواجهة الخلفية للذكاء الاصطناعي:\n\n${message}\n\nهل قمت بتثبيت llama-cli؟ راجع الإعدادات > نموذج الذكاء الاصطناعي.`
      : `Sorry, there was an issue with the AI backend:\n\n${message}\n\nHave you installed llama-cli? Check Settings > AI Model.`;

    return { explanation: errorExplanation, verses: [], hadith: [] };
  }
}

/**
 * Translate text via llama.cpp.
 * Bypasses RAG — simple translate prompt.
 */
async function translateWithLlama(text: string, targetLang: string): Promise<string> {
  const langName = targetLang === 'bn' ? 'Bengali' : targetLang === 'ar' ? 'Arabic' : 'English';
  const userPrompt = `Translate the following text to ${langName}. Keep all Quran references like (2:255) intact. Output only the translation.\n\nText: ${text}`;
  const prompt = formatLlamaPrompt(userPrompt);
  const { invoke } = await import('@tauri-apps/api/core');
  const response = await invoke<string>('run_llama', { prompt });
  return response.trim();
}

/**
 * Format prompt for Qwen2.5-Instruct ChatML template.
 * Required so the GGUF model understands the conversation structure.
 * Qwen2.5 uses <|im_start|>/<|im_end|> tokens — NOT Mistral </s><|user|> format.
 */
function formatLlamaPrompt(userPrompt: string): string {
  return `<|im_start|>system\nYou are Hujjah AI, a knowledgeable Islamic research assistant. Answer using ONLY the provided Quran verses and hadith. Be specific and direct.<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
}

/**
 * llama.cpp GGUF inference with full RAG pipeline.
 * For Bengali queries: translate to EN → RAG (EN verses) → generate EN → translate to BN.
 */
async function llamaExplainQuery(
  query: string,
  lang: string = 'en',
  onProgress?: (msg: string) => void
): Promise<{ explanation: string; verses: VerseContext[]; hadith: HadithContext[] }> {
  const start = logInferenceStart('llama.cpp', query.length);
  try {
    const { invoke } = await import('@tauri-apps/api/core');

    // Bengali pipeline: retrieve BN verses → generate EN answer → translate to BN
    if (lang === 'bn') {
      return llamaExplainBengali(query, start, invoke, onProgress);
    }

    // English / Arabic: standard RAG
    const intent = classifyIntent(query);
    const specificVerses = await detectSpecificVerses(query, lang);

    let verses: VerseContext[] = [];
    let hadith: HadithContext[] = [];

    if (specificVerses && specificVerses.length > 0) {
      verses = specificVerses;
    } else {
      const hybridResults = await retrieveHybrid(query, lang, 5);
      verses = hybridResults.map((r) => ({
        surah: r.surah,
        ayah: r.ayah,
        text_ar: r.text_ar,
        text: r.text,
        translator_slug: r.translator_slug,
      }));
      hadith = await retrieveHadithContext(query, 2);
    }

    const groundedPrompt = buildHadithPrompt(query, verses, hadith, lang, intent);
    const formattedPrompt = formatLlamaPrompt(groundedPrompt);
    const response = await invoke<string>('run_llama', { prompt: formattedPrompt });
    logInferenceEnd(start, 'llama.cpp', query.length, response.length);
    return { explanation: response, verses, hadith };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logInferenceEnd(start, 'llama.cpp', query.length, 0, message);
    throw err;
  }
}

/**
 * Bengali query pipeline — two-pass EN→BN:
 * 1. Retrieve Bengali verses (BGE-M3 is multilingual — works for Bengali queries)
 * 2. Generate an English answer (Qwen-1.5B is fluent in English)
 * 3. Translate the English answer to Bengali (translation is simpler than generation)
 *
 * Why two-pass: Qwen-1.5B generates garbled Bengali from scratch but translates
 * English→Bengali accurately when given a focused translation prompt.
 */
async function llamaExplainBengali(
  query: string,
  start: ReturnType<typeof logInferenceStart>,
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>,
  onProgress?: (msg: string) => void
): Promise<{ explanation: string; verses: VerseContext[]; hadith: HadithContext[] }> {
  try {
    const intent = classifyIntent(query);

    // Step 1: Retrieve relevant verses and hadith
    onProgress?.('আয়াত ও হাদিস খুঁজছি...');

    // Detect query script — Bengali users often type in English.
    // Retrieval must match the query language, not the output language.
    const hasBengaliQuery = /[\u0980-\u09FF]/.test(query);
    const retrievalLang = hasBengaliQuery ? 'bn' : 'en';

    const specificVerses = await detectSpecificVerses(query, retrievalLang);
    let verses: VerseContext[] = [];
    let hadith: HadithContext[] = [];

    if (specificVerses && specificVerses.length > 0) {
      verses = specificVerses;
    } else {
      const hybridResults = await retrieveHybrid(query, retrievalLang, 5);
      verses = hybridResults.map((r) => ({
        surah: r.surah,
        ayah: r.ayah,
        text_ar: r.text_ar,
        text: r.text,
        translator_slug: r.translator_slug,
      }));

      // Fallback: Bengali FTS/embeddings may be absent in the DB.
      // Retrieve English verses instead — the generation step is in English anyway.
      if (verses.length === 0 && retrievalLang === 'bn') {
        const enResults = await retrieveHybrid(query, 'en', 5);
        verses = enResults.map((r) => ({
          surah: r.surah,
          ayah: r.ayah,
          text_ar: r.text_ar,
          text: r.text,
          translator_slug: r.translator_slug,
        }));
      }
    }

    // Hadith: extract English keywords from Bengali query — Bengali text won't FTS-match
    // English hadith translations. Fall back to original query if no keywords found.
    const hadithEnKeywords = extractHadithKeywordsFromBengali(query);
    hadith = await retrieveHadithContext(hadithEnKeywords || query, 2);

    if (verses.length === 0 && hadith.length === 0) {
      const explanation = 'এই বিষয়ে কোনো আয়াত বা হাদিস পাওয়া যায়নি।';
      logInferenceEnd(start, 'llama.cpp', query.length, explanation.length);
      return { explanation, verses, hadith };
    }

    // Step 2: Generate English answer (Qwen-1.5B is fluent in English)
    onProgress?.('উত্তর তৈরি হচ্ছে...');

    // Use extracted English keywords as the generation question so Qwen sees English input.
    // e.g. Bengali "কিয়ামতের আলামত কী?" → "What does Islam say about: judgment day resurrection signs"
    const enQuestion = hadithEnKeywords
      ? `What does Islam say about: ${hadithEnKeywords}`
      : query;
    const enGroundedPrompt = buildHadithPrompt(enQuestion, verses, hadith, 'en', intent);
    const enFormattedPrompt = formatLlamaPrompt(enGroundedPrompt);
    const enResponse = await invoke('run_llama', { prompt: enFormattedPrompt }) as string;

    if (!enResponse || enResponse.trim().length < 20) {
      const explanation = formatVersesFallback(verses, query, 'bn');
      logInferenceEnd(start, 'llama.cpp', query.length, explanation.length);
      return { explanation, verses, hadith };
    }

    // Step 3: Translate English → Bengali
    onProgress?.('বাংলায় অনুবাদ হচ্ছে...');

    const translatePrompt = formatLlamaPrompt(
      `You are a Bengali (বাংলা) translator for Islamic content. Translate the text below to natural, fluent Bengali.\n\nRules:\n- Output ONLY the Bengali translation. No English. No explanations.\n- Keep Quran verse references like (2:255) or [2:255] unchanged.\n- Keep proper nouns: Allah, Quran, Hadith, Salah, Zakat, Hajj, Jannah, Jahannam — unchanged.\n- Do NOT add greetings or commentary.\n\nText to translate:\n${enResponse.trim()}\n\nBengali translation:`
    );
    let bnResponse = await invoke('run_llama', { prompt: translatePrompt }) as string;
    bnResponse = bnResponse?.trim() ?? '';

    // Validate: require ≥30% Bengali characters in non-whitespace output
    const bengaliCharCount = (bnResponse.match(/[\u0980-\u09FF]/g) ?? []).length;
    const nonSpaceCount = bnResponse.replace(/\s/g, '').length;
    const bengaliRatio = nonSpaceCount > 0 ? bengaliCharCount / nonSpaceCount : 0;
    const hasBengaliScript = bengaliRatio >= 0.3 && bnResponse.length > 20;
    const explanation = hasBengaliScript
      ? bnResponse
      : enResponse.trim();

    logInferenceEnd(start, 'llama.cpp', query.length, explanation.length);
    return { explanation, verses, hadith };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logInferenceEnd(start, 'llama.cpp', query.length, 0, message);
    throw err;
  }
}

/**
 * Build a strict grounding prompt for combined Quran + Hadith context.
 */
function buildHadithPrompt(
  query: string,
  verses: VerseContext[],
  hadith: HadithContext[],
  lang: string = 'en',
  intent?: QueryIntent
): string {
  const ctx = buildStructuredContext(verses, hadith);
  return buildStrictPrompt(query, ctx, lang, intent);
}
