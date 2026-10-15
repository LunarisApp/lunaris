import { editionPlugin } from "../../tooling/editions/vite";
import { distributionNotices } from "../../tooling/licenses/vite";
import { navigateFallbackDenylist } from "./scripts/pwa-navigation";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import evlog from "evlog/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import wasm from "vite-plugin-wasm";
import { NETWORK_ONLY_DISCOVERY_URLS } from "./scripts/pwa-build-assertions";

// https://vite.dev/config/
const notices = distributionNotices({ serviceWorker: true });

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "initial-deps",
              priority: 100,
              tags: ["$initial"],
            },
          ],
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },

  plugins: [
    notices.plugin,
    editionPlugin(),
    evlog({
      service: "web",
      strip: ["debug"],
      sourceLocation: "dev",
      autoImports: true,
    }),
    react(),
    tailwindcss(),
    wasm(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Lunaris",
        short_name: "Lunaris",
        description: "A modern word processor for all your writing needs.",
        display: "standalone",
        start_url: "/",
        scope: "/",
        theme_color: "#fbfaf7",
        background_color: "#fbfaf7",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      // Offline support
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist,
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,webp,woff,woff2,wasm,txt,webmanifest}",
          ".well-known/**",
          "LICENSE",
          "edition.json",
          "THIRD-PARTY-*.md",
        ],
        // Deployment discovery must stay fresh; self-hosted origins vary at runtime.
        globIgnores: NETWORK_ONLY_DISCOVERY_URLS,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              url.origin ===
                (globalThis as unknown as { location: { origin: string } })
                  .location.origin &&
              url.pathname.startsWith("/assets/") &&
              /-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(url.pathname) &&
              (request.destination === "font" ||
                request.destination === "image" ||
                request.destination === "script" ||
                request.destination === "style" ||
                request.destination === "worker" ||
                url.pathname.endsWith(".wasm")),
            handler: "CacheFirst",
            options: {
              cacheName: "lunaris-runtime-assets",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 300,
                purgeOnQuotaError: true,
              },
            },
          },
          {
            urlPattern: /^https:\/\/gravatar\.com\/avatar\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "gravatar-avatars",
              expiration: {
                maxAgeSeconds: 30 * 24 * 60 * 60,
                maxEntries: 200,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB
      },
    }),
  ],

  // PowerSync
  worker: {
    plugins: notices.workerPlugins,
    format: "es",
  },
  optimizeDeps: {
    // Don't optimize these packages as they contain web workers and WASM files.
    // https://github.com/vitejs/vite/issues/11672#issuecomment-1415820673
    exclude: ["@journeyapps/wa-sqlite", "@powersync/web"],
    include: ["evlog/client"],
  },

  define: {
    __BUILD_VERSION__: JSON.stringify(
      (process.env.RAILWAY_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    ),
    // @react-pdf/renderer requires Buffer in browser
    "global.Buffer": "globalThis.Buffer",
  },

  // Alias
  resolve: {
    alias: [
      {
        find: /^posthog-js$/,
        replacement: "posthog-js/dist/module.slim.js",
      },
      {
        find: "@repo/app-shell",
        replacement: path.resolve(
          import.meta.dirname,
          "../../internal/app-shell/src",
        ),
      },
      {
        find: "@repo/data",
        replacement: path.resolve(
          import.meta.dirname,
          "../../internal/data/src",
        ),
      },
      {
        find: "@lunarisapp/ui",
        replacement: path.resolve(import.meta.dirname, "../../packages/ui/src"),
      },
      {
        find: "@repo/features",
        replacement: path.resolve(
          import.meta.dirname,
          "../../internal/features/src",
        ),
      },
    ],
  },
});
