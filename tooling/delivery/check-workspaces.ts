const task = process.argv[2];
if (task !== "typecheck" && task !== "test") {
  throw new Error("Expected typecheck or test");
}
const filters: unknown = JSON.parse(process.env.WORKSPACE_FILTERS ?? "null");
if (
  !(Array.isArray(filters) && filters.length) ||
  filters.some(
    (value) =>
      typeof value !== "string" || !/^--filter=[@a-zA-Z0-9_./-]+$/.test(value)
  )
) {
  throw new Error("Invalid affected workspace filters");
}
// CI uses this marker when changes affect no JavaScript workspace.
// Turbo rejects exact filters naming nonexistent packages.
if (
  filters.length === 1 &&
  filters[0] === "--filter=__no_affected_workspace__"
) {
  process.exit(0);
}
const child = Bun.spawn(
  ["bun", "x", "--no-install", "turbo", task, ...filters, "--concurrency=4"],
  { stdout: "inherit", stderr: "inherit" }
);
process.exit(await child.exited);
