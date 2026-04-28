export interface Reciter {
  id: string;
  name: string;
  /** Path segment on verses.quran.com — null if not available */
  versesQuranPath: string | null;
  /** Identifier on cdn.islamic.network — null if not available */
  islamicNetworkId: string | null;
  /** Folder name on everyayah.com */
  everyayahFolder: string | null;
}

export const RECITERS: Reciter[] = [
  {
    id: 'alafasy',
    name: 'Mishary Alafasy',
    versesQuranPath: 'Alafasy',
    islamicNetworkId: 'ar.alafasy',
    everyayahFolder: 'Alafasy_128kbps',
  },
  {
    id: 'husary',
    name: 'Mahmoud Al-Husary',
    versesQuranPath: null,
    islamicNetworkId: 'ar.husary',
    everyayahFolder: 'Husary_128kbps',
  },
  {
    id: 'minshawi',
    name: 'Mohamed Minshawi',
    versesQuranPath: null,
    islamicNetworkId: 'ar.minshawi',
    everyayahFolder: 'Minshawy_128kbps',
  },
  {
    id: 'ayyoub',
    name: 'Muhammad Ayyoub',
    versesQuranPath: null,
    islamicNetworkId: 'ar.muhammadayyoub',
    everyayahFolder: null,
  },
  {
    id: 'shaatree',
    name: 'Abu Bakr Ash-Shaatree',
    versesQuranPath: null,
    islamicNetworkId: 'ar.shaatree',
    everyayahFolder: null,
  },
  {
    id: 'mahermuaiqly',
    name: 'Maher Al-Muaiqly',
    versesQuranPath: null,
    islamicNetworkId: 'ar.mahermuaiqly',
    everyayahFolder: 'Maher_Al_Muaiqly_128kbps',
  },
];

export const DEFAULT_RECITER_ID = 'alafasy';

export function findReciter(id: string): Reciter {
  return RECITERS.find(r => r.id === id) ?? RECITERS[0];
}
