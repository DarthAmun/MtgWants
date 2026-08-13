# MTG Want List Builder — Spec

## Purpose
A small, offline-first tool for browsing Magic: The Gathering sets, picking cards by rarity, building a persistent "want list," and exporting that list in a format ready to paste into MPCFill for proxy ordering.

## Platform & Stack
- **Type:** Offline-first Progressive Web App (installable, works fully offline after first load of any given set)
- **Runs on:** Linux (any modern browser), no native packaging needed
- **Suggested stack:** Vite + vanilla JS/TS (or a minimal framework if preferred) + Dexie.js for IndexedDB
- **No backend/server** — talks directly to the public Scryfall API from the client, everything else is local

## Core Principle: Minimize Scryfall API Calls
- Every set is fetched from Scryfall **at most once**, ever (unless the user explicitly forces a refresh).
- No per-card API calls at any point — card images come from the same bulk response used to list the set.
- No polling, no background refresh, no calls on app load beyond what the user explicitly triggers.

## Scryfall Endpoints Used
1. **Set list** (populate the set picker)
   `GET https://api.scryfall.com/sets`
   Called once, cached indefinitely. Manual "refresh set list" button re-fetches.

2. **Cards in a set** (when a set is opened for the first time)
   `GET https://api.scryfall.com/cards/search?q=e:<SET_CODE>&unique=prints&order=set`
   Returns name, rarity, collector_number, and `image_uris` (or `card_faces[].image_uris` for double-faced cards) for every printing in the set.
   - Paginate via `has_more` / `next_page` only if a set exceeds 175 cards (rare, e.g. some Secret Lair drops or big Commander sets). Respect a ~100ms delay between paginated requests.
   - Response is cached in full — this single fetch covers rarity filtering AND grid images for that set forever.

No other Scryfall endpoints are needed.

## Data Model (IndexedDB via Dexie)

**Table: `sets_cache`**
| field | type | notes |
|---|---|---|
| code | string (PK) | set code, e.g. "mkm" |
| name | string | display name |
| cards | array | `{ name, rarity, collector_number, image_uri }[]` |
| fetched_at | datetime | for optional "stale — refresh?" hint, no auto-refresh |

**Table: `all_sets`** (from the one-time `/sets` call)
| field | type | notes |
|---|---|---|
| code | string (PK) | |
| name | string | |
| set_type | string | for optional grouping/filtering in the picker |
| released_at | date | for sorting |

**Table: `want_list`**
| field | type | notes |
|---|---|---|
| id | auto | |
| name | string | card name |
| set_code | string \| null | null for entries added via list import that weren't resolved |
| rarity | string \| null | null for entries added via list import that weren't resolved |
| quantity | number | default 1 |
| added_at | datetime | |

## Screens / Flows

### 1. Set Picker
- Multi-select **tag picker**, not a dropdown: type to filter, click a set to add it as a selected tag, click a tag to remove it. Any number of sets can be selected at once.
- This matters because Scryfall sometimes splits what feels like "one set" into multiple set objects (e.g. an Arena-only companion set, a promo/box-topper set, bonus-sheet variants) — selecting several at once lets the full picture be assembled without hunting for each piece separately.
- Backing list populated from `all_sets` (cached), sorted by release date (newest first) in the picker's suggestions.
- Selecting a set (adding its tag):
  - If in `sets_cache` → load instantly, no network call.
  - If not cached → fetch from Scryfall, show loading state, store in `sets_cache`.
- Each selected set is fetched/cached independently — no combined API call, just one call per not-yet-cached set as it's added.

### 2. Set Browser
- Shows cards from **all currently selected set tags** together, grouped into a box per set (newest release first) — same visual pattern as the want list.
- Rarity filter: checkboxes for Common / Uncommon / Rare / Mythic (multi-select), applied client-side, affects all selected sets at once.
- Two view modes:
  - **List view:** card names only, checkbox per card, "Add checked to want list" button with a quantity input (default 1, applied to all checked).
  - **Grid view:** thumbnails using cached `image_uri`, same add-to-list interaction on click/checkbox.
- Optional "select all visible" helper, either per-set or across all selected sets, for bulk-adding a whole rarity tier.

### 3. Want List
- Displayed grouped by **set**, each set as its own card/box.
  - Sets ordered by release date, newest first (using `released_at` from `all_sets`; unresolved import entries with no known set fall into an "Unsorted" box at the end).
- Within each set box, subsections by **rarity** (Mythic, Rare, Uncommon, Common order), separated by a divider line — not separate boxes, just visually split within the set card.
  - Entries with no resolved rarity (unresolved imports) go in an "Unknown" subsection at the bottom of their box.
- Toggle for the whole want list: **list view** (name, quantity, remove) or **grid view** (thumbnail using cached `image_uri`, quantity, remove) — subsections keep the divider line in either mode.
- Quantity editable inline, remove button per entry.
- Running total count of cards, shown per set box and overall.
- Persisted automatically to IndexedDB on every change.

### 4. Import from List
- Text area where the user pastes a decklist from an external source (EDHREC, Moxfield, Archidekt, plain notes, etc.).
- Client-side parser handles common formats, no API call required:
  - `3x Lightning Bolt`, `3 Lightning Bolt`, or just `Lightning Bolt` (defaults to qty 1)
  - Strips trailing set/collector-number annotations some exporters add, e.g. `1 Sol Ring (LTC) 231` → `Sol Ring`, qty 1
  - Skips blank lines and comment lines (`//`, `#`)
  - Skips section headers some sites add (e.g. `Commander`, `Sideboard`) — treated as non-card lines and ignored
- Parsed entries are added straight to the want list with `set_code`/`rarity` left `null` (names are enough, per the core requirement).
- Optional "Resolve details" action: batches all unresolved names into Scryfall's `/cards/collection` endpoint (accepts up to 75 identifiers per request, so a whole import is typically 1 call even for large lists) to fill in `set_code`, `rarity`, and an image for grid view. Manual, opt-in — never triggered automatically.

### 5. Export
- Button: "Export for MPCFill."
- Generates plain text, one line per entry:
  ```
  3x Lightning Bolt
  1x Sol Ring
  2x Counterspell
  ```
- Quantity from the want list; card name only (no set code, matching MPCFill's plain-paste format).
- Download as `.txt` and/or copy-to-clipboard button.

## Non-Goals (for this version)
- No account/sync — single local user, single device.
- No pricing data, no collection tracking (that's MTG Vault's job).
- No automatic cache expiry/refresh — user manually refreshes a set if they want updated data (e.g. after a errata or reprint).

## Suggested Build Order
1. Scaffold PWA (Vite + manifest + service worker for offline shell)
2. Dexie schema (`all_sets`, `sets_cache`, `want_list`)
3. Set picker + one-time `/sets` fetch
4. Set browser: fetch-on-first-open + cache + rarity filter (list view)
5. Add-to-want-list interaction + persistence
6. Want list screen (view/edit/remove)
7. Grid view toggle (reuses cached image URIs, no new calls)
8. Import-from-list (paste parser + optional batched `/cards/collection` resolve)
9. MPCFill export (text generation + download/copy)
