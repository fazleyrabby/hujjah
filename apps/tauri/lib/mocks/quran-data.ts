/**
 * lib/mocks/quran-data.ts
 *
 * Realistic mock Quran data for Next.js-only testing.
 * No DB connection required. Completely safe — read-only static data.
 */

import type { Surah, SurahVerse, SearchResult, QuranStats } from '@/lib/db';

// ─── Surah Metadata ───

export const MOCK_SURAHS: Surah[] = [
  { id: 1, name_ar: 'الفاتحة', name_en: 'Al-Fatiha', name_bn: 'আল-ফাতিহা' },
  { id: 2, name_ar: 'البقرة', name_en: 'Al-Baqarah', name_bn: 'আল-বাকারাহ' },
  { id: 3, name_ar: 'آل عمران', name_en: "Aal-E-Imran", name_bn: 'আল-ই-ইমরান' },
  { id: 4, name_ar: 'النساء', name_en: 'An-Nisa', name_bn: 'আন-নিসা' },
  { id: 5, name_ar: 'المائدة', name_en: "Al-Ma'idah", name_bn: 'আল-মায়িদাহ' },
  { id: 6, name_ar: 'الأنعام', name_en: "Al-An'am", name_bn: "আল-আন'আম" },
  { id: 7, name_ar: 'الأعراف', name_en: "Al-A'raf", name_bn: "আল-আ'রাফ" },
  { id: 8, name_ar: 'الأنفال', name_en: 'Al-Anfal', name_bn: 'আল-আনফাল' },
  { id: 9, name_ar: 'التوبة', name_en: 'At-Tawbah', name_bn: 'আত-তাওবাহ' },
  { id: 10, name_ar: 'يونس', name_en: 'Yunus', name_bn: 'ইউনুস' },
  { id: 11, name_ar: 'هود', name_en: 'Hud', name_bn: 'হুদ' },
  { id: 12, name_ar: 'يوسف', name_en: 'Yusuf', name_bn: 'ইউসুফ' },
  { id: 13, name_ar: 'الرعد', name_en: "Ar-Ra'd", name_bn: 'আর-রাদ' },
  { id: 14, name_ar: 'إبراهيم', name_en: 'Ibrahim', name_bn: 'ইব্রাহীম' },
  { id: 15, name_ar: 'الحجر', name_en: 'Al-Hijr', name_bn: 'আল-হিজর' },
  { id: 16, name_ar: 'النحل', name_en: 'An-Nahl', name_bn: 'আন-নাহল' },
  { id: 17, name_ar: 'الإسراء', name_en: 'Al-Isra', name_bn: 'আল-ইসরা' },
  { id: 18, name_ar: 'الكهف', name_en: 'Al-Kahf', name_bn: 'আল-কাহফ' },
  { id: 19, name_ar: 'مريم', name_en: 'Maryam', name_bn: 'মারিয়াম' },
  { id: 20, name_ar: 'طه', name_en: 'Taha', name_bn: 'ত্বাহা' },
  { id: 21, name_ar: 'الأنبياء', name_en: 'Al-Anbiya', name_bn: 'আল-আম্বিয়া' },
  { id: 22, name_ar: 'الحج', name_en: 'Al-Hajj', name_bn: 'আল-হাজ্জ' },
  { id: 23, name_ar: 'المؤمنون', name_en: 'Al-Mu\'minun', name_bn: 'আল-মুমিনুন' },
  { id: 24, name_ar: 'النور', name_en: 'An-Nur', name_bn: 'আন-নূর' },
  { id: 25, name_ar: 'الفرقان', name_en: 'Al-Furqan', name_bn: 'আল-ফুরকান' },
  { id: 26, name_ar: 'الشعراء', name_en: 'Ash-Shu\'ara', name_bn: 'আশ-শুআরা' },
  { id: 27, name_ar: 'النمل', name_en: 'An-Naml', name_bn: 'আন-নামল' },
  { id: 28, name_ar: 'القصص', name_en: 'Al-Qasas', name_bn: 'আল-কাসাস' },
  { id: 29, name_ar: 'العنكبوت', name_en: 'Al-\'Ankabut', name_bn: 'আল-আনকাবুত' },
  { id: 30, name_ar: 'الروم', name_en: 'Ar-Rum', name_bn: 'আর-রুম' },
  { id: 31, name_ar: 'لقمان', name_en: 'Luqman', name_bn: 'লুকমান' },
  { id: 32, name_ar: 'السجدة', name_en: 'As-Sajda', name_bn: 'আস-সাজদাহ' },
  { id: 33, name_ar: 'الأحزاب', name_en: 'Al-Ahzab', name_bn: 'আল-আহযাব' },
  { id: 34, name_ar: 'سبأ', name_en: 'Saba', name_bn: 'সাবা' },
  { id: 35, name_ar: 'فاطر', name_en: 'Fatir', name_bn: 'ফাতির' },
  { id: 36, name_ar: 'يس', name_en: 'Ya-Sin', name_bn: 'ইয়াসীন' },
  { id: 37, name_ar: 'الصافات', name_en: 'As-Saffat', name_bn: 'আস-সাফফাত' },
  { id: 38, name_ar: 'ص', name_en: 'Sad', name_bn: 'সাদ' },
  { id: 39, name_ar: 'الزمر', name_en: 'Az-Zumar', name_bn: 'আয-যুমার' },
  { id: 40, name_ar: 'غافر', name_en: 'Ghafir', name_bn: 'গাফির' },
  { id: 41, name_ar: 'فصلت', name_en: 'Fussilat', name_bn: 'ফুসসিলাত' },
  { id: 42, name_ar: 'الشورى', name_en: 'Ash-Shura', name_bn: 'আশ-শূরা' },
  { id: 43, name_ar: 'الزخرف', name_en: 'Az-Zukhruf', name_bn: 'আয-যুখরুফ' },
  { id: 44, name_ar: 'الدخان', name_en: 'Ad-Dukhan', name_bn: 'আদ-দুখান' },
  { id: 45, name_ar: 'الجاثية', name_en: 'Al-Jathiya', name_bn: 'আল-জাসিয়া' },
  { id: 46, name_ar: 'الأحقاف', name_en: 'Al-Ahqaf', name_bn: 'আল-আহকাফ' },
  { id: 47, name_ar: 'محمد', name_en: 'Muhammad', name_bn: 'মুহাম্মাদ' },
  { id: 48, name_ar: 'الفتح', name_en: 'Al-Fath', name_bn: 'আল-ফাতহ' },
  { id: 49, name_ar: 'الحجرات', name_en: 'Al-Hujurat', name_bn: 'আল-হুজুরাত' },
  { id: 50, name_ar: 'ق', name_en: 'Qaf', name_bn: 'কাফ' },
  { id: 51, name_ar: 'الذاريات', name_en: 'Adh-Dhariyat', name_bn: 'আয-যারিয়াত' },
  { id: 52, name_ar: 'الطور', name_en: 'At-Tur', name_bn: 'আত-তূর' },
  { id: 53, name_ar: 'النجم', name_en: 'An-Najm', name_bn: 'আন-নাজম' },
  { id: 54, name_ar: 'القمر', name_en: 'Al-Qamar', name_bn: 'আল-কামার' },
  { id: 55, name_ar: 'الرحمن', name_en: 'Ar-Rahman', name_bn: 'আর-রাহমান' },
  { id: 56, name_ar: 'الواقعة', name_en: 'Al-Waqi\'a', name_bn: 'আল-ওয়াকিয়া' },
  { id: 57, name_ar: 'الحديد', name_en: 'Al-Hadid', name_bn: 'আল-হাদীদ' },
  { id: 58, name_ar: 'المجادلة', name_en: 'Al-Mujadila', name_bn: 'আল-মুজাদিলাহ' },
  { id: 59, name_ar: 'الحشر', name_en: 'Al-Hashr', name_bn: 'আল-হাশর' },
  { id: 60, name_ar: 'الممتحنة', name_en: 'Al-Mumtahanah', name_bn: 'আল-মুমতাহিনাহ' },
  { id: 61, name_ar: 'الصف', name_en: 'As-Saff', name_bn: 'আস-সাফ' },
  { id: 62, name_ar: 'الجمعة', name_en: 'Al-Jumu\'a', name_bn: 'আল-জুমুআ' },
  { id: 63, name_ar: 'المنافقون', name_en: 'Al-Munafiqun', name_bn: 'আল-মুনাফিকুন' },
  { id: 64, name_ar: 'التغابن', name_en: 'At-Taghabun', name_bn: 'আত-তাগাবুন' },
  { id: 65, name_ar: 'الطلاق', name_en: 'At-Talaq', name_bn: 'আত-তালাক' },
  { id: 66, name_ar: 'التحريم', name_en: 'At-Tahrim', name_bn: 'আত-তাহরীম' },
  { id: 67, name_ar: 'الملك', name_en: 'Al-Mulk', name_bn: 'আল-মুলক' },
  { id: 68, name_ar: 'القلم', name_en: 'Al-Qalam', name_bn: 'আল-কালাম' },
  { id: 69, name_ar: 'الحاقة', name_en: 'Al-Haqqah', name_bn: 'আল-হাক্কাহ' },
  { id: 70, name_ar: 'المعارج', name_en: 'Al-Ma\'arij', name_bn: 'আল-মাআরিজ' },
  { id: 71, name_ar: 'نوح', name_en: 'Nuh', name_bn: 'নূহ' },
  { id: 72, name_ar: 'الجن', name_en: 'Al-Jinn', name_bn: 'আল-জিন' },
  { id: 73, name_ar: 'المزمل', name_en: 'Al-Muzzammil', name_bn: 'আল-মুজাম্মিল' },
  { id: 74, name_ar: 'المدثر', name_en: 'Al-Muddaththir', name_bn: 'আল-মুদ্দাস্সির' },
  { id: 75, name_ar: 'القيامة', name_en: 'Al-Qiyamah', name_bn: 'আল-কিয়ামাহ' },
  { id: 76, name_ar: 'الإنسان', name_en: 'Al-Insan', name_bn: 'আল-ইনসান' },
  { id: 77, name_ar: 'المرسلات', name_en: 'Al-Mursalat', name_bn: 'আল-মুরসালাত' },
  { id: 78, name_ar: 'النبأ', name_en: 'An-Naba', name_bn: 'আন-নাবা' },
  { id: 79, name_ar: 'النازعات', name_en: 'An-Nazi\'at', name_bn: 'আন-নাযিয়াত' },
  { id: 80, name_ar: 'عبس', name_en: '\'Abasa', name_bn: 'আবাসা' },
  { id: 81, name_ar: 'التكوير', name_en: 'At-Takwir', name_bn: 'আত-তাকভীর' },
  { id: 82, name_ar: 'الإنفطار', name_en: 'Al-Infitar', name_bn: 'আল-ইনফিতার' },
  { id: 83, name_ar: 'المطففين', name_en: 'Al-Mutaffifin', name_bn: 'আল-মুতাফফিফীন' },
  { id: 84, name_ar: 'الإنشقاق', name_en: 'Al-Inshiqaq', name_bn: 'আল-ইনশিকাক' },
  { id: 85, name_ar: 'البروج', name_en: 'Al-Buruj', name_bn: 'আল-বুরুজ' },
  { id: 86, name_ar: 'الطارق', name_en: 'At-Tariq', name_bn: 'আত-তারিক' },
  { id: 87, name_ar: 'الأعلى', name_en: 'Al-A\'la', name_bn: "আল-আ'লা" },
  { id: 88, name_ar: 'الغاشية', name_en: 'Al-Ghashiyah', name_bn: 'আল-গাশিয়াহ' },
  { id: 89, name_ar: 'الفجر', name_en: 'Al-Fajr', name_bn: 'আল-ফাজর' },
  { id: 90, name_ar: 'البلد', name_en: 'Al-Balad', name_bn: 'আল-বালাদ' },
  { id: 91, name_ar: 'الشمس', name_en: 'Ash-Shams', name_bn: 'আশ-শামস' },
  { id: 92, name_ar: 'الليل', name_en: 'Al-Layl', name_bn: 'আল-লাইল' },
  { id: 93, name_ar: 'الضحى', name_en: 'Ad-Duha', name_bn: 'আদ-দুহা' },
  { id: 94, name_ar: 'الشرح', name_en: 'Ash-Sharh', name_bn: 'আশ-শারহ' },
  { id: 95, name_ar: 'التين', name_en: 'At-Tin', name_bn: 'আত-তীন' },
  { id: 96, name_ar: 'العلق', name_en: 'Al-\'Alaq', name_bn: 'আল-আলাক' },
  { id: 97, name_ar: 'القدر', name_en: 'Al-Qadr', name_bn: 'আল-কাদর' },
  { id: 98, name_ar: 'البينة', name_en: 'Al-Bayyinah', name_bn: 'আল-বাইয়্যিনাহ' },
  { id: 99, name_ar: 'الزلزلة', name_en: 'Az-Zilzal', name_bn: 'আয-যিলযাল' },
  { id: 100, name_ar: 'العاديات', name_en: 'Al-\'Adiyat', name_bn: 'আল-আদিয়াত' },
  { id: 101, name_ar: 'القارعة', name_en: 'Al-Qari\'a', name_bn: 'আল-কারিয়া' },
  { id: 102, name_ar: 'التكاثر', name_en: 'At-Takathur', name_bn: 'আত-তাকাসুর' },
  { id: 103, name_ar: 'العصر', name_en: 'Al-\'Asr', name_bn: 'আল-আসর' },
  { id: 104, name_ar: 'الهمزة', name_en: 'Al-Humazah', name_bn: 'আল-হুমাযাহ' },
  { id: 105, name_ar: 'الفيل', name_en: 'Al-Fil', name_bn: 'আল-ফীল' },
  { id: 106, name_ar: 'قريش', name_en: 'Quraysh', name_bn: 'কুরাইশ' },
  { id: 107, name_ar: 'الماعون', name_en: 'Al-Ma\'un', name_bn: 'আল-মাউন' },
  { id: 108, name_ar: 'الكوثر', name_en: 'Al-Kawthar', name_bn: 'আল-কাওসার' },
  { id: 109, name_ar: 'الكافرون', name_en: 'Al-Kafirun', name_bn: 'আল-কাফিরুন' },
  { id: 110, name_ar: 'النصر', name_en: 'An-Nasr', name_bn: 'আন-নাসর' },
  { id: 111, name_ar: 'المسد', name_en: 'Al-Masad', name_bn: 'আল-মাসাদ' },
  { id: 112, name_ar: 'الإخلاص', name_en: 'Al-Ikhlas', name_bn: 'আল-ইখলাস' },
  { id: 113, name_ar: 'الفلق', name_en: 'Al-Falaq', name_bn: 'আল-ফালাক' },
  { id: 114, name_ar: 'الناس', name_en: 'An-Nas', name_bn: 'আন-নাস' },
];

