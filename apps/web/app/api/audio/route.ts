import { NextRequest, NextResponse } from 'next/server';
import { findReciter, DEFAULT_RECITER_ID } from '@/lib/reciters';

export const dynamic = 'force-dynamic';

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

// Verse counts per surah (index 0 = surah 1) — used to compute global ayah for islamic.network
const VERSE_COUNTS = [
  7,286,200,176,120,165,206,75,129,109,
  123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,
  34,30,73,54,45,83,182,88,75,85,
  54,53,89,59,37,35,38,29,18,45,
  60,49,62,55,78,96,29,22,24,13,
  14,11,11,18,12,12,30,52,52,44,
  28,28,20,56,40,31,50,40,46,42,
  29,19,36,25,22,17,19,26,30,20,
  15,21,11,8,8,19,5,8,8,11,
  11,8,3,9,5,4,7,3,6,3,
  5,4,5,6,
];

function toGlobalAyah(surah: number, ayah: number): number {
  let global = 0;
  for (let i = 0; i < surah - 1; i++) global += VERSE_COUNTS[i];
  return global + ayah;
}

function buildSourceUrls(reciter: ReturnType<typeof findReciter>, surah: number, ayah: number): string[] {
  const urls: string[] = [];
  const file = `${pad3(surah)}${pad3(ayah)}.mp3`;

  if (reciter.islamicNetworkId) {
    urls.push(`https://cdn.islamic.network/quran/audio/128/${reciter.islamicNetworkId}/${toGlobalAyah(surah, ayah)}.mp3`);
  }
  if (reciter.everyayahFolder) {
    urls.push(`https://everyayah.com/data/${reciter.everyayahFolder}/${file}`);
  }
  if (reciter.versesQuranPath) {
    urls.push(`https://verses.quran.com/${reciter.versesQuranPath}/mp3/${file}`);
  }

  return urls;
}

async function tryFetch(url: string, rangeHeader: string | null, timeoutMs: number = 25000) {
  const headers: HeadersInit = { 'User-Agent': 'Mozilla/5.0' };
  if (rangeHeader) headers['Range'] = rangeHeader;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return res;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const surah = Number(searchParams.get('surah'));
  const ayah = Number(searchParams.get('ayah'));
  const reciterId = searchParams.get('reciter') ?? DEFAULT_RECITER_ID;

  if (!surah || !ayah || surah < 1 || surah > 114 || ayah < 1) {
    return NextResponse.json({ error: 'Invalid surah or ayah' }, { status: 400 });
  }

  const reciter = findReciter(reciterId);
  const sources = buildSourceUrls(reciter, surah, ayah);
  const range = req.headers.get('range');
  const errors: string[] = [];

  for (const url of sources) {
    try {
      const res = await tryFetch(url, range, 8000);

      const headers = new Headers();
      headers.set('Content-Type', 'audio/mpeg');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'public, max-age=86400');
      for (const key of ['content-length', 'content-range']) {
        const val = res.headers.get(key);
        if (val) headers.set(key, val);
      }

      return new NextResponse(res.body, { status: res.status, headers });
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.error('[audio] All sources failed:', errors);
  return NextResponse.json({ error: 'All audio sources failed', details: errors }, { status: 502 });
}
