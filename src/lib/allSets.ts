import { db } from "../db";
import { fetchAllSets } from "./scryfall";
import type { AllSetRecord } from "../types";

let inFlight: Promise<AllSetRecord[]> | null = null;

/**
 * Ensures the one-time /sets fetch has happened, then returns all_sets
 * sorted newest-release-first. Safe to call from multiple screens; the
 * network fetch itself only ever runs once per empty cache.
 */
export async function ensureAllSetsLoaded(): Promise<AllSetRecord[]> {
  const existingCount = await db.all_sets.count();
  if (existingCount === 0) {
    if (!inFlight) {
      inFlight = fetchAllSets().then(async (fetched) => {
        await db.all_sets.bulkPut(fetched);
        return fetched;
      });
    }
    await inFlight;
    inFlight = null;
  }
  return sortNewestFirst(await db.all_sets.toArray());
}

export function sortNewestFirst(sets: AllSetRecord[]): AllSetRecord[] {
  return [...sets].sort(
    (a, b) => (Date.parse(b.released_at ?? "") || 0) - (Date.parse(a.released_at ?? "") || 0),
  );
}