// ─── Surah Verses (key surahs only) ───

const FATIHA_AR = [
  'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
  'الرَّحْمَٰنِ الرَّحِيمِ',
  'مَالِكِ يَوْمِ الدِّينِ',
  'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
  'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
  'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
];

const FATIHA_EN = [
  'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
  '[All] praise is [due] to Allah, Lord of the worlds —',
  'The Entirely Merciful, the Especially Merciful,',
  'Sovereign of the Day of Recompense.',
  'It is You we worship and You we ask for help.',
  'Guide us to the straight path —',
  'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.',
];

const FATIHA_BN = [
  'পরম করুণাময়, অতি দয়ালু আল্লাহর নামে শুরু করছি।',
  'সমস্ত প্রশংসা জগতসমূহের প্রতিপালক আল্লাহর জন্য।',
  'যিনি পরম করুণাময়, অতি দয়ালু।',
  'যিনি বিচার দিনের মালিক।',
  'আমরা একমাত্র তোমারই ইবাদত করি এবং একমাত্র তোমারই সাহায্য প্রার্থনা করি।',
  'আমাদের সরল পথে পরিচালিত কর।',
  'তাদের পথে, যাদের প্রতি তুমি অনুগ্রহ করেছ, তাদের পথে নয়, যাদের প্রতি তোমার গজব নাযিল হয়েছে এবং নয় পথভ্রষ্টদের।',
];

