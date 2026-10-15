import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Programmatic Vite builds are resource-intensive; keep SDK files isolated.
    fileParallelism: false,
    include: ["src/**/*.test.{ts,tsx}"],
    pool: "forks",
    singleFork: true,
  },
});
