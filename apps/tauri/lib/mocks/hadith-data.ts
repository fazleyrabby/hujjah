/**
 * lib/mocks/hadith-data.ts
 *
 * Realistic mock Hadith data for Next.js-only testing.
 * No DB connection required. Completely safe — read-only static data.
 */

import type { HadithResult, HadithBook } from '@/lib/hadith-db';

export const MOCK_HADITH_BOOKS: HadithBook[] = [
  { id: 1, name_ar: 'صحيح البخاري', name_en: 'Sahih al-Bukhari', hadith_count: 7563 },
  { id: 2, name_ar: 'صحيح مسلم', name_en: 'Sahih Muslim', hadith_count: 7453 },
  { id: 3, name_ar: 'سنن النسائي', name_en: 'Sunan an-Nasa\'i', hadith_count: 5760 },
  { id: 4, name_ar: 'سنن أبي داود', name_en: 'Sunan Abi Dawud', hadith_count: 5274 },
  { id: 5, name_ar: 'جامع الترمذي', name_en: 'Jami\' at-Tirmidhi', hadith_count: 3956 },
];

const MOCK_HADITHS: HadithResult[] = [
  {
    id: 1,
    book_id: 1,
    book_name_ar: 'صحيح البخاري',
    book_name_en: 'Sahih al-Bukhari',
    num_in_book: 1,
    hadith_ar: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ...',
    matn_ar: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى، فَمَنْ كَانَتْ هِجْرَتُهُ إِلَى اللَّهِ وَرَسُولِهِ، فَهِجْرَتُهُ إِلَى اللَّهِ وَرَسُولِهِ، وَمَنْ كَانَتْ هِجْرَتُهُ لِدُنْيَا يُصِيبُهَا أَوِ امْرَأَةٍ يَتَزَوَّجُهَا، فَهِجْرَتُهُ إِلَى مَا هَاجَرَ إِلَيْهِ.',
    matn_en: 'The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended. So whoever emigrated for worldly benefits or for a woman to marry, his emigration was for what he emigrated for.',
    sanad_length: 2,
    rank: 0,
  },
  {
    id: 2,
    book_id: 2,
    book_name_ar: 'صحيح مسلم',
    book_name_en: 'Sahih Muslim',
    num_in_book: 1,
    hadith_ar: 'بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ...',
    matn_ar: 'بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَإِقَامِ الصَّلَاةِ، وَإِيتَاءِ الزَّكَاةِ، وَالْحَجِّ، وَصَوْمِ رَمَضَانَ.',
    matn_en: 'Islam is built upon five: testifying that there is no god but Allah and Muhammad is the Messenger of Allah, establishing prayer, giving zakat, fasting Ramadan, and performing Hajj.',
    sanad_length: 3,
    rank: 0,
  },
  {
    id: 3,
    book_id: 1,
    book_name_ar: 'صحيح البخاري',
    book_name_en: 'Sahih al-Bukhari',
    num_in_book: 47,
    hadith_ar: 'الدِّينُ النَّصِيحَةُ...',
    matn_ar: 'قُلْنَا: يَا رَسُولَ اللَّهِ، لِمَنْ؟ قَالَ: لِلَّهِ وَلِكِتَابِهِ وَلِرَسُولِهِ وَلِأَئِمَّةِ الْمُسْلِمِينَ وَعَامَّتِهِمْ.',
    matn_en: 'The Prophet (peace be upon him) said: "Religion is sincerity." We said: "To whom?" He said: "To Allah, His Book, His Messenger, the leaders of the Muslims, and their common folk."',
    sanad_length: 3,
    rank: 0,
  },
  {
    id: 4,
    book_id: 5,
    book_name_ar: 'جامع الترمذي',
    book_name_en: "Jami' at-Tirmidhi",
    num_in_book: 2516,
    hadith_ar: 'الرَّاحِمُونَ يَرْحَمُهُمُ الرَّحْمَٰنُ...',
    matn_ar: 'الرَّاحِمُونَ يَرْحَمُهُمُ الرَّحْمَٰنُ، ارْحَمُوا مَنْ فِي الْأَرْضِ يَرْحَمْكُمْ مَنْ فِي السَّمَاءِ.',
    matn_en: 'Those who are merciful will be shown mercy by the Most Merciful. Be merciful to those on the earth and the One above the heavens will have mercy upon you.',
    sanad_length: 4,
    rank: 0,
  },
  {
    id: 5,
    book_id: 1,
    book_name_ar: 'صحيح البخاري',
    book_name_en: 'Sahih al-Bukhari',
    num_in_book: 276,
    hadith_ar: 'مَنْ أَحْيَا سُنَّتِي فَقَدْ أَحَبَّنِي...',
    matn_ar: 'مَنْ أَحْيَا سُنَّتِي فَقَدْ أَحَبَّنِي، وَمَنْ أَحَبَّنِي كَانَ مَعِي فِي الْجَنَّةِ.',
    matn_en: 'Whoever revives my Sunnah has loved me, and whoever loves me will be with me in Paradise.',
    sanad_length: 3,
    rank: 0,
  },
  {
    id: 6,
    book_id: 2,
    book_name_ar: 'صحيح مسلم',
    book_name_en: 'Sahih Muslim',
    num_in_book: 2704,
    hadith_ar: 'مَنْ يُرِدِ اللَّهُ بِهِ خَيْرًا يُفَقِّهْهُ فِي الدِّينِ...',
    matn_ar: 'مَنْ يُرِدِ اللَّهُ بِهِ خَيْرًا يُفَقِّهْهُ فِي الدِّينِ، وَإِنَّمَا أَنَا قَاسِمٌ وَاللَّهُ يُعْطِي.',
    matn_en: 'When Allah wishes good for someone, He bestows upon him the understanding of the religion. I am but a distributor, and Allah gives.',
    sanad_length: 2,
    rank: 0,
  },
  {
    id: 7,
    book_id: 4,
    book_name_ar: 'سنن أبي داود',
    book_name_en: "Sunan Abi Dawud",
    num_in_book: 4806,
    hadith_ar: 'الْعَبْدُ الصَّالِحُ يَتْرُكُ الدُّنْيَا قَبْلَ أَنْ تَتْرُكَهُ...',
    matn_ar: 'الْعَبْدُ الصَّالِحُ يَتْرُكُ الدُّنْيَا قَبْلَ أَنْ تَتْرُكَهُ، فَيَجْعَلُ لَهُ مِنْهَا مَا يُقِيتُهُ، وَيَتْرُكُ لَهُ مَا يَبْلُغُ بِهِ آخِرَتَهُ.',
    matn_en: 'The righteous servant leaves the world before it leaves him, taking from it only what sustains him and leaving what reaches him in the Hereafter.',
    sanad_length: 5,
    rank: 0,
  },
  {
    id: 8,
    book_id: 3,
    book_name_ar: 'سنن النسائي',
    book_name_en: "Sunan an-Nasa'i",
    num_in_book: 1578,
    hadith_ar: 'الصَّلَاةُ مِعْرَاجُ الْمُؤْمِنِينَ...',
    matn_ar: 'الصَّلَاةُ مِعْرَاجُ الْمُؤْمِنِينَ، فَمَنْ حَافَظَ عَلَيْهَا حَافَظَ عَلَى دِينِهِ، وَمَنْ تَرَكَهَا تَرَكَ دِينَهُ.',
    matn_en: 'Prayer is the ascension of the believer. Whoever guards it guards his religion, and whoever leaves it leaves his religion.',
    sanad_length: 4,
    rank: 0,
  },
  {
    id: 9,
    book_id: 1,
    book_name_ar: 'صحيح البخاري',
    book_name_en: 'Sahih al-Bukhari',
    num_in_book: 6119,
    hadith_ar: 'إِنَّ اللَّهَ لَا يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ...',
    matn_ar: 'إِنَّ اللَّهَ لَا يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ، وَلَكِنْ يَنْظُرُ إِلَى قُلُوبِكُمْ وَأَعْمَالِكُمْ.',
    matn_en: 'Indeed, Allah does not look at your forms or your wealth, but He looks at your hearts and your deeds.',
    sanad_length: 2,
    rank: 0,
  },
  {
    id: 10,
    book_id: 5,
    book_name_ar: 'جامع الترمذي',
    book_name_en: "Jami' at-Tirmidhi",
    num_in_book: 3470,
    hadith_ar: 'مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ...',
    matn_ar: 'مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ، وَمَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيُكْرِمْ جَارَهُ، وَمَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيُكْرِمْ ضَيْفَهُ.',
    matn_en: 'Whoever believes in Allah and the Last Day, let him speak good or remain silent. Whoever believes in Allah and the Last Day, let him honor his neighbor. Whoever believes in Allah and the Last Day, let him honor his guest.',
    sanad_length: 3,
    rank: 0,
  },
  {
    id: 11,
    book_id: 2,
    book_name_ar: 'صحيح مسلم',
    book_name_en: 'Sahih Muslim',
    num_in_book: 2577,
    hadith_ar: 'الْمُسْلِمُ أَخُو الْمُسْلِمِ...',
    matn_ar: 'الْمُسْلِمُ أَخُو الْمُسْلِمِ، لَا يَظْلِمُهُ وَلَا يُسْلِمُهُ، وَمَنْ كَانَ فِي حَاجَةِ أَخِيهِ كَانَ اللَّهُ فِي حَاجَتِهِ.',
    matn_en: 'A Muslim is the brother of a Muslim. He neither oppresses him nor humiliates him. Whoever fulfills the needs of his brother, Allah will fulfill his needs.',
    sanad_length: 3,
    rank: 0,
  },
  {
    id: 12,
    book_id: 1,
    book_name_ar: 'صحيح البخاري',
    book_name_en: 'Sahih al-Bukhari',
    num_in_book: 1377,
    hadith_ar: 'مَنْ لَا يَرْحَمِ النَّاسَ لَا يَرْحَمْهُ اللَّهُ...',
    matn_ar: 'مَنْ لَا يَرْحَمِ النَّاسَ لَا يَرْحَمْهُ اللَّهُ.',
    matn_en: 'Whoever does not show mercy to the people, Allah will not show mercy to him.',
    sanad_length: 2,
    rank: 0,
  },
  {
    id: 13,
    book_id: 3,
    book_name_ar: 'سنن النسائي',
    book_name_en: "Sunan an-Nasa'i",
    num_in_book: 1303,
    hadith_ar: 'الطَّهُورُ شَطْرُ الْإِيمَانِ...',
    matn_ar: 'الطَّهُورُ شَطْرُ الْإِيمَانِ، وَالْحَمْدُ لِلَّهِ تَمْلَأُ الْمِيزَانَ، وَسُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ تَمْلَآنِ أَوْ تَمْلَأُ مَا بَيْنَ السَّمَاوَاتِ وَالْأَرْضِ.',
    matn_en: 'Cleanliness is half of faith. Alhamdulillah fills the scale. SubhanAllah and Alhamdulillah fill or fill what is between the heavens and the earth.',
    sanad_length: 4,
    rank: 0,
  },
  {
    id: 14,
    book_id: 5,
    book_name_ar: 'جامع الترمذي',
    book_name_en: "Jami' at-Tirmidhi",
    num_in_book: 1978,
    hadith_ar: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ...',
    matn_ar: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ.',
    matn_en: 'The best among you are those who learn the Quran and teach it.',
    sanad_length: 3,
    rank: 0,
  },
  {
    id: 15,
    book_id: 4,
    book_name_ar: 'سنن أبي داود',
    book_name_en: "Sunan Abi Dawud",
    num_in_book: 4607,
    hadith_ar: 'الْمَرْءُ مَعَ مَنْ أَحَبَّ...',
    matn_ar: 'الْمَرْءُ مَعَ مَنْ أَحَبَّ.',
    matn_en: 'A person is with whom he loves.',
    sanad_length: 4,
    rank: 0,
  },
];