const IKHLAS_AR = [
  'قُلْ هُوَ اللَّهُ أَحَدٌ',
  'اللَّهُ الصَّمَدُ',
  'لَمْ يَلِدْ وَلَمْ يُولَدْ',
  'وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ',
];

const IKHLAS_EN = [
  'Say, "He is Allah, [who is] One,',
  'Allah, the Eternal Refuge.',
  'He neither begets nor is born,',
  'Nor is there to Him any equivalent."',
];

const IKHLAS_BN = [
  'বলুন, তিনি আল্লাহ, এক,',
  'আল্লাহ, অমুখাপেক্ষী।',
  'তিনি কাউকে জন্ম দেননি এবং তাঁকেও জন্ম দেওয়া হয়নি।',
  'আর তাঁর সমতুল্য কেউ নেই।',
];

const RAHMAN_AR = [
  'الرَّحْمَٰنُ',
  'عَلَّمَ الْقُرْآنَ',
  'خَلَقَ الْإِنْسَانَ',
  'عَلَّمَهُ الْبَيَانَ',
  'الشَّمْسُ وَالْقَمَرُ بِحُسْبَانٍ',
];

const RAHMAN_EN = [
  'The Most Merciful,',
  'Taught the Quran,',
  'Created man,',
  '[And] taught him eloquence.',
  'The sun and the moon [move] by precise calculation,',
];

