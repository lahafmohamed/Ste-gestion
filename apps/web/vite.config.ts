import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `dev.bat` choisit des ports libres et les passe par l'environnement ; sans
// variable (`pnpm dev` direct), les ports habituels.
const API_PORT = Number(process.env.API_PORT ?? 3001);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5273);

const API_PROXY = {
  "/api": {
    target: `http://127.0.0.1:${API_PORT}`,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [
    react(),
    // Application installable + coquille en cache : la tablette du parc doit
    // ouvrir l'app dans un tunnel sans réseau, et l'écran d'accueil rend les
    // ~100px de chrome navigateur à la saisie.
    VitePWA({
      // « prompt » et non « autoUpdate » : un rechargement automatique en
      // pleine saisie coûterait le relevé en cours. La bannière laisse le
      // pointeur choisir son moment.
      registerType: "prompt",
      includeAssets: ["logo-ste.png", "logo-ste-mark.png", "apple-touch-icon.png"],
      manifest: {
        name: "STE — Gestion scierie",
        short_name: "STE",
        description: "Suivi contrats, réception, étalage, débitage et empotage.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#fafaf9", // brand-50
        theme_color: "#856656", // accent-500, teck du logo
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // Inter est découpée par alphabet (unicode-range) : seuls latin et
        // latin-ext servent au français, inutile de précacher les autres.
        globIgnores: ["**/inter-cyrillic*", "**/inter-greek*", "**/inter-vietnamese*"],
        navigateFallback: "/index.html",
        // L'API n'est jamais servie depuis le cache de navigation : elle a sa
        // propre règle ci-dessous.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Lectures d'API : réseau d'abord (donnée fraîche), cache en
            // secours. Hors réseau, l'app montre le dernier état connu au lieu
            // d'un écran d'erreur. Les écritures (POST/PATCH/DELETE) ne
            // passent pas par là : react-query les met en attente.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/api/") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "ste-api",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Service worker actif en dev : sans ça le comportement hors ligne ne
        // se teste qu'en build de production.
        enabled: false,
      },
    }),
  ],
  server: {
    port: WEB_PORT,
    // Port imposé par le lanceur : échouer plutôt que glisser sur un autre port
    // que celui qu'il ouvre dans le navigateur.
    strictPort: process.env.WEB_PORT !== undefined,
    host: true, // écoute sur le LAN (0.0.0.0) → accès depuis tablette/tél au parc
    proxy: API_PROXY,
  },
  // Le service worker n'existe qu'en build : `pnpm preview` est le seul moyen
  // de tester l'installation et le hors-ligne en local — il lui faut l'API.
  preview: {
    port: 5274,
    host: true,
    proxy: API_PROXY,
  },
});
