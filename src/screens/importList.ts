import type { ScreenHandle } from "../main";
import { db } from "../db";
import { parseWantList } from "../lib/parser";
import { resolveCardsByName } from "../lib/scryfall";
import { addToWantList } from "../lib/wantListOps";
import { escapeHtml } from "../lib/dom";

export function mountImportScreen(container: HTMLElement): ScreenHandle {
  let text = "";
  let lastParsed: { name: string; quantity: number }[] | null = null;
  let statusMessage = "";
  let statusIsError = false;
  let resolving = false;
  let unresolvedCount = 0;

  container.innerHTML = `<div class="import-screen"></div>`;
  const root = container.querySelector<HTMLDivElement>(".import-screen")!;

  async function refreshUnresolvedCount() {
    unresolvedCount = await db.want_list.filter((e) => e.set_code === null).count();
  }

  function render() {
    root.innerHTML = `
      <section>
        <h2>Import from List</h2>
        <p class="spec-hint">
          Paste a decklist (Moxfield, Archidekt, EDHREC, plain notes, …). Recognized formats:
          <code>3x Lightning Bolt</code>, <code>3 Lightning Bolt</code>, or just <code>Lightning Bolt</code>.
          Trailing <code>(SET) 123</code> annotations, blank lines, <code># / // comments</code>, and section
          headers like <code>Commander</code> / <code>Sideboard</code> are stripped or skipped automatically.
        </p>
        <textarea id="import-text" rows="12" placeholder="Paste your list here…">${escapeHtml(text)}</textarea>
        <div class="import-actions">
          <button type="button" class="btn" data-action="parse-add">Parse &amp; add to want list</button>
          <button type="button" class="btn secondary" data-action="resolve" ${resolving ? "disabled" : ""}>
            ${resolving ? "Resolving…" : `Resolve details (${unresolvedCount} unresolved)`}
          </button>
        </div>
        ${statusMessage ? `<p class="status-line ${statusIsError ? "error" : ""}">${escapeHtml(statusMessage)}</p>` : ""}
        ${lastParsed ? renderPreview() : ""}
      </section>
    `;
  }

  function renderPreview(): string {
    if (!lastParsed || lastParsed.length === 0) {
      return `<p class="empty-state">No card lines were recognized in the pasted text.</p>`;
    }
    return `
      <div class="import-results">
        <table>
          <thead><tr><th>Qty</th><th>Name</th></tr></thead>
          <tbody>
            ${lastParsed
              .map((p) => `<tr><td>${p.quantity}</td><td>${escapeHtml(p.name)}</td></tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function parseAndAdd() {
    const parsed = parseWantList(text);
    lastParsed = parsed;
    if (parsed.length === 0) {
      statusMessage = "Nothing to add — no recognizable card lines found.";
      statusIsError = true;
      render();
      return;
    }
    await addToWantList(
      parsed.map((p) => ({ name: p.name, set_code: null, rarity: null, quantity: p.quantity })),
    );
    statusMessage = `Added ${parsed.length} entr${parsed.length === 1 ? "y" : "ies"} to the want list (set/rarity unresolved — use "Resolve details" to fill them in).`;
    statusIsError = false;
    await refreshUnresolvedCount();
    render();
  }

  async function resolveDetails() {
    const unresolved = await db.want_list.filter((e) => e.set_code === null).toArray();
    if (unresolved.length === 0) {
      statusMessage = "Nothing to resolve — every want list entry already has set/rarity data.";
      statusIsError = false;
      render();
      return;
    }

    resolving = true;
    render();

    try {
      const uniqueNames = [...new Set(unresolved.map((e) => e.name))];
      const { resolved, notFound } = await resolveCardsByName(uniqueNames);
      const byName = new Map(resolved.map((r) => [r.name.toLowerCase(), r]));

      await db.transaction("rw", db.want_list, async () => {
        for (const entry of unresolved) {
          const match = byName.get(entry.name.toLowerCase());
          if (match) {
            await db.want_list.update(entry.id!, {
              set_code: match.set_code,
              rarity: match.rarity,
            });
          }
        }
      });

      statusMessage = `Resolved ${resolved.length} of ${uniqueNames.length} unique name(s).${
        notFound.length > 0 ? ` Not found: ${notFound.join(", ")}` : ""
      }`;
      statusIsError = false;
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : "Failed to resolve card details.";
      statusIsError = true;
    }

    resolving = false;
    await refreshUnresolvedCount();
    render();
  }

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (!actionEl) return;
    if (actionEl.dataset.action === "parse-add") void parseAndAdd();
    if (actionEl.dataset.action === "resolve") void resolveDetails();
  }

  function onInput(e: Event) {
    const target = e.target as HTMLElement;
    if (target.id === "import-text") {
      text = (target as HTMLTextAreaElement).value;
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);

  render();
  void refreshUnresolvedCount().then(render);

  return {
    unmount() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
    },
  };
}
