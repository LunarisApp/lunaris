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
        "src/test-stubs/**",
        "src/config.ts",
        "src/index.tsx",
        "src/providers.tsx",
        "src/router.tsx",
        "src/runtime.tsx",
        "src/extensions/host/provider.tsx",
        "src/routes/workspaces.tsx",
      ],
      thresholds: {
        statements: 73,
        branches: 64,
        functions: 70,
        lines: 76,
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
        find: "virtual:pwa-register/react",
        replacement: resolve(__dirname, "src/test-stubs/pwa-register.ts"),
      },
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
      {
        find: "@repo/workspaces/routes",
        replacement: resolve(__dirname, "../workspaces/src/routes/index.tsx"),
      },
      {
        find: "@repo/workspaces/bootstrap",
        replacement: resolve(
          __dirname,
          "../workspaces/src/features/new-workspace/default-template/seed-marker.ts",
        ),
      },
      { find: "@lunarisapp/ui", replacement: resolve(__dirname, "../../packages/ui/src") },
      { find: "@repo/utils", replacement: resolve(__dirname, "../utils/src") },
    ],
  },
});
