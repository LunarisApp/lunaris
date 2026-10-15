import { editionPlugin } from "../../tooling/editions/vite";
import { distributionNotices } from "../../tooling/licenses/vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import evlog from "evlog/vite";
import { defineConfig, loadEnv } from "vite";
import wasm from "vite-plugin-wasm";
import { formatDesktopBuildVersion } from "./build-version";
import { validateDesktopProductionEnv } from "./production-env";

const notices = distributionNotices();

export default defineConfig(({ mode }) => {
  const buildEnv = { ...loadEnv(mode, __dirname, ""), ...process.env };
  if (mode === "production" && buildEnv.TAURI_ENV_DEBUG !== "true") {
    validateDesktopProductionEnv(buildEnv);
  }

  return {
    clearScreen: false,
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    plugins: [
      notices.plugin,
      editionPlugin(),
      evlog({
        service: "desktop",
        strip: ["debug"],
        sourceLocation: "dev",
        autoImports: true,
      }),
      react(),
      tailwindcss(),
      wasm(),
    ],
    worker: { format: "es", plugins: notices.workerPlugins },
    optimizeDeps: {
      include: ["evlog/client"],
    },
    define: {
      __BUILD_VERSION__: JSON.stringify(formatDesktopBuildVersion(buildEnv)),
      "global.Buffer": "globalThis.Buffer",
    },
    resolve: {
      alias: [
        {
          find: /^posthog-js$/,
          replacement: "posthog-js/dist/module.slim.js",
        },
        {
          find: "@repo/app-shell",
          replacement: path.resolve(__dirname, "../../internal/app-shell/src"),
        },
        {
          find: "@repo/data/schema",
          replacement: path.resolve(
            __dirname,
            "../../internal/data/src/features/index.ts",
          ),
        },
        {
          find: "@repo/data",
          replacement: path.resolve(__dirname, "../../internal/data/src"),
        },
        {
          find: "@lunarisapp/ui",
          replacement: path.resolve(__dirname, "../../packages/ui/src"),
        },
        {
          find: "@repo/features",
          replacement: path.resolve(__dirname, "../../internal/features/src"),
        },
      ],
    },
  };
});
