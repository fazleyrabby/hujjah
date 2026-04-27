/**
 * lib/mocks/ai-responses.ts
 *
 * Mock AI responses for Next.js-only testing.
 * No LLM inference required. Completely safe — read-only static data.
 */

import type { VerseContext, HadithContext } from '@/lib/ai/explain';

interface MockAIResponse {
  explanation: string;
  verses: VerseContext[];
  hadith: HadithContext[];
}

const MOCK_VERSES: VerseContext[] = [
  {
    surah: 1,
    ayah: 1,
    text_ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    translator_slug: 'sahih',
  },
  {
    surah: 2,
    ayah: 255,
    text_ar: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...',
    text: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence. Neither drowsiness overtakes Him nor sleep...',
    translator_slug: 'sahih',
  },
  {
    surah: 55,
    ayah: 1,
    text_ar: 'الرَّحْمَٰنُ',
    text: 'The Most Merciful,',
    translator_slug: 'sahih',
  },
  {
    surah: 112,
    ayah: 1,
    text_ar: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
    text: 'Say, "He is Allah, [who is] One,',
    translator_slug: 'sahih',
  },
];

const MOCK_HADITH: HadithContext[] = [
  {
    id: 1,
    book_name_ar: 'صحيح البخاري',
    book_name_en: 'Sahih al-Bukhari',
    num_in_book: 1,
    matn_ar: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ...',
    matn_en: 'Actions are judged by intentions...',
    sanad_length: 2,
  },
  {
    id: 2,
    book_name_ar: 'صحيح مسلم',
    book_name_en: 'Sahih Muslim',
    num_in_book: 1,
    matn_ar: 'بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ...',
    matn_en: 'Islam is built upon five pillars...',
    sanad_length: 3,
  },
];

const RESPONSES_EN: Record<string, string> = {
  mercy: `Allah's mercy is one of the most beautiful and recurring themes in the Quran. Surah Ar-Rahman (The Most Merciful) begins with the very name of Allah that signifies His boundless compassion and grace toward all creation.

The opening verse "Ar-Rahman" (55:1) reminds us that mercy is Allah's foremost attribute — it precedes His wrath, encompasses everything, and is the reason we exist. As the Prophet (peace be upon him) taught us, Allah's mercy prevails over His anger.

Interestingly, the Quran tells us in 2:255 (Ayat al-Kursi) that Allah is "Al-Hayyul Qayyum" — the Ever-Living, the Sustainer. His mercy isn't passive; it's actively sustaining every atom in existence. What's beautiful here is that even when we sin, His mercy gives us the chance to repent and return to Him.

Practically, this means we should never despair of Allah's mercy, no matter how far we've strayed. The door of tawbah is always open until our final breath.`,

  prayer: `Prayer (Salah) is the cornerstone of a Muslim's daily life and the first thing we will be asked about on the Day of Judgment.

The Quran beautifully connects prayer to spiritual ascension. In the hadith from Sunan an-Nasa'i, the Prophet (peace be upon him) described prayer as "the ascension of the believer" — it's our personal conversation with Allah, five times a day.

Surah Al-Fatiha (1:1-7), which we recite in every unit of prayer, is essentially a complete framework for our relationship with Allah: we begin with praise, acknowledge His sovereignty, seek His guidance, and ask to be kept on the straight path.

You might notice that prayer isn't just about ritual — it's about mindfulness. When we say "It is You we worship and You we ask for help" (1:5), we're realigning our entire life's purpose. The Prophet said whoever guards their prayer guards their religion.

Practically, establishing prayer with khushu' (focus) transforms our day into a series of spiritual reboots, keeping us connected to our Creator amidst life's chaos.`,

  tawbah: `Tawbah (repentance) is one of the most liberating concepts in Islam. It means returning to Allah with sincere remorse, abandoning the sin, and resolving never to return to it.

The Quran repeatedly assures us that Allah loves those who repent. In fact, the Prophet (peace be upon him) told us that if we didn't sin, Allah would remove us and bring people who would sin and then seek His forgiveness — because He loves to forgive.

What's beautiful here is that tawbah isn't just about saying "I'm sorry" — it's about transformation. The Arabic root "ta-ba" implies turning back, like a traveler who realizes they've gone astray and immediately turns toward their destination.

Practically, never let Shaytan make you feel that your sins are too great for Allah's mercy. The door of repentance is open until the soul reaches the throat. Make tawbah a daily habit, not just for major sins but for shortcomings in your worship and character.`,

  patience: `Sabr (patience) is mentioned throughout the Quran as a virtue that brings immense reward. Allah says in multiple places that He is with those who are patient.

Patience in Islam isn't passive suffering — it's active perseverance with faith and good deeds despite difficulties. There are three types: patience in obeying Allah, patience in avoiding sins, and patience during calamities.

The Prophet (peace be upon him) said: "How wonderful is the affair of the believer! For all of his affairs are good. If something good happens to him, he is grateful, and that is good for him. If something bad happens to him, he is patient, and that is good for him." (Sahih Muslim)

You might notice that sabr transforms hardship into worship. When we respond to trials with patience instead of complaining, we're actually earning reward while others merely suffer. This is the secret wisdom behind the verse "Indeed, the patient will be given their reward without account" (39:10).

Practically, when facing difficulty, remind yourself that this is temporary, that Allah has a plan, and that every moment of patience is being recorded as an act of worship.`,

  default: `Thank you for your question! Based on the Quran and Sunnah, here are some relevant insights:

The Quran begins with Surah Al-Fatiha, which establishes the foundation of our faith: recognizing Allah as the Lord of all worlds, the Most Merciful, and the Master of the Day of Judgment. When we say "It is You we worship and You we ask for help" (1:5), we're affirming our complete dependence on Him.

Ayat al-Kursi (2:255) is one of the most powerful verses describing Allah's attributes — He is the Ever-Living, the Sustainer, and nothing happens without His knowledge and permission.

The hadith of intentions (Sahih al-Bukhari) reminds us that actions are judged by intentions. This means sincerity is the foundation of all worship and good deeds.

For your specific question, I recommend exploring these topics through the search feature to find more detailed verses and hadith on this subject.`,
};

