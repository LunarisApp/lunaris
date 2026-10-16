import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/client/**/*.test.{ts,tsx}"],
    // Force vitest to transform `zod` via vite instead of native
    // import. Under `bun run` the native loader has occasionally loaded
    // a different transitive zod instance and left `z.object` undefined;
    // routing the import through the vite graph keeps resolution consistent.
    server: {
      deps: {
        inline: ["zod"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/client/**/*.{ts,tsx}"],
      exclude: [
        "node_modules/",
        "vitest.config.ts",
        "vitest.setup.ts",
        "src/client/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/**/__fixtures__/**",
        "src/**/fixtures/**",
        "src/**/generated/**",
        "src/**/*.generated.{ts,tsx}",
      ],
      thresholds: {
        statements: 68,
        branches: 62,
        functions: 66,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@lunarisapp\/plugin-sdk$/,
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-sdk/src/index.ts"
        ),
      },
      {
        find: "@lunarisapp/plugin-sdk/internal",
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-sdk/src/internal-index.ts"
        ),
      },
      {
        find: "@lunarisapp/plugin-sdk/marketplace",
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-sdk/src/marketplace.ts"
        ),
      },
      {
        find: "@lunarisapp/ui",
        replacement: resolve(import.meta.dirname, "../../packages/ui/src"),
      },
      {
        find: "@repo/utils",
        replacement: resolve(import.meta.dirname, "../../internal/utils/src"),
      },
      {
        find: "@repo/data",
        replacement: resolve(import.meta.dirname, "../../internal/data/src"),
      },
      {
        find: "@repo/platform",
        replacement: resolve(
          import.meta.dirname,
          "../../internal/platform/src"
        ),
      },
    ],
  },
});
