export const RARITY_ORDER = ["mythic", "rare", "uncommon", "common"] as const;

export const RARITY_LABEL: Record<string, string> = {
  mythic: "Mythic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};

export function rarityRank(rarity: string | null): number {
  if (rarity === null) return RARITY_ORDER.length;
  const idx = RARITY_ORDER.indexOf(rarity as (typeof RARITY_ORDER)[number]);
  return idx === -1 ? RARITY_ORDER.length : idx;
}

export function rarityLabel(rarity: string | null): string {
  if (rarity === null) return "Unknown";
  return RARITY_LABEL[rarity] ?? rarity;
}
