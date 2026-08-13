import Dexie, { type Table } from "dexie";
import type { AllSetRecord, SetsCacheRecord, WantListEntry } from "./types";

export class WantListDB extends Dexie {
  all_sets!: Table<AllSetRecord, string>;
  sets_cache!: Table<SetsCacheRecord, string>;
  want_list!: Table<WantListEntry, number>;

  constructor() {
    super("mtg-want-list");
    this.version(1).stores({
      all_sets: "code, released_at, set_type",
      sets_cache: "code, fetched_at",
      want_list: "++id, name, set_code, rarity",
    });
  }
}

export const db = new WantListDB();
