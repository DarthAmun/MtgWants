# UI Design Brief — MTG Want List Builder

## What this app is
A small offline-first Progressive Web App for Magic: The Gathering players. It lets you browse card sets, check off cards you want, build a running "want list," and export that list as plain text for [MPCFill](https://mpcfill.com) (a proxy-card printing service). Single user, single device, no accounts, no backend — everything lives in the browser (IndexedDB) and the only network calls are to the public Scryfall API to fetch set/card data.

Full functional spec: `mtg-want-list-spec.md` in this repo, if you want the exhaustive behavioral detail. This brief is about how it **looks and feels**, not what it does.

## Current state
The app works, but the UI was built purely for function — no visual design pass has happened yet. It's plain boxes, default form controls, a single hand-rolled dark theme, and desktop-only layout (no responsive breakpoints at all — it's just flex-wrap holding things together on narrow screens). It's built with vanilla TypeScript (no UI framework) and one hand-written `src/style.css`, so any redesign needs to work as plain HTML/CSS/DOM, not React/Vue components.

Current color tokens (`src/style.css`, `:root`), for reference — feel free to replace entirely:
```css
--bg: #14151a;
--bg-elevated: #1d1f26;
--bg-elevated-2: #262933;
--border: #383c48;
--text: #e8e9ed;
--text-dim: #9498a3;
--accent: #7c9cff;
--accent-text: #0d1020;
--mythic: #d9822b;
--rare: #cbb43a;
--uncommon: #9fb0c3;
--common: #c7c9cf;
--danger: #e0616b;
```
The rarity colors are used as small dots/badges throughout and loosely follow MTG's own rarity color conventions (orange mythic, gold rare, silver uncommon, black/white common) — worth keeping *some* visual link to that convention since MTG players already read those colors instinctively.

## Screens
Three tabs, one visible at a time:

1. **Browse Sets** — a tag-style multi-select set picker (type to search, click to add a set as a chip; multiple sets can be open at once) followed by a "set browser": each selected set renders as its own box, cards inside grouped by rarity, with a list/grid view toggle. Grid view shows real card-art thumbnails (from Scryfall). Checkboxes let you multi-select cards, set a quantity, and bulk-add to the want list.

2. **Want List** — the accumulating list of cards you want, grouped by rarity (Mythic → Rare → Uncommon → Common → Unknown). Each row shows the card name, a small tag for which set it's tracked against, an editable quantity, and a remove button. Same list/grid toggle as Browse Sets, grid view again using card art. This is the most-visited screen once a list is underway.

3. **Import List** — a paste-a-decklist textarea (Moxfield/Archidekt/EDHREC/plain-text formats) that parses card names into the want list, plus an optional "resolve details" step that backfills set/rarity/art via one batched API call.

Plus export actions on the Want List screen: copy-to-clipboard and download-as-.txt for the MPCFill-formatted list.

## What a redesign should prioritize
- **Card-forward visuals.** This is a game about collectible art — grid views with card thumbnails should feel like the main event, not an afterthought bolted onto a form-heavy list UI.
- **Responsive/mobile-friendly.** People will realistically use this on a phone or tablet while at a shop or looking through a binder — right now it's desktop-only in practice.
- **Legible density.** Sets can have 300+ cards and want lists can run into hundreds of entries; the layout needs to stay scannable at that scale (good use of the rarity grouping, sticky headers/toolbars, compact rows, etc.), not just look nice with 5 sample cards.
- **Keep the dark, offline-PWA feel** (or at minimum support dark mode) — this isn't a rebrand of the product, just a real design pass on the existing structure: tag picker, set boxes, rarity grouping, list/grid toggle, quantity editing, checkbox multi-select, export actions.
- **No external CDN dependencies** for fonts/icons/assets if avoidable — the whole point of the app is that it works fully offline after first load, so anything visual needs to be self-hostable/inlined (system fonts, inline SVG icons, etc. are fine).

## Non-goals for this pass
- No new features, no change to data model or flows described above — this is purely visual/layout/interaction polish on what already exists.
- No framework migration — implementation should stay plain TS/DOM + CSS to match the rest of the codebase.
