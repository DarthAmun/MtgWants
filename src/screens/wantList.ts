import { liveQuery, type Subscription } from "dexie";
import type { ScreenHandle } from "../main";
import { db } from "../db";
import { ensureAllSetsLoaded } from "../lib/allSets";
import { RARITY_ORDER, rarityLabel } from "../lib/rarity";
import { escapeHtml } from "../lib/dom";
import { buildMpcfillText, downloadTextFile, copyToClipboard } from "../lib/export";
import { dedupeWantList } from "../lib/wantListOps";
import type { AllSetRecord, WantListEntry } from "../types";

type ViewMode = "list" | "grid";

export function mountWantListScreen(container: HTMLElement): ScreenHandle {
  let entries: WantListEntry[] = [];
  let allSetsByCode = new Map<string, AllSetRecord>();
  const imageCache = new Map<string, string | null>(); // key: `${set_code}::${name}::${rarity}`
  let viewMode: ViewMode = "list";
  let statusMessage = "";
  const selected = new Set<number>();

  container.innerHTML = `<div class="want-list-screen"></div>`;
  const root = container.querySelector<HTMLDivElement>(".want-list-screen")!;

  async function imageFor(entry: WantListEntry): Promise<string | null> {
    if (!entry.set_code) return null;
    const key = `${entry.set_code}::${entry.name}::${entry.rarity ?? ""}`;
    if (imageCache.has(key)) return imageCache.get(key)!;
    const setRecord = await db.sets_cache.get(entry.set_code);
    let uri: string | null = null;
    if (setRecord) {
      const match =
        setRecord.cards.find((c) => c.name === entry.name && c.rarity === entry.rarity) ??
        setRecord.cards.find((c) => c.name === entry.name);
      uri = match?.image_uri ?? null;
    }
    imageCache.set(key, uri);
    return uri;
  }

  function groupBySet(): { code: string | null; label: string; releasedAt: string | null; rows: WantListEntry[] }[] {
    const groups = new Map<string | null, WantListEntry[]>();
    for (const e of entries) {
      const key = e.set_code;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    const result: { code: string | null; label: string; releasedAt: string | null; rows: WantListEntry[] }[] = [];
    for (const [code, rows] of groups.entries()) {
      if (code === null) continue;
      const rec = allSetsByCode.get(code);
      result.push({ code, label: rec?.name ?? code, releasedAt: rec?.released_at ?? null, rows });
    }
    result.sort((a, b) => (Date.parse(b.releasedAt ?? "") || 0) - (Date.parse(a.releasedAt ?? "") || 0));

    if (groups.has(null)) {
      result.push({ code: null, label: "Unsorted", releasedAt: null, rows: groups.get(null)! });
    }
    return result;
  }

  function totalQty(rows: WantListEntry[]): number {
    return rows.reduce((sum, r) => sum + r.quantity, 0);
  }

  async function render() {
    const groups = groupBySet();
    const grandTotalCards = totalQty(entries);
    const grandTotalUnique = entries.length;

    const boxesHtml = await Promise.all(groups.map((g) => renderSetGroup(g)));

    root.innerHTML = `
      <section>
        <div class="toolbar">
          <h2 style="margin:0;flex:1;">Want List</h2>
          <div class="view-toggle">
            <button type="button" data-action="view-list" class="${viewMode === "list" ? "active" : ""}">List</button>
            <button type="button" data-action="view-grid" class="${viewMode === "grid" ? "active" : ""}">Grid</button>
          </div>
          ${
            selected.size > 0
              ? `<button type="button" class="btn secondary small" data-action="clear-selection">Clear selection</button>
                 <button type="button" class="btn danger" data-action="remove-selected">Remove selected (${selected.size})</button>`
              : ""
          }
          <button type="button" class="btn secondary" data-action="export-copy" ${entries.length === 0 ? "disabled" : ""}>Copy for MPCFill</button>
          <button type="button" class="btn" data-action="export-download" ${entries.length === 0 ? "disabled" : ""}>Download .txt</button>
        </div>
        <p class="totals">${grandTotalUnique} unique entr${grandTotalUnique === 1 ? "y" : "ies"} &middot; ${grandTotalCards} card${grandTotalCards === 1 ? "" : "s"} total</p>
        ${statusMessage ? `<p class="status-line">${escapeHtml(statusMessage)}</p>` : ""}
        ${entries.length === 0 ? `<p class="empty-state">Your want list is empty. Add cards from the Browse Sets tab or paste a list to import.</p>` : `<div class="set-boxes">${boxesHtml.join("")}</div>`}
      </section>
    `;
  }

  async function renderSetGroup(group: {
    code: string | null;
    label: string;
    releasedAt: string | null;
    rows: WantListEntry[];
  }): Promise<string> {
    const byRarity = new Map<string, WantListEntry[]>();
    for (const row of group.rows) {
      const key = row.rarity ?? "__unknown__";
      if (!byRarity.has(key)) byRarity.set(key, []);
      byRarity.get(key)!.push(row);
    }

    const order = [...RARITY_ORDER, "__unknown__"];
    const sectionsHtml = await Promise.all(
      order
        .filter((r) => byRarity.has(r))
        .map((r) => renderRaritySection(r === "__unknown__" ? null : r, byRarity.get(r)!)),
    );

    return `
      <div class="set-box">
        <div class="set-box-header">
          <h3>${escapeHtml(group.label)}${group.code ? ` <span class="meta">${escapeHtml(group.code.toUpperCase())}${group.releasedAt ? " · " + group.releasedAt : ""}</span>` : ""}</h3>
          <span class="meta">${totalQty(group.rows)} card${totalQty(group.rows) === 1 ? "" : "s"}</span>
        </div>
        ${sectionsHtml.join("")}
      </div>
    `;
  }

  async function renderRaritySection(rarity: string | null, rows: WantListEntry[]): Promise<string> {
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const inner =
      viewMode === "list" ? renderListRows(rows) : await renderGridTiles(rows);

    const ids = rows.map((r) => r.id!);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    const idList = ids.join(",");

    return `
      <div class="rarity-section">
        <div class="rarity-section-label">
          ${rarity ? `<span class="rarity-dot ${rarity}"></span>` : ""}${escapeHtml(rarityLabel(rarity))} (${totalQty(rows)})
          <button type="button" class="btn secondary small" data-action="toggle-select-section" data-ids="${idList}">
            ${allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        ${inner}
      </div>
    `;
  }

  function renderListRows(rows: WantListEntry[]): string {
    return `<div class="card-list">${rows
      .map(
        (r) => `
        <div class="card-row">
          <input type="checkbox" data-action="toggle-select" data-id="${r.id}" ${selected.has(r.id!) ? "checked" : ""} />
          <span class="name">${escapeHtml(r.name)}</span>
          <input type="number" class="qty-input" min="1" value="${r.quantity}" data-action="edit-qty" data-id="${r.id}" />
          <button type="button" class="btn danger small" data-action="remove-entry" data-id="${r.id}">Remove</button>
        </div>
      `,
      )
      .join("")}</div>`;
  }

  async function renderGridTiles(rows: WantListEntry[]): Promise<string> {
    const tiles = await Promise.all(
      rows.map(async (r) => {
        const uri = await imageFor(r);
        return `
          <div class="card-tile ${selected.has(r.id!) ? "selected" : ""}">
            <input type="checkbox" class="select-box" data-action="toggle-select" data-id="${r.id}" ${selected.has(r.id!) ? "checked" : ""} />
            ${uri ? `<img src="${escapeHtml(uri)}" alt="${escapeHtml(r.name)}" loading="lazy" />` : `<div class="card-tile-noimg">${escapeHtml(r.name)}</div>`}
            <button type="button" class="remove-btn" data-action="remove-entry" data-id="${r.id}" aria-label="Remove ${escapeHtml(r.name)}">&times;</button>
            <div class="caption">
              <span class="name">${escapeHtml(r.name)}</span>
              <input type="number" class="qty-input" min="1" value="${r.quantity}" data-action="edit-qty" data-id="${r.id}" />
            </div>
          </div>
        `;
      }),
    );
    return `<div class="card-grid">${tiles.join("")}</div>`;
  }

  async function updateQuantity(id: number, quantity: number) {
    if (quantity < 1 || !Number.isFinite(quantity)) return;
    await db.want_list.update(id, { quantity });
  }

  async function removeEntry(id: number) {
    selected.delete(id);
    await db.want_list.delete(id);
  }

  async function removeSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (ids.length > 1 && !confirm(`Remove ${ids.length} entries from your want list?`)) return;
    await db.want_list.bulkDelete(ids);
    selected.clear();
  }

  function toggleSelect(id: number) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    void render();
  }

  function toggleSelectSection(ids: number[]) {
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    for (const id of ids) {
      if (allSelected) selected.delete(id);
      else selected.add(id);
    }
    void render();
  }

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    switch (action) {
      case "view-list":
        viewMode = "list";
        void render();
        break;
      case "view-grid":
        viewMode = "grid";
        void render();
        break;
      case "remove-entry":
        void removeEntry(Number(actionEl.dataset.id));
        break;
      case "remove-selected":
        void removeSelected();
        break;
      case "clear-selection":
        selected.clear();
        void render();
        break;
      case "toggle-select-section": {
        const ids = (actionEl.dataset.ids ?? "")
          .split(",")
          .filter(Boolean)
          .map(Number);
        toggleSelectSection(ids);
        break;
      }
      case "export-copy":
        void doExport("copy");
        break;
      case "export-download":
        void doExport("download");
        break;
    }
  }

  function onChange(e: Event) {
    const target = e.target as HTMLElement;
    if (target.matches('input[data-action="edit-qty"]')) {
      const id = Number((target as HTMLInputElement).dataset.id);
      const value = parseInt((target as HTMLInputElement).value, 10);
      void updateQuantity(id, value);
    } else if (target.matches('input[data-action="toggle-select"]')) {
      const id = Number((target as HTMLInputElement).dataset.id);
      toggleSelect(id);
    }
  }

  async function doExport(mode: "copy" | "download") {
    const text = buildMpcfillText(entries);
    if (mode === "download") {
      downloadTextFile(text, "mpcfill-want-list.txt");
      statusMessage = "Downloaded mpcfill-want-list.txt";
    } else {
      const ok = await copyToClipboard(text);
      statusMessage = ok ? "Copied want list to clipboard." : "Copy failed — clipboard unavailable.";
    }
    await render();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);

  let sub: Subscription | null = null;

  (async () => {
    allSetsByCode = new Map((await ensureAllSetsLoaded()).map((s) => [s.code, s]));
    // One-time cleanup: merge any rows that ended up with the same card name
    // under different set/rarity before name-only merging was in place.
    await dedupeWantList();
    sub = liveQuery(() => db.want_list.toArray()).subscribe({
      next: async (rows) => {
        entries = rows;
        imageCache.clear();
        const validIds = new Set(rows.map((r) => r.id!));
        for (const id of selected) {
          if (!validIds.has(id)) selected.delete(id);
        }
        await render();
      },
      error: (err) => console.error("want_list liveQuery error", err),
    });
  })();

  return {
    unmount() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
      sub?.unsubscribe();
    },
  };
}
