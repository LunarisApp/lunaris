import { appendFileSync } from "node:fs";

export function shardSpecs(
  specs: string[],
  shard: number,
  shards: number
): string[] {
  if (
    !Number.isInteger(shards) ||
    shards < 1 ||
    !Number.isInteger(shard) ||
    shard < 0 ||
    shard >= shards
  ) {
    throw new Error("Invalid E2E shard");
  }
  return [...specs].sort().filter((_, index) => index % shards === shard);
}
if (import.meta.main) {
  const suite = process.env.E2E_SUITE ?? "full";
  if (!["full", "smoke"].includes(suite)) {
    throw new Error("Invalid E2E suite");
  }
  const all = [
    ...new Bun.Glob("cypress/e2e/**/*.cy.ts").scanSync("apps/e2e"),
  ].filter((file) => !file.startsWith("cypress/e2e/offline/"));
  const selected =
    suite === "smoke"
      ? all.filter((file) => /\/(anonymous|core-workflow)\.cy\.ts$/.test(file))
      : shardSpecs(
          all,
          Number(process.env.E2E_SHARD ?? 0),
          Number(process.env.E2E_SHARDS ?? 1)
        );
  if (!selected.length) {
    throw new Error("No E2E specs selected");
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `specs=${selected.join(",")}\n`);
  }
}
