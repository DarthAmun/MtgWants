import type { WantListEntry } from "../types";

export function buildMpcfillText(entries: WantListEntry[]): string {
  return entries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => `${e.quantity}x ${e.name}`)
    .join("\n");
}

export function downloadTextFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
