import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { splitChangeset, targets } from "./policy";
import { run } from "./process";

export function versionTargets(
  names: readonly string[] = targets.map((target) => target.name)
) {
  const before = new Map(
    targets.map((target) => [
      target.name,
      JSON.parse(readFileSync(`${target.path}/package.json`, "utf8"))
        .version as string,
    ])
  );
  const backups = new Map<string, string>();
  let pending = false;
  for (const name of readdirSync(".changeset")) {
    if (!name.endsWith(".md") || name === "README.md") {
      continue;
    }
    const path = `.changeset/${name}`;
    const source = readFileSync(path, "utf8");
    backups.set(path, source);
  }
  let success = false;
  try {
    for (const [path, source] of backups) {
      const { selected } = splitChangeset(source, names);
      if (selected) {
        writeFileSync(path, selected);
        pending = true;
      } else {
        unlinkSync(path);
      }
    }
    if (pending) {
      run("bun", ["x", "changeset", "version"]);
    }
    success = true;
  } finally {
    for (const [path, source] of backups) {
      const excluded = success
        ? splitChangeset(source, names).excluded
        : source;
      if (excluded) {
        writeFileSync(path, excluded);
      } else if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  }
  return targets.flatMap((target) => {
    const version = JSON.parse(
      readFileSync(`${target.path}/package.json`, "utf8")
    ).version as string;
    if (version === before.get(target.name)) {
      return [];
    }
    const changelog = readFileSync(`${target.path}/CHANGELOG.md`, "utf8");
    const notes = changelog
      .split(`## ${version}\n`)[1]
      ?.split(/\n## /)[0]
      ?.trim();
    if (!notes) {
      throw new Error(`Missing release notes for ${target.name}@${version}`);
    }
    return [{ ...target, version, tag: `${target.name}@${version}`, notes }];
  });
}
if (import.meta.main) {
  versionTargets();
}
