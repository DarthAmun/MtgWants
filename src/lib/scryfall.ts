import type { AllSetRecord, CachedCard } from "../types";

const API_BASE = "https://api.scryfall.com";
const PAGE_DELAY_MS = 100;

interface ScryfallSetObject {
  code: string;
  name: string;
  set_type: string;
  released_at: string | null;
}

interface ScryfallSetsResponse {
  data: ScryfallSetObject[];
}

interface ScryfallImageUris {
  normal?: string;
  small?: string;
  large?: string;
}

interface ScryfallCardFace {
  image_uris?: ScryfallImageUris;
}

interface ScryfallCardObject {
  name: string;
  rarity: string;
  collector_number: string;
  set: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
}

interface ScryfallSearchResponse {
  data: ScryfallCardObject[];
  has_more: boolean;
  next_page?: string;
}

interface ScryfallCollectionResponse {
  data: ScryfallCardObject[];
  not_found: { name?: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractImageUri(card: ScryfallCardObject): string | null {
  if (card.image_uris) {
    return card.image_uris.normal ?? card.image_uris.large ?? card.image_uris.small ?? null;
  }
  if (card.card_faces && card.card_faces.length > 0) {
    const face = card.card_faces[0];
    if (face.image_uris) {
      return face.image_uris.normal ?? face.image_uris.large ?? face.image_uris.small ?? null;
    }
  }
  return null;
}

/** One-time fetch of the full set list. Caller is responsible for caching. */
export async function fetchAllSets(): Promise<AllSetRecord[]> {
  const res = await fetch(`${API_BASE}/sets`);
  if (!res.ok) {
    throw new Error(`Failed to fetch set list: ${res.status} ${res.statusText}`);
  }
  const body: ScryfallSetsResponse = await res.json();
  return body.data.map((s) => ({
    code: s.code,
    name: s.name,
    set_type: s.set_type,
    released_at: s.released_at,
  }));
}

/** Fetch every printing in a set. Caller is responsible for caching the result. */
export async function fetchSetCards(setCode: string): Promise<CachedCard[]> {
  const cards: CachedCard[] = [];
  let url: string | undefined =
    `${API_BASE}/cards/search?q=e:${encodeURIComponent(setCode)}&unique=prints&order=set`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        // Set exists in /sets but has zero searchable printings (rare).
        break;
      }
      throw new Error(`Failed to fetch cards for set ${setCode}: ${res.status} ${res.statusText}`);
    }
    const body: ScryfallSearchResponse = await res.json();
    for (const card of body.data) {
      cards.push({
        name: card.name,
        rarity: card.rarity,
        collector_number: card.collector_number,
        image_uri: extractImageUri(card),
      });
    }
    if (body.has_more && body.next_page) {
      url = body.next_page;
      await sleep(PAGE_DELAY_MS);
    } else {
      url = undefined;
    }
  }

  return cards;
}

export interface ResolvedCollectionCard {
  name: string;
  set_code: string;
  rarity: string;
  image_uri: string | null;
}

/** Batched lookup via /cards/collection. Max 75 identifiers per request. */
export async function resolveCardsByName(
  names: string[],
): Promise<{ resolved: ResolvedCollectionCard[]; notFound: string[] }> {
  const resolved: ResolvedCollectionCard[] = [];
  const notFound: string[] = [];
  const CHUNK_SIZE = 75;

  for (let i = 0; i < names.length; i += CHUNK_SIZE) {
    const chunk = names.slice(i, i + CHUNK_SIZE);
    const res = await fetch(`${API_BASE}/cards/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifiers: chunk.map((name) => ({ name })),
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to resolve card details: ${res.status} ${res.statusText}`);
    }
    const body: ScryfallCollectionResponse = await res.json();
    for (const card of body.data) {
      resolved.push({
        name: card.name,
        set_code: card.set,
        rarity: card.rarity,
        image_uri: extractImageUri(card),
      });
    }
    for (const nf of body.not_found) {
      if (nf.name) notFound.push(nf.name);
    }
    if (i + CHUNK_SIZE < names.length) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return { resolved, notFound };
}
