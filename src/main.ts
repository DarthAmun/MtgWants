import "./style.css";
import { mountBrowseScreen } from "./screens/browse";
import { mountWantListScreen } from "./screens/wantList";
import { mountImportScreen } from "./screens/importList";

export interface ScreenHandle {
  unmount(): void;
}

type ScreenId = "browse" | "want-list" | "import";

const SCREENS: { id: ScreenId; label: string; mount: (el: HTMLElement) => ScreenHandle }[] = [
  { id: "browse", label: "Browse Sets", mount: mountBrowseScreen },
  { id: "want-list", label: "Want List", mount: mountWantListScreen },
  { id: "import", label: "Import List", mount: mountImportScreen },
];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <h1>MTG Want List Builder</h1>
    <span class="spec-hint">offline-first &middot; data cached locally</span>
  </header>
  <nav class="tabs"></nav>
  <main class="screen"></main>
`;

const tabsEl = app.querySelector<HTMLElement>("nav.tabs")!;
const screenEl = app.querySelector<HTMLElement>("main.screen")!;

let activeHandle: ScreenHandle | null = null;

function setActiveTab(id: ScreenId) {
  const screen = SCREENS.find((s) => s.id === id);
  if (!screen) return;

  for (const btn of tabsEl.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.id === id);
  }

  activeHandle?.unmount();
  screenEl.innerHTML = "";
  activeHandle = screen.mount(screenEl);
  location.hash = id;
}

tabsEl.innerHTML = SCREENS.map(
  (s) => `<button type="button" data-id="${s.id}">${s.label}</button>`,
).join("");

tabsEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button[data-id]") as HTMLButtonElement | null;
  if (!btn) return;
  setActiveTab(btn.dataset.id as ScreenId);
});

const initialId = (location.hash.replace("#", "") as ScreenId) || "browse";
setActiveTab(SCREENS.some((s) => s.id === initialId) ? initialId : "browse");

if ("serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