const RAHMAN_BN = [
  'পরম করুণাময়,',
  'তিনি কুরআন শিক্ষা দিয়েছেন,',
  'তিনি মানুষ সৃষ্টি করেছেন,',
  'তাকে বাকপটুতা শিক্ষা দিয়েছেন।',
  'সূর্য ও চাঁদ এক নিয়মে চলছে,',
];

// Build verse maps
function buildVerses(
  surah: number,
  ar: string[],
  en: string[],
  bn: string[]
): Record<string, SurahVerse[]> {
  const base = ar.map((text_ar, i) => ({
    id: surah * 1000 + i + 1,
    surah,
    ayah: i + 1,
    text_ar,
    text: en[i],
    translator_slug: 'sahih',
  }));
  const bnVerses = ar.map((text_ar, i) => ({
    id: surah * 1000 + i + 1,
    surah,
    ayah: i + 1,
    text_ar,
    text: bn[i],
    translator_slug: 'bengali',
  }));
  return {
    en: base,
    bn: bnVerses,
    ar: ar.map((text_ar, i) => ({
      id: surah * 1000 + i + 1,
      surah,
      ayah: i + 1,
      text_ar,
      text: text_ar,
      translator_slug: 'arabic',
    })),
  };
}

const SURAH_VERSES: Record<number, Record<string, SurahVerse[]>> = {
  1: buildVerses(1, FATIHA_AR, FATIHA_EN, FATIHA_BN),
  112: buildVerses(112, IKHLAS_AR, IKHLAS_EN, IKHLAS_BN),
  55: buildVerses(55, RAHMAN_AR, RAHMAN_EN, RAHMAN_BN),
};

