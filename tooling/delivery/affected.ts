import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

export interface Workspace {
  dependencies: string[];
  name: string;
  path: string;
}

export const components = [
  "api",
  "web",
  "landing",
  "docs",
  "cli",
  "desktop",
  "self-hosted",
  "@lunarisapp/plugin-sdk",
  "@lunarisapp/ui",
] as const;
export type Component = (typeof components)[number];

export function readWorkspaces(): Workspace[] {
  return ["apps", "packages", "internal", "extensions", "ee", "infra"].flatMap(
    (directory) =>
      existsSync(directory)
        ? readdirSync(directory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .flatMap((entry) => {
              const path = `${directory}/${entry.name}`;
              if (!existsSync(`${path}/package.json`)) {
                return [];
              }
              const manifest = JSON.parse(
                readFileSync(`${path}/package.json`, "utf8")
              );
              return [
                {
                  name: manifest.name,
                  path,
                  dependencies: Object.keys({
                    ...manifest.dependencies,
                    ...manifest.devDependencies,
                    ...manifest.peerDependencies,
                    ...manifest.optionalDependencies,
                  }),
                },
              ];
            })
        : []
  );
}

/** One dependency closure for CI, deployment selection and release policy. */
export function affectedWorkspaces(
  files: string[],
  workspaces: Workspace[]
): string[] {
  const changed = new Set<string>();
  for (const file of files) {
    for (const workspace of workspaces) {
      if (file.startsWith(`${workspace.path}/`)) {
        changed.add(workspace.name);
      }
    }
  }
  let previous = -1;
  while (previous !== changed.size) {
    previous = changed.size;
    for (const workspace of workspaces) {
      if (workspace.dependencies.some((name) => changed.has(name))) {
        changed.add(workspace.name);
      }
    }
  }
  return [...changed];
}

export function repositoryDoc(file: string): boolean {
  return (
    file.startsWith("docs/") ||
    /(^|\/)(README|AGENTS|CHANGELOG)\.md$/.test(file) ||
    (!file.includes("/") &&
      file.endsWith(".md") &&
      file !== "THIRD-PARTY-NOTICES.md")
  );
}

export function requiresFullValidation(
  files: string[],
  workspaces = readWorkspaces()
): boolean {
  return files.some(
    (file) =>
      !(
        repositoryDoc(file) ||
        // Repository administration never enters application images. Tooling tests remain unconditional in CI.
        /^tooling\/delivery\/(?:cutover(?:\.integration)?(?:\.test)?|repository-settings)\.ts$/.test(
          file
        ) ||
        workspaces.some((workspace) => file.startsWith(`${workspace.path}/`)) ||
        /^(crates\/|assets\/brand\/|infra\/(local|hosted|self-host)\/|tooling\/(powersync|generate-brand-assets|release\/|self-host\/)|\.changeset\/|\.release\/)/.test(
          file
        )
      )
  );
}

export function changedFiles(base: string, head = "HEAD"): string[] {
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", base, head],
    { encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
}

export function affectedComponents(
  files: string[],
  workspaces = readWorkspaces()
): Component[] {
  if (requiresFullValidation(files, workspaces)) {
    return [...components];
  }
  const affected = new Set(
    affectedWorkspaces(
      files.filter((file) => !repositoryDoc(file)),
      workspaces
    )
  );
  if (files.some((file) => /^(crates\/|Cargo\.)/.test(file))) {
    affected.add("cli");
    affected.add("desktop");
  }
  if (
    files.some((file) =>
      /^(assets\/brand\/|tooling\/generate-brand-assets)/.test(file)
    )
  ) {
    for (const component of [
      "api",
      "web",
      "landing",
      "docs",
      "desktop",
    ] as const) {
      affected.add(component);
    }
  }
  if (
    files.some(
      (file) =>
        file.startsWith("infra/hosted/") ||
        file === "infra/self-host/Dockerfile"
    )
  ) {
    affected.add("api");
    affected.add("web");
  }
  if (
    files.some((file) =>
      /^(infra\/local\/config\/|tooling\/powersync)/.test(file)
    )
  ) {
    affected.add("api");
  }
  if (
    files.some((file) =>
      /^(infra\/self-host\/|tooling\/self-host\/)/.test(file)
    )
  ) {
    affected.add("self-hosted");
  }
  if (affected.has("api") || affected.has("web")) {
    affected.add("self-hosted");
  }
  return components.filter((component) => affected.has(component));
}
