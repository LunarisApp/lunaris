import { isDeepStrictEqual } from "node:util";
import { affectedComponents } from "../../delivery/affected";
export { readWorkspaces, type Workspace } from "../../delivery/affected";
import type { Workspace } from "../../delivery/affected";
import { parse, stringify } from "yaml";

export const targets = [
  { name: "@lunarisapp/plugin-sdk", path: "packages/plugin-sdk", kind: "npm" },
  { name: "@lunarisapp/ui", path: "packages/ui", kind: "npm" },
  { name: "api", path: "apps/api", kind: "hosted" },
  { name: "web", path: "apps/web", kind: "hosted" },
  { name: "docs", path: "apps/docs", kind: "hosted" },
  { name: "landing", path: "apps/landing", kind: "hosted" },
  { name: "self-hosted", path: "infra/self-host", kind: "self-hosted" },
] as const;
export type Target = (typeof targets)[number];
export type Bump = "patch" | "minor" | "major";
export interface Changeset {
  releases: Record<string, Bump>;
  summary: string;
}
export function parseChangeset(source: string): Changeset {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid changeset frontmatter");
  }
  const releases = (parse(match[1] ?? "") ?? {}) as Record<string, Bump>;
  for (const bump of Object.values(releases)) {
    if (!["patch", "minor", "major"].includes(bump)) {
      throw new Error(`Invalid changeset bump: ${bump}`);
    }
  }
  return { releases, summary: match[2] ?? "" };
}
export function splitChangeset(
  source: string,
  names: readonly string[] = targets.map((target) => target.name)
) {
  const { releases, summary } = parseChangeset(source);
  const selected: Record<string, Bump> = {};
  const excluded: Record<string, Bump> = {};
  for (const [name, bump] of Object.entries(releases)) {
    (names.includes(name) ? selected : excluded)[name] = bump;
  }
  const format = (entries: Record<string, Bump>) =>
    Object.keys(entries).length
      ? `---\n${stringify(entries)}---\n${summary}`
      : null;
  return { selected: format(selected), excluded: format(excluded) };
}
export function validateSource(
  base: string,
  head: string,
  sameRepository: boolean
) {
  if (
    base === "main" &&
    (!sameRepository || (head !== "next" && !head.startsWith("hotfix/")))
  ) {
    throw new Error(
      "PRs into main must come from this repository's next or hotfix/* branch"
    );
  }
}
export function validateHotfix(head: string, changesets: Changeset[]) {
  if (
    head.startsWith("hotfix/") &&
    changesets.some((entry) =>
      Object.values(entry.releases).some((bump) => bump !== "patch")
    )
  ) {
    throw new Error("Hotfix changesets must use patch bumps only");
  }
}
export function affectedTargets(
  files: string[],
  workspaces: Workspace[]
): string[] {
  const releasedFiles = files.filter(
    (file) =>
      !(
        file.startsWith(".changeset/") ||
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
      )
  );
  return affectedComponents(releasedFiles, workspaces).filter((name) =>
    targets.some((target) => target.name === name)
  );
}

/** CI/release orchestration changes require validation, not npm version bumps. */
export function npmReleaseTargets(
  files: string[],
  workspaces: Workspace[],
  rootBefore?: Record<string, unknown>,
  rootAfter?: Record<string, unknown>
): string[] {
  const buildInputs = (manifest: Record<string, unknown>) => ({
    ...manifest,
    scripts: Object.fromEntries(
      Object.entries(
        (manifest.scripts ?? {}) as Record<string, unknown>
      ).filter(([name]) => !name.startsWith("release:"))
    ),
  });
  const rootUnchanged =
    rootBefore &&
    rootAfter &&
    isDeepStrictEqual(buildInputs(rootBefore), buildInputs(rootAfter));
  const inputs = files.filter(
    (file) =>
      !(
        /^(\.github\/|tooling\/(delivery|ci)\/)/.test(file) ||
        (file === "package.json" && rootUnchanged)
      )
  );
  return affectedTargets(inputs, workspaces).filter((name) =>
    name.startsWith("@lunarisapp/")
  );
}
