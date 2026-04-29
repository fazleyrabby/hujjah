export interface Reciter {
  id: string;
  name: string;
  everyayahFolder: string | null;
  islamicNetworkId: string | null;
  versesQuranPath: string | null;
}

export const RECITERS: Reciter[] = [
  {
    id: 'alafasy',
    name: 'Mishary Alafasy',
    everyayahFolder: 'Alafasy_128kbps',
    islamicNetworkId: 'ar.alafasy',
    versesQuranPath: 'Alafasy',
  },
  {
    id: 'husary',
    name: 'Mahmoud Al-Husary',
    everyayahFolder: 'Husary_128kbps',
    islamicNetworkId: 'ar.husary',
    versesQuranPath: null,
  },
  {
    id: 'minshawi',
    name: 'Mohamed Minshawi',
    everyayahFolder: 'Minshawy_128kbps',
    islamicNetworkId: 'ar.minshawi',
    versesQuranPath: null,
  },
  {
    id: 'ayyoub',
    name: 'Muhammad Ayyoub',
    everyayahFolder: null,
    islamicNetworkId: 'ar.muhammadayyoub',
    versesQuranPath: null,
  },
  {
    id: 'shaatree',
    name: 'Abu Bakr Ash-Shaatree',
    everyayahFolder: null,
    islamicNetworkId: 'ar.shaatree',
    versesQuranPath: null,
  },
  {
    id: 'mahermuaiqly',
    name: 'Maher Al-Muaiqly',
    everyayahFolder: 'Maher_Al_Muaiqly_128kbps',
    islamicNetworkId: 'ar.mahermuaiqly',
    versesQuranPath: null,
  },
];

export const DEFAULT_RECITER_ID = 'alafasy';

export function findReciter(id: string): Reciter {
  return RECITERS.find(r => r.id === id) ?? RECITERS[0];
}