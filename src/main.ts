import "./style.css";
import { mountBrowseScreen } from "./screens/browse";
import { mountWantListScreen } from "./screens/wantList";
import { mountImportScreen } from "./screens/importList";

export interface ScreenHandle {
  unmount(): void;
}

type ScreenId = "browse" | "want-list" | "import";

const SCREENS: {
  id: ScreenId;
  label: string;
  icon: string;
  mount: (el: HTMLElement) => ScreenHandle;
}[] = [
  { id: "browse", label: "Browse Sets", icon: "▦", mount: mountBrowseScreen },
  { id: "want-list", label: "Want List", icon: "★", mount: mountWantListScreen },
  { id: "import", label: "Import", icon: "⤓", mount: mountImportScreen },
];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="app-shell">
    <div class="bg-orb bg-orb-a"></div>
    <div class="bg-orb bg-orb-b"></div>
    <div class="bg-orb bg-orb-c"></div>
    <div class="app-frame">
      <div class="app-frame-inner">
        <header class="app-header">
          <h1>MTG Want List Builder</h1>
          <span class="spec-hint">offline &middot; cards cached locally</span>
        </header>
        <nav class="tabs-desktop"></nav>
        <main class="screen"></main>
        <nav class="tabs-mobile"></nav>
      </div>
    </div>
  </div>
`;

const tabsDesktopEl = app.querySelector<HTMLElement>("nav.tabs-desktop")!;
const tabsMobileEl = app.querySelector<HTMLElement>("nav.tabs-mobile")!;
const screenEl = app.querySelector<HTMLElement>("main.screen")!;

tabsDesktopEl.innerHTML = SCREENS.map(
  (s) => `<button type="button" data-id="${s.id}">${s.label}</button>`,
).join("");

tabsMobileEl.innerHTML = SCREENS.map(
  (s) =>
    `<button type="button" data-id="${s.id}"><span class="icon">${s.icon}</span><span class="label">${s.label}</span></button>`,
).join("");

let activeHandle: ScreenHandle | null = null;

function setActiveTab(id: ScreenId) {
  const screen = SCREENS.find((s) => s.id === id);
  if (!screen) return;

  for (const btn of app.querySelectorAll<HTMLButtonElement>("[data-id]")) {
    btn.classList.toggle("active", btn.dataset.id === id);
  }

  activeHandle?.unmount();
  screenEl.innerHTML = "";
  activeHandle = screen.mount(screenEl);
  location.hash = id;
}

function onTabClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest("button[data-id]") as HTMLButtonElement | null;
  if (!btn) return;
  setActiveTab(btn.dataset.id as ScreenId);
}

tabsDesktopEl.addEventListener("click", onTabClick);
tabsMobileEl.addEventListener("click", onTabClick);

const initialId = (location.hash.replace("#", "") as ScreenId) || "browse";
setActiveTab(SCREENS.some((s) => s.id === initialId) ? initialId : "browse");

if ("serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