const RESPONSES_BN: Record<string, string> = {
  mercy: `আল্লাহর রহমত কুরআনের সবচেয়ে সুন্দর ও বারবার আসা বিষয়গুলোর একটি। সূরা আর-রাহমান (সর্বাধিক দয়ালু) তাঁর নাম দিয়েই শুরু হয় যা তাঁর সীমাহীন করুণা ও অনুগ্রহকে বোঝায়।

"আর-রাহমান" (৫৫:১) আমাদের মনে করিয়ে দেয় যে রহমত আল্লাহর সর্বোচ্চ গুণ — এটি তাঁর গজবের আগে আসে, সবকিছুকে ঘিরে রাখে, এবং আমাদের অস্তিত্বের কারণ। নবী (সা:) আমাদের শিখিয়েছেন যে আল্লাহর রহমত তাঁর গজবের উপর প্রাধান্য পায়।

২:২৫৫ (আয়াতুল কুরসি) আমাদের বলে যে আল্লাহ "আল-হাইয়্যুল কাইয়্যূম" — চিরঞ্জীব, সবকিছুর ধারক। তাঁর রহমত নিষ্ক্রিয় নয়; এটি প্রতিটি পরমাণুকে সক্রিয়ভাবে ধারণ করছে। সবচেয়ে সুন্দর বিষয় হলো, এমনকি যখন আমরা পাপ করি, তাঁর রহমত আমাদের তাওবাহ করার এবং তাঁর দিকে ফিরে আসার সুযোগ দেয়।

ব্যবহারিকভাবে, এর মানে হলো আমাদের কখনো আল্লাহর রহমত থেকে নিরাশ হওয়া উচিত নয়, যত দূরেই চলে যাই না কেন। তাওবাহর দরজা শেষ নিঃশ্বাস পর্যন্ত খোলা থাকে।`,

  prayer: `সালাত (নামাজ) একজন মুসলিমের দৈনন্দিন জীবনের ভিত্তি এবং কিয়ামতের দিনে সর্বপ্রথম যে বিষয়ে জিজ্ঞাসা করা হবে।

কুরআন সুন্দরভাবে নামাজকে আধ্যাত্মিক উন্নয়নের সাথে সংযুক্ত করেছে। সুনান আন-নাসায়ীর হাদিসে নবী (সা:) নামাজকে "মুমিনের মেরাজ" বলে বর্ণনা করেছেন — এটি আল্লাহর সাথে আমাদের ব্যক্তিগত কথোপকথন, দিনে পাঁচবার।

সূরা আল-ফাতিহা (১:১-৭), যা আমরা প্রতি রাকাতে পড়ি, মূলত আল্লাহর সাথে আমাদের সম্পর্কের একটি সম্পূর্ণ কাঠামো: প্রশংসা দিয়ে শুরু, তাঁর সার্বভৌমত্ব স্বীকার, তাঁর পথনির্দেশনা চাওয়া, এবং সরল পথে থাকতে চাওয়া।

নবী বলেছেন যে যে নামাজকে যত্ন করে সে তার ধর্মকে যত্ন করে। ব্যবহারিকভাবে, খুশু' (মনোযোগ) সহকারে নামাজ আদায় করা আমাদের দিনকে আধ্যাত্মিক রিবুটের একটি সিরিজে রূপান্তরিত করে, জীবনের ব্যস্ততার মাঝে সৃষ্টিকর্তার সাথে সংযুক্ত রাখে।`,

  default: `আপনার প্রশ্নের জন্য ধন্যবাদ! কুরআন ও সুন্নাহর আলোকে এখানে কিছু প্রাসঙ্গিক তথ্য:

কুরআন সূরা আল-ফাতিহা দিয়ে শুরু হয়, যা আমাদের বিশ্বাসের ভিত্তি স্থাপন করে: আল্লাহকে সমস্ত জগতের প্রতিপালক, সর্বাধিক দয়ালু, এবং বিচার দিনের মালিক হিসেবে স্বীকার করা। যখন আমরা বলি "আমরা একমাত্র তোমারই ইবাদত করি এবং একমাত্র তোমারই সাহায্য প্রার্থনা করি" (১:৫), তখন আমরা তাঁর প্রতি আমাদের পূর্ণ নির্ভরশীলতা স্বীকার করছি।

আয়াতুল কুরসি (২:২৫৫) আল্লাহর গুণাবলী বর্ণনা করার সবচেয়ে শক্তিশালী আয়াতগুলোর একটি — তিনি চিরঞ্জীব, সবকিছুর ধারক, এবং তাঁর জ্ঞান ও অনুমতি ছাড়া কিছুই ঘটে না।

নিয়তের হাদিস (সহীহ আল-বুখারী) আমাদের মনে করিয়ে দেয় যে কাজগুলো নিয়ত অনুযায়ী বিচার করা হয়। এর অর্থ হলো নিস্কলুষতা সমস্ত ইবাদত ও সৎকর্মের ভিত্তি।

আপনার নির্দিষ্ট প্রশ্নের জন্য, আমি অনুসন্ধান ফিচার ব্যবহার করে এই বিষয়ে আরও বিস্তারিত আয়াত ও হাদিস খুঁজে দেখার পরামর্শ দিচ্ছি।`,
};

