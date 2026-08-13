import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Deployed as a GitHub Pages project site (github.com/DarthAmun/MtgWants ->
// darthamun.github.io/MtgWants/), so production builds need that subpath as
// the base. Dev server stays at "/" for convenience.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/MtgWants/" : "/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "MTG Want List Builder",
        short_name: "Want List",
        description:
          "Offline-first tool for browsing MTG sets, building a want list, and exporting it for MPCFill.",
        theme_color: "#14151a",
        background_color: "#14151a",
        display: "standalone",
        // start_url/scope intentionally omitted — vite-plugin-pwa derives
        // them from the resolved `base` above, so this stays correct for
        // both local dev ("/") and the Pages subpath ("/MtgWants/").
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache only the app shell (HTML/CSS/JS/icons). Scryfall API
        // responses are cached explicitly in IndexedDB, not via the SW —
        // this app must never auto-refetch or background-refresh data.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
    }),
  ],
}));
