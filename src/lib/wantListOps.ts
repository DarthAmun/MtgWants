import { db } from "../db";
import type { Rarity } from "../types";

export interface AddEntryInput {
  name: string;
  set_code: string | null;
  rarity: Rarity | null;
  quantity: number;
}

/**
 * Adds entries to the want list, merging quantity into an existing row when
 * one already matches on name + set_code + rarity rather than duplicating it.
 */
export async function addToWantList(entries: AddEntryInput[]): Promise<void> {
  await db.transaction("rw", db.want_list, async () => {
    for (const entry of entries) {
      const existing = await db.want_list
        .where("name")
        .equals(entry.name)
        .filter((row) => row.set_code === entry.set_code && row.rarity === entry.rarity)
        .first();

      if (existing) {
        await db.want_list.update(existing.id!, {
          quantity: existing.quantity + entry.quantity,
        });
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