// Fallback generic verses for other surahs
function getGenericVerses(surah: number, lang: string): SurahVerse[] {
  const count = surah === 2 ? 7 : surah === 3 ? 5 : 3;
  const texts: Record<string, string[]> = {
    en: Array.from({ length: count }, (_, i) => `This is verse ${i + 1} of Surah ${surah} (mock data for UI testing).`),
    bn: Array.from({ length: count }, (_, i) => `এটি সূরা ${surah}-এর আয়াত ${i + 1} (ইউআই টেস্টের জন্য মক ডেটা)।`),
    ar: Array.from({ length: count }, (_, i) => `هذه الآية ${i + 1} من سورة ${surah} (بيانات وهمية).`),
  };
  const arabic = Array.from({ length: count }, (_, i) => `بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — آية ${i + 1}`);
  return arabic.map((text_ar, i) => ({
    id: surah * 1000 + i + 1,
    surah,
    ayah: i + 1,
    text_ar,
    text: texts[lang]?.[i] ?? texts.en[i],
    translator_slug: lang === 'ar' ? 'arabic' : lang === 'bn' ? 'bengali' : 'sahih',
  }));
}

export function mockGetSurahVerses(surah: number, lang: string = 'en'): SurahVerse[] {
  return SURAH_VERSES[surah]?.[lang] ?? getGenericVerses(surah, lang);
}

