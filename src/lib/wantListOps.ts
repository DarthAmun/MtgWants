import { db } from "../db";
import type { Rarity, WantListEntry } from "../types";

export interface AddEntryInput {
  name: string;
  set_code: string | null;
  rarity: Rarity | null;
  quantity: number;
}

/**
 * Adds entries to the want list, merging quantity into an existing row when
 * one already matches on card name (case-insensitive) rather than
 * duplicating it. A card is the same "want" regardless of which set or
 * printing it came from — MPCFill export doesn't even carry a set code — so
 * name is the only identity that matters here. The first set_code/rarity a
 * card is seen with sticks (used for grouping in the want list UI); a later
 * add only backfills those fields if the existing row doesn't have them yet.
 */
export async function addToWantList(entries: AddEntryInput[]): Promise<void> {
  await db.transaction("rw", db.want_list, async () => {
    for (const entry of entries) {
      const existing = await db.want_list.where("name").equalsIgnoreCase(entry.name).first();

      if (existing) {
        const patch: Partial<WantListEntry> = { quantity: existing.quantity + entry.quantity };
        if (existing.set_code === null && entry.set_code !== null) {
          patch.set_code = entry.set_code;
          patch.rarity = entry.rarity;
        }
        await db.want_list.update(existing.id!, patch);
      } else {
        await db.want_list.add({
          name: entry.name,
          set_code: entry.set_code,
          rarity: entry.rarity,
          quantity: entry.quantity,
          added_at: new Date().toISOString(),
        });
      }
    }
  });
}

/**
 * Collapses any pre-existing want_list rows that share a name (case-
 * insensitive) into one, summing quantity. Covers data added before the
 * name-only merge above existed, or any other path that bypassed it.
 */
export async function dedupeWantList(): Promise<void> {
  await db.transaction("rw", db.want_list, async () => {
    const all = await db.want_list.toArray();
    const byName = new Map<string, WantListEntry[]>();
    for (const row of all) {
      const key = row.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(row);
    }

    for (const rows of byName.values()) {
      if (rows.length <= 1) continue;
      const quantity = rows.reduce((sum, r) => sum + r.quantity, 0);
      const keeper = rows.find((r) => r.set_code !== null) ?? rows[0];
      const rest = rows.filter((r) => r.id !== keeper.id);
      await db.want_list.update(keeper.id!, { quantity });
      await db.want_list.bulkDelete(rest.map((r) => r.id!));
    }
  });
}
