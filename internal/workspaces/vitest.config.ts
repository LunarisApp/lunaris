import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: [
        "src/**/*.test.{js,jsx,ts,tsx}",
        "src/**/*.d.ts",
        "src/**/__fixtures__/**",
        "src/**/fixtures/**",
        "src/**/generated/**",
        "src/**/*.generated.{js,jsx,ts,tsx}",
        "src/extensions/host/provider.tsx",
        "src/routes/workspaces.tsx",
      ],
      thresholds: {
        statements: 71,
        branches: 61,
        functions: 67,
        lines: 74,
      },
    },
    server: {
      deps: {
        inline: ["zod"],
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@lunarisapp\/plugin-sdk$/,
        replacement: resolve(__dirname, "../../packages/plugin-sdk/src/index.ts"),
      },
      {
        find: "@lunarisapp/plugin-sdk/data",
        replacement: resolve(__dirname, "../../packages/plugin-sdk/src/data-index.ts"),
      },
      {
        find: "@lunarisapp/plugin-sdk/internal",
        replacement: resolve(__dirname, "../../packages/plugin-sdk/src/internal-index.ts"),
      },
      { find: "@repo/auth", replacement: resolve(__dirname, "../auth/src") },
      { find: "@repo/data", replacement: resolve(__dirname, "../data/src") },
      { find: "@repo/features", replacement: resolve(__dirname, "../features/src") },
      { find: "@repo/platform", replacement: resolve(__dirname, "../platform/src") },
      { find: "@repo/plugin-runtime", replacement: resolve(__dirname, "../plugin-runtime/src") },
      { find: "@repo/utils", replacement: resolve(__dirname, "../utils/src") },
      { find: "@lunarisapp/ui", replacement: resolve(__dirname, "../../packages/ui/src") },
    ],
  },
});
