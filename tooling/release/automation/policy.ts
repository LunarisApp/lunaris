import { readdirSync, readFileSync } from "node:fs";
import { parse, stringify } from "yaml";

export const targets = [
  { name: "@lunarisapp/plugin-sdk", path: "packages/plugin-sdk", kind: "npm" },
  { name: "@lunarisapp/ui", path: "packages/ui", kind: "npm" },
  { name: "api", path: "apps/api", kind: "hosted" },
  { name: "web", path: "apps/web", kind: "hosted" },
  { name: "docs", path: "apps/docs", kind: "hosted" },
  { name: "landing", path: "apps/landing", kind: "hosted" },
] as const;
export type Target = (typeof targets)[number];
export type Bump = "patch" | "minor" | "major";
export interface Changeset {
  releases: Record<string, Bump>;
  summary: string;
}
export function parseChangeset(source: string): Changeset {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Invalid changeset frontmatter");
  const releases = (parse(match[1] ?? "") ?? {}) as Record<string, Bump>;
  for (const bump of Object.values(releases)) {
    if (!["patch", "minor", "major"].includes(bump)) {
      throw new Error(`Invalid changeset bump: ${bump}`);
    }
  }
  return { releases, summary: match[2] ?? "" };
}
export function splitChangeset(source: string) {
  const { releases, summary } = parseChangeset(source);
  const selected: Record<string, Bump> = {};
  const excluded: Record<string, Bump> = {};
  for (const [name, bump] of Object.entries(releases)) {
    (targets.some((target) => target.name === name) ? selected : excluded)[name] = bump;
  }
  const format = (entries: Record<string, Bump>) =>
    Object.keys(entries).length ? `---\n${stringify(entries)}---\n${summary}` : null;
  return { selected: format(selected), excluded: format(excluded) };
}
export function validateSource(base: string, head: string, sameRepository: boolean) {
  if (base === "main" && (!sameRepository || (head !== "next" && !head.startsWith("hotfix/")))) {
    throw new Error("PRs into main must come from this repository's next or hotfix/* branch");
  }
}
export function validateHotfix(head: string, changesets: Changeset[]) {
  if (head.startsWith("hotfix/") && changesets.some((entry) => Object.values(entry.releases).some((bump) => bump !== "patch"))) {
    throw new Error("Hotfix changesets must use patch bumps only");
  }
}
export interface Workspace {
  dependencies: string[];
  name: string;
  path: string;
}
export function readWorkspaces(): Workspace[] {
  return ["apps", "packages", "internal", "extensions", "ee"].flatMap((directory) =>
    readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      try {
        const manifest = JSON.parse(readFileSync(`${path}/package.json`, "utf8"));
        return [{ name: manifest.name, path, dependencies: Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }) }];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    })
  );
}
export function affectedTargets(files: string[], workspaces: Workspace[]): string[] {
  const changed = new Set<string>();
  for (const file of files) {
    if (file.startsWith(".changeset/") || /(^|\/)(CHANGELOG|README|AGENTS)\.md$/.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;
    if (["bun.lock", "bunfig.toml", "package.json", "turbo.json"].includes(file) || file.startsWith("tooling/editions/")) {
      for (const target of targets) changed.add(target.name);
    }
    if (file.startsWith("infra/local/config/") || file === "tooling/powersync-config.ts") changed.add("api");
    for (const workspace of workspaces) {
      if (file.startsWith(`${workspace.path}/`)) changed.add(workspace.name);
    }
  }
  let size = -1;
  while (size !== changed.size) {
    size = changed.size;
    for (const workspace of workspaces) {
      if (workspace.dependencies.some((name) => changed.has(name))) changed.add(workspace.name);
    }
  }
  return targets.filter((target) => changed.has(target.name)).map((target) => target.name);
}
