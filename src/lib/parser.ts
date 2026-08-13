export interface ParsedLine {
  name: string;
  quantity: number;
}

const QUANTITY_PREFIX = /^(\d+)\s*x?\s+/i;
// Trailing "(SET)" or "(SET) 123" / "(SET) 123a" style collector-number annotations.
const SET_SUFFIX = /\s*\([A-Za-z0-9]{2,6}\)\s*[A-Za-z0-9]*\s*$/;
// Common non-card lines some export formats insert as section headers.
const HEADER_LINES = new Set([
  "commander",
  "sideboard",
  "deck",
  "maybeboard",
  "mainboard",
  "main deck",
  "companion",
  "lands",
  "creatures",
  "instants",
  "sorceries",
  "artifacts",
  "enchantments",
  "planeswalkers",
  "battles",
  "other",
]);

export function parseWantList(text: string): ParsedLine[] {
  const results: ParsedLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("//") || line.startsWith("#")) continue;
    if (HEADER_LINES.has(line.toLowerCase().replace(/:$/, ""))) continue;

    let working = line;
    let quantity = 1;

    const qtyMatch = working.match(QUANTITY_PREFIX);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      working = working.slice(qtyMatch[0].length);
    }

    working = working.replace(SET_SUFFIX, "").trim();

    if (working === "") continue;

    results.push({ name: working, quantity });
  }

  return results;
}
