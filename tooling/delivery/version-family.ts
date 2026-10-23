import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { targets, parseChangeset } from "../release/automation/policy";
import { versionTargets } from "../release/automation/version";
import { output } from "../release/automation/process";

export function hasPendingFamily(family: string) {
  if (family !== "npm" && family !== "self-hosted") {
    throw new Error("Expected npm or self-hosted family");
  }
  const names = new Set<string>(
    targets
      .filter((target) => target.kind === family)
      .map((target) => target.name)
  );
  return readdirSync(".changeset")
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .some((name) =>
      Object.keys(
        parseChangeset(readFileSync(`.changeset/${name}`, "utf8")).releases
      ).some((name) => names.has(name))
    );
}

export function versionFamily(family: string) {
  if (family !== "npm" && family !== "self-hosted") {
    throw new Error("Expected npm or self-hosted family");
  }
  const selected = targets
    .filter((target) => target.kind === family)
    .map((target) => target.name);
  const path = ".changeset/config.json";
  const original = readFileSync(path, "utf8");
  const config = JSON.parse(original);
  try {
    config.ignore = [
      ...new Set([
        ...config.ignore,
        ...targets
          .filter((target) => !selected.includes(target.name))
          .map((target) => target.name),
      ]),
    ];
    config.baseBranch = "main";
    writeFileSync(path, JSON.stringify(config));
    const releases = versionTargets(selected);
    if (releases.length) {
      mkdirSync(".release", { recursive: true });
      writeFileSync(
        `.release/${family}.json`,
        `${JSON.stringify({ releases }, null, 2)}\n`
      );
    }
    return releases;
  } finally {
    writeFileSync(path, original);
  }
}
if (import.meta.main) {
  if (process.argv[2] === "--pending") {
    output("enabled", String(hasPendingFamily(process.argv[3] ?? "npm")));
  } else {
    versionFamily(process.argv[2] ?? "npm");
  }
}
