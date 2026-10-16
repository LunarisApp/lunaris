import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "virtual:pwa-register/react": resolve(
        import.meta.dirname,
        "src/test-stubs/pwa-register.ts"
      ),
    },
  },
});