export function mockGetRandomHadiths(limit: number = 15, lang: string = 'en'): HadithResult[] {
  // Deterministic shuffle based on limit so it's consistent
  const shuffled = [...MOCK_HADITHS].sort((a, b) => (a.id * limit) % 7 - (b.id * limit) % 7);
  return shuffled.slice(0, Math.min(limit, shuffled.length)).map((h, i) => ({
    ...h,
    id: h.id + i * 1000, // unique IDs
  }));
}

export function mockSearchHadith(query: string, limit: number = 20, lang: string = 'en'): HadithResult[] {
  const q = query.toLowerCase();
  const results = MOCK_HADITHS.filter((h) =>
    h.matn_en?.toLowerCase().includes(q) ||
    h.matn_ar.includes(q) ||
    h.book_name_en?.toLowerCase().includes(q)
  );
  if (results.length === 0) {
    // Return all for any query so UI isn't empty
    return MOCK_HADITHS.slice(0, Math.min(limit, MOCK_HADITHS.length));
  }
  return results.slice(0, limit);
}

export function mockGetHadithBooks(): HadithBook[] {
  return MOCK_HADITH_BOOKS;
}

export function mockGetHadithStats(): { hadith: number; books: number; narrators: number } {
  return { hadith: 60854, books: 9, narrators: 12700 };
}