export function mockGetSurahList(): Surah[] {
  return MOCK_SURAHS;
}

export function mockGetQuranStats(): QuranStats {
  return { verses: 6236, translations: 68596, languages: 3 };
}

export function mockGetSurahTranslators(surah: number, lang: string = 'en'): { translator_slug: string; count: number }[] {
  if (lang === 'ar') return [{ translator_slug: 'arabic', count: 7 }];
  const translators = lang === 'bn'
    ? ['bengali', 'maududi']
    : ['sahih', 'pickthall', 'yusufali'];
  return translators.map((t) => ({ translator_slug: t, count: 7 }));
}

// ─── Search Results ───

const SEARCH_CORPUS: SearchResult[] = [
  {
    type: 'verse',
    surah: 1,
    surah_name: 'Al-Fatiha',
    ayah: 1,
    text_ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    translator_slug: 'sahih',
    rank: 0,
    label: 'VERSE',
    snippet: 'In the name of Allah, the <mark>Entirely Merciful</mark>, the Especially Merciful.',
  },
  {
    type: 'verse',
    surah: 1,
    surah_name: 'Al-Fatiha',
    ayah: 2,
    text_ar: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
    text: '[All] praise is [due] to Allah, Lord of the worlds —',
    translator_slug: 'sahih',
    rank: 0,
    label: 'VERSE',
    snippet: '[All] <mark>praise</mark> is [due] to Allah, Lord of the worlds —',
  },
  {
    type: 'verse',
    surah: 2,
    surah_name: 'Al-Baqarah',
    ayah: 255,
    text_ar: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...',
    text: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence...',
    translator_slug: 'sahih',
    rank: 0,
    label: 'VERSE',
    snippet: 'Allah - there is no deity except Him, the <mark>Ever-Living</mark>, the Sustainer...',
  },
  {
    type: 'verse',
    surah: 55,
    surah_name: 'Ar-Rahman',
    ayah: 1,
    text_ar: 'الرَّحْمَٰنُ',
    text: 'The Most Merciful,',
    translator_slug: 'sahih',
    rank: 0,
    label: 'VERSE',
    snippet: 'The Most <mark>Merciful</mark>,',
  },
  {
    type: 'verse',
    surah: 112,
    surah_name: 'Al-Ikhlas',
    ayah: 1,
    text_ar: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
    text: 'Say, "He is Allah, [who is] One,',
    translator_slug: 'sahih',
    rank: 0,
    label: 'VERSE',
    snippet: 'Say, "He is Allah, [who is] <mark>One</mark>,',
  },
];

export function mockSearchKeyword(query: string, lang: string = 'en'): SearchResult[] {
  const q = query.toLowerCase();
  const results = SEARCH_CORPUS.filter((r) =>
    r.text.toLowerCase().includes(q) ||
    r.text_ar.includes(q) ||
    r.surah_name.toLowerCase().includes(q)
  );
  if (results.length === 0) {
    // Return generic results for any query so UI isn't empty
    return SEARCH_CORPUS.slice(0, 3).map((r, i) => ({
      ...r,
      text: lang === 'bn' ? `আয়াত (মক অনুসন্ধান ফলাফল ${i + 1})` : r.text,
    }));
  }
  return results;
}

export function mockSearchReference(surah: number, ayah: number, lang: string = 'en'): SearchResult[] {
  const s = MOCK_SURAHS.find((s) => s.id === surah);
  if (!s) return [];
  return [{
    type: 'ref',
    surah,
    surah_name: lang === 'bn' ? s.name_bn : s.name_en,
    ayah,
    text_ar: `بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — آية ${ayah}`,
    text: `Reference ${surah}:${ayah} (mock data)`,
    translator_slug: lang === 'ar' ? 'arabic' : 'sahih',
    rank: 0,
    label: 'REF',
    snippet: `Reference ${surah}:${ayah}`,
  }];
}

export function mockMatchSurahName(query: string, lang: string = 'en'): Surah | null {
  const q = query.toLowerCase();
  return MOCK_SURAHS.find((s) =>
    s.name_en.toLowerCase().includes(q) ||
    s.name_bn.toLowerCase().includes(q) ||
    s.name_ar.includes(q)
  ) ?? null;
}
