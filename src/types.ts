export type Rarity = "common" | "uncommon" | "rare" | "mythic" | string;

export interface AllSetRecord {
  code: string;
  name: string;
  set_type: string;
  released_at: string | null;
}

export interface CachedCard {
  name: string;
  rarity: Rarity;
  collector_number: string;
  image_uri: string | null;
  colors: string[];
  type_line: string;
}

export interface SetsCacheRecord {
  code: string;
  name: string;
  cards: CachedCard[];
  fetched_at: string;
}

export interface WantListEntry {
  id?: number;
  name: string;
  set_code: string | null;
  rarity: Rarity | null;
  quantity: number;
  added_at: string;
}