function pickResponse(query: string, lang: string): string {
  const q = query.toLowerCase();
  const responses = lang === 'bn' ? RESPONSES_BN : RESPONSES_EN;

  if (q.includes('mercy') || q.includes('rahman') || q.includes('رح') || q.includes('রহমত')) {
    return responses.mercy;
  }
  if (q.includes('prayer') || q.includes('salah') || q.includes('salat') || q.includes('صلا') || q.includes('নামাজ')) {
    return responses.prayer;
  }
  if (q.includes('repent') || q.includes('tauba') || q.includes('tawbah') || q.includes('توب') || q.includes('তাওবা')) {
    return responses.tawbah;
  }
  if (q.includes('patience') || q.includes('sabr') || q.includes('صبر') || q.includes('ধৈর্য')) {
    return responses.patience;
  }
  return responses.default;
}

export function mockExplainQuery(query: string, lang: string = 'en'): MockAIResponse {
  return {
    explanation: pickResponse(query, lang),
    verses: MOCK_VERSES.slice(0, 3),
    hadith: MOCK_HADITH.slice(0, 1),
  };
}

export function mockChatResponse(query: string, lang: string = 'en'): MockAIResponse {
  // Same as explain but can be extended for conversational mock responses
  return mockExplainQuery(query, lang);
}

export function mockGenerateStream(query: string, lang: string = 'en'): string {
  const response = pickResponse(query, lang);
  // Simulate streaming by returning chunks — for mock purposes we just return the full text
  // In a real stream mock, this would be an async generator
  return response;
}
