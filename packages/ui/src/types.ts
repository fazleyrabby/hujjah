// Shared types used across packages/ui components.
// These mirror the types in lib/chain-db.ts — keep in sync.

export interface NarratorNode {
  id: number;
  name_ar: string;
  name_en?: string | null;
  name_bn?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  tabaqah?: number | null;
  reliability?: string | null;
  city?: string | null;
  data_source?: string | null;
  _hasDuplicates?: boolean; // indicates same name exists with different ID
}

export interface NarratorEdge {
  from_narrator_id: number;
  from_name: string;
  from_name_en?: string | null;
  from_name_bn?: string | null;
  to_narrator_id: number;
  to_name: string;
  to_name_en?: string | null;
  to_name_bn?: string | null;
  hadith_count: number;
}
