import type { ScreenHandle } from "../main";
import { db } from "../db";
import { fetchSetCards } from "../lib/scryfall";
import { ensureAllSetsLoaded } from "../lib/allSets";
import { rarityLabel } from "../lib/rarity";
import { escapeHtml } from "../lib/dom";
import { addToWantList } from "../lib/wantListOps";
import type { AllSetRecord, CachedCard, SetsCacheRecord } from "../types";

type ViewMode = "list" | "grid";

interface SetLoadState {
  status: "loading" | "loaded" | "error";
  record?: SetsCacheRecord;
  error?: string;
}

const CANONICAL_RARITIES = ["mythic", "rare", "uncommon", "common"] as const;

export function mountBrowseScreen(container: HTMLElement): ScreenHandle {
  let allSets: AllSetRecord[] = [];
  let allSetsByCode = new Map<string, AllSetRecord>();
  const selected: string[] = [];
  const setData = new Map<string, SetLoadState>();
  const activeRarities = new Set<string>(CANONICAL_RARITIES);
  const checked = new Map<string, Set<string>>();
  let viewMode: ViewMode = "list";
  let query = "";
  let suggestOpen = false;
  let quantity = 1;
  let statusMessage = "";
  let statusIsError = false;
  let loadingAllSets = true;

  container.innerHTML = `<div class="browse-screen"></div>`;
  const root = container.querySelector<HTMLDivElement>(".browse-screen")!;

  function releasedAtMs(code: string): number {
    const rec = allSetsByCode.get(code);
    if (!rec || !rec.released_at) return 0;
    const t = Date.parse(rec.released_at);
    return Number.isNaN(t) ? 0 : t;
  }

  function checkedCount(): number {
    let n = 0;
    for (const s of checked.values()) n += s.size;
    return n;
  }

  function filteredCards(cards: CachedCard[]): CachedCard[] {
    return cards.filter((c) => {
      if (CANONICAL_RARITIES.includes(c.rarity as (typeof CANONICAL_RARITIES)[number])) {
        return activeRarities.has(c.rarity);
      }
      return true; // non-canonical rarities (e.g. "special", "bonus") always shown
    });
  }

  /**
   * Multiple printings of the same card (showcase/borderless/extended-art
   * variants, etc.) share a name — for want-list purposes they're the same
   * slot, so collapse them to one representative + a version count.
   */
  function collapseByName(cards: CachedCard[]): { card: CachedCard; count: number }[] {
    const byName = new Map<string, { card: CachedCard; count: number }>();
    for (const c of cards) {
      const existing = byName.get(c.name);
      if (existing) existing.count += 1;
      else byName.set(c.name, { card: c, count: 1 });
    }
    return [...byName.values()];
  }

  function rarityGroups(cards: CachedCard[]): { rarity: string; items: { card: CachedCard; count: number }[] }[] {
    const filtered = filteredCards(cards);
    const byRarity = new Map<string, CachedCard[]>();
    for (const c of filtered) {
      const bucket = CANONICAL_RARITIES.includes(c.rarity as (typeof CANONICAL_RARITIES)[number])
        ? c.rarity
        : "other";
      if (!byRarity.has(bucket)) byRarity.set(bucket, []);
      byRarity.get(bucket)!.push(c);
    }
    const order = [...CANONICAL_RARITIES, "other"];
    return order
      .filter((r) => byRarity.has(r) && byRarity.get(r)!.length > 0)
      .map((r) => ({ rarity: r, items: collapseByName(byRarity.get(r)!) }));
  }

  function suggestions(): AllSetRecord[] {
    const q = query.trim().toLowerCase();
    return allSets
      .filter((s) => !selected.includes(s.code))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, 30);
  }

  function render() {
    const sortedSelected = [...selected].sort((a, b) => releasedAtMs(b) - releasedAtMs(a));

    root.innerHTML = `
      <section>
        <h2>Set Picker</h2>
        <p class="spec-hint">Search and select one or more sets. Selecting a set fetches it from Scryfall once and caches it forever.</p>
        ${renderTagPicker()}
      </section>

      ${loadingAllSets ? `<p class="status-line">Loading set list…</p>` : ""}

      ${
        selected.length > 0
          ? `
        <section>
          <h2>Set Browser</h2>
          ${renderToolbar()}
          ${statusMessage ? `<p class="status-line ${statusIsError ? "error" : ""}">${escapeHtml(statusMessage)}</p>` : ""}
          <div class="set-boxes">
            ${sortedSelected.map((code) => renderSetBox(code)).join("")}
          </div>
        </section>
      `
          : `<p class="empty-state">Select a set above to start browsing cards.</p>`
      }
    `;
  }

  function renderTagPicker(): string {
    const tags = selected
      .map((code) => {
        const rec = allSetsByCode.get(code);
        const label = rec ? rec.name : code;
        return `<span class="tag" data-code="${escapeHtml(code)}">${escapeHtml(label)}<button type="button" data-action="remove-set" data-code="${escapeHtml(code)}" aria-label="Remove ${escapeHtml(label)}">&times;</button></span>`;
      })
      .join("");

    const sugg = suggestOpen ? suggestions() : [];
    const suggHtml =
      sugg.length > 0
        ? sugg
            .map(
              (s) =>
                `<button type="button" data-action="select-set" data-code="${escapeHtml(s.code)}">
                  <span>${escapeHtml(s.name)} <span class="set-type">(${escapeHtml(s.code)})</span></span>
                  <span class="set-type">${escapeHtml(s.set_type)}${s.released_at ? " · " + s.released_at.slice(0, 4) : ""}</span>
                </button>`,
            )
            .join("")
        : suggestOpen
          ? `<div class="empty">No matching sets</div>`
          : "";

    return `
      <div class="tag-picker">
        <div class="tag-picker-input-row">
          ${tags}
          <input type="text" id="set-search" placeholder="Type to find a set…" value="${escapeHtml(query)}" autocomplete="off" ${loadingAllSets ? "disabled" : ""} />
        </div>
        ${suggOpen(suggHtml)}
      </div>
    `;

    function suggOpen(html: string) {
      return suggestOpen && html ? `<div class="tag-suggestions">${html}</div>` : "";
    }
  }

  function renderToolbar(): string {
    const n = checkedCount();
    return `
      <div class="toolbar">
        <div class="rarity-filter">
          ${CANONICAL_RARITIES.map(
            (r) => `
            <label>
              <input type="checkbox" data-action="toggle-rarity" data-rarity="${r}" ${activeRarities.has(r) ? "checked" : ""} />
              <span class="rarity-dot ${r}"></span>${rarityLabel(r)}
            </label>
          `,
          ).join("")}
        </div>
        <div class="view-toggle">
          <button type="button" data-action="view-list" class="${viewMode === "list" ? "active" : ""}">List</button>
          <button type="button" data-action="view-grid" class="${viewMode === "grid" ? "active" : ""}">Grid</button>
        </div>
        <button type="button" class="btn secondary small" data-action="select-all-visible">Select all visible</button>
        <button type="button" class="btn secondary small" data-action="clear-checked">Clear selection</button>
        <label class="spec-hint">Qty
          <input type="number" id="add-qty" class="qty-input" min="1" value="${quantity}" style="width:3.5rem;margin-left:0.3rem;" />
        </label>
        <button type="button" class="btn" data-action="add-checked" ${n === 0 ? "disabled" : ""}>Add checked to want list (${n})</button>
      </div>
    `;
  }

  function renderSetBox(code: string): string {
    const rec = allSetsByCode.get(code);
    const state = setData.get(code);
    const label = rec ? rec.name : code;

    let body: string;
    if (!state || state.status === "loading") {
      body = `<p class="status-line">Fetching ${escapeHtml(label)} from Scryfall…</p>`;
    } else if (state.status === "error") {
      body = `<p class="status-line error">${escapeHtml(state.error ?? "Failed to load set.")}</p>
        <button type="button" class="btn secondary small" data-action="retry-set" data-code="${escapeHtml(code)}">Retry</button>`;
    } else {
      const groups = rarityGroups(state.record!.cards);
      const sections = groups.map((g) => renderRaritySection(code, g.rarity, g.items)).join("");
      body =
        sections ||
        `<p class="empty-state">No cards match the current rarity filter.</p>`;
    }

    const total = state?.record?.cards.length ?? 0;

    return `
      <div class="set-box" data-set-box="${escapeHtml(code)}">
        <div class="set-box-header">
          <h3>${escapeHtml(label)} <span class="meta">${escapeHtml(code.toUpperCase())}${rec?.released_at ? " · " + rec.released_at : ""}</span></h3>
          <span class="meta">${total ? total + " printings cached" : ""}</span>
        </div>
        ${body}
      </div>
    `;
  }

  function renderRaritySection(
    code: string,
    rarity: string,
    items: { card: CachedCard; count: number }[],
  ): string {
    const label = rarity === "other" ? "Other" : rarityLabel(rarity);
    const checkedSet = checked.get(code);
    const inner =
      viewMode === "list"
        ? `<div class="card-list">${items
            .map(({ card: c, count }) => {
              const isChecked = checkedSet?.has(c.collector_number) ?? false;
              return `
              <label class="card-row">
                <input type="checkbox" data-action="toggle-check" data-set="${escapeHtml(code)}" data-key="${escapeHtml(c.collector_number)}" ${isChecked ? "checked" : ""} />
                <span class="rarity-dot ${rarity === "other" ? "" : rarity}"></span>
                <span class="name">${escapeHtml(c.name)}</span>
                <span class="meta">${count > 1 ? `${count} versions` : `#${escapeHtml(c.collector_number)}`}</span>
              </label>
            `;
            })
            .join("")}</div>`
        : `<div class="card-grid">${items
            .map(({ card: c, count }) => {
              const isChecked = checkedSet?.has(c.collector_number) ?? false;
              return `
              <div class="card-tile ${isChecked ? "selected" : ""}" data-action="toggle-check" data-set="${escapeHtml(code)}" data-key="${escapeHtml(c.collector_number)}" role="button" tabindex="0">
                ${c.image_uri ? `<img src="${escapeHtml(c.image_uri)}" alt="${escapeHtml(c.name)}" loading="lazy" />` : `<div class="card-tile-noimg">${escapeHtml(c.name)}</div>`}
                ${count > 1 ? `<span class="version-badge">×${count}</span>` : ""}
                <div class="caption">
                  <span class="name">${escapeHtml(c.name)}</span>
                </div>
              </div>
            `;
            })
            .join("")}</div>`;

    return `
      <div class="rarity-section">
        <div class="rarity-section-label"><span class="rarity-dot ${rarity === "other" ? "" : rarity}"></span>${escapeHtml(label)} (${items.length})</div>
        ${inner}
      </div>
    `;
  }

  async function selectSet(code: string) {
    if (selected.includes(code)) return;
    selected.push(code);
    query = "";
    suggestOpen = false;
    render();
    await ensureSetLoaded(code);
  }

  async function ensureSetLoaded(code: string, force = false) {
    if (!force) {
      const existing = setData.get(code);
      if (existing && existing.status !== "error") return;

      const cached = await db.sets_cache.get(code);
      if (cached) {
        setData.set(code, { status: "loaded", record: cached });
        render();
        return;
      }
    }

    setData.set(code, { status: "loading" });
    render();
    try {
      const cards = await fetchSetCards(code);
      const rec = allSetsByCode.get(code);
      const record: SetsCacheRecord = {
        code,
        name: rec?.name ?? code,
        cards,
        fetched_at: new Date().toISOString(),
      };
      await db.sets_cache.put(record);
      setData.set(code, { status: "loaded", record });
    } catch (err) {
      setData.set(code, {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error fetching set.",
      });
    }
    render();
  }

  function removeSet(code: string) {
    const idx = selected.indexOf(code);
    if (idx !== -1) selected.splice(idx, 1);
    checked.delete(code);
    render();
  }

  function toggleChecked(code: string, key: string) {
    if (!checked.has(code)) checked.set(code, new Set());
    const s = checked.get(code)!;
    if (s.has(key)) s.delete(key);
    else s.add(key);
    render();
  }

  function selectAllVisible() {
    for (const code of selected) {
      const state = setData.get(code);
      if (!state || state.status !== "loaded") continue;
      const groups = rarityGroups(state.record!.cards);
      if (!checked.has(code)) checked.set(code, new Set());
      const s = checked.get(code)!;
      for (const g of groups) {
        for (const { card } of g.items) s.add(card.collector_number);
      }
    }
    render();
  }

  function clearChecked() {
    checked.clear();
    render();
  }

  async function addChecked() {
    // A card checked in more than one place — a different printing within a
    // set, or the same name appearing in another selected set entirely (e.g.
    // Strixhaven vs. Strixhaven Commander) — is still one conceptual card:
    // collapse by name so it becomes a single want-list slot at `quantity`,
    // not `quantity` multiplied per duplicate checkbox.
    const byName = new Map<string, { name: string; set_code: string; rarity: string; quantity: number }>();
    for (const [code, keys] of checked.entries()) {
      const state = setData.get(code);
      if (!state || state.status !== "loaded") continue;
      const byKey = new Map(state.record!.cards.map((c) => [c.collector_number, c]));
      for (const key of keys) {
        const card = byKey.get(key);
        if (!card) continue;
        if (!byName.has(card.name)) {
          byName.set(card.name, { name: card.name, set_code: code, rarity: card.rarity, quantity });
        }
      }
    }
    const entries = [...byName.values()];
    if (entries.length === 0) return;

    await addToWantList(entries);
    checked.clear();
    statusMessage = `Added ${entries.length} card${entries.length === 1 ? "" : "s"} to your want list.`;
    statusIsError = false;
    render();
  }

  async function init() {
    loadingAllSets = true;
    render();

    try {
      allSets = await ensureAllSetsLoaded();
    } catch (err) {
      statusMessage =
        "Failed to fetch the set list from Scryfall. Check your connection and reload.";
      statusIsError = true;
      console.error(err);
      allSets = await db.all_sets.toArray();
    }
    allSetsByCode = new Map(allSets.map((s) => [s.code, s]));
    loadingAllSets = false;
    render();
  }

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (!actionEl) {
      if (!target.closest(".tag-picker")) {
        if (suggestOpen) {
          suggestOpen = false;
          render();
        }
      }
      return;
    }
    const action = actionEl.dataset.action;
    switch (action) {
      case "select-set":
        void selectSet(actionEl.dataset.code!);
        break;
      case "remove-set":
        removeSet(actionEl.dataset.code!);
        break;
      case "retry-set":
        void ensureSetLoaded(actionEl.dataset.code!, true);
        break;
      case "toggle-check":
        toggleChecked(actionEl.dataset.set!, actionEl.dataset.key!);
        break;
      case "view-list":
        viewMode = "list";
        render();
        break;
      case "view-grid":
        viewMode = "grid";
        render();
        break;
      case "select-all-visible":
        selectAllVisible();
        break;
      case "clear-checked":
        clearChecked();
        break;
      case "add-checked":
        void addChecked();
        break;
    }
  }

  function onInput(e: Event) {
    const target = e.target as HTMLElement;
    if (target.id === "set-search") {
      query = (target as HTMLInputElement).value;
      suggestOpen = true;
      render();
      const input = root.querySelector<HTMLInputElement>("#set-search");
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    } else if (target.id === "add-qty") {
      const v = parseInt((target as HTMLInputElement).value, 10);
      quantity = Number.isFinite(v) && v > 0 ? v : 1;
    } else if (target.matches('input[data-action="toggle-rarity"]')) {
      const r = (target as HTMLInputElement).dataset.rarity!;
      if ((target as HTMLInputElement).checked) activeRarities.add(r);
      else activeRarities.delete(r);
      render();
    }
  }

  function onFocusIn(e: FocusEvent) {
    const target = e.target as HTMLElement;
    if (target.id === "set-search") {
      suggestOpen = true;
      render();
      const input = root.querySelector<HTMLInputElement>("#set-search");
      input?.focus();
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("focusin", onFocusIn);

  void init();

  return {
    unmount() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("focusin", onFocusIn);
    },
  };
}
