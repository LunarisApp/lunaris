import { appendFileSync } from "node:fs";
import {
  affectedWorkspaces,
  affectedComponents,
  changedFiles,
  readWorkspaces,
  repositoryDoc,
  requiresFullValidation,
} from "./delivery/affected";

export const optionalJobs = [
  "editions",
  "agent-rust",
  "desktop-mcp",
  "desktop-platforms",
  "landing",
  "docs",
  "self-hosted",
  "smoke",
] as const;
export const checks = [
  ...optionalJobs,
  "brand",
  "powersync",
  "release",
  "public-packages",
] as const;

// Only presentation paths covered by the edition frontend builds belong here.
const desktopPresentationPaths = [
  "packages/ui/src/**/*.{tsx,css}",
  "internal/features/src/announcements/**/*.{tsx,css}",
  "internal/workspaces/src/routes/workspaces.tsx",
  "internal/agent-work/src/message.{tsx,css}",
  "extensions/{file,kanban}/src/components/**/*.{tsx,css}",
  "extensions/rich-text/src/entity-reference-inline.tsx",
  "extensions/rich-text/src/styles.css",
].map((pattern) => new Bun.Glob(pattern));

export function selectChecks(
  files: string[],
  affected: string[],
  mode: "affected" | "pull-request" | "full" = "affected"
) {
  affected = [...new Set([...affected, ...affectedComponents(files)])];
  if (mode === "full" || requiresFullValidation(files)) {
    return Object.fromEntries(checks.map((name) => [name, true]));
  }
  if (files.every(repositoryDoc)) {
    return Object.fromEntries(checks.map((name) => [name, false]));
  }
  const changed = (pattern: RegExp) => files.some((file) => pattern.test(file));
  const has = (...names: string[]) =>
    names.some((name) => affected.includes(name));
  const sourceFiles = files.filter(
    (file) => !(repositoryDoc(file) || /^\.changeset\/[^/]+\.md$/.test(file))
  );
  const presentationOnlyPR =
    mode === "pull-request" &&
    sourceFiles.length > 0 &&
    sourceFiles.every((file) =>
      desktopPresentationPaths.some((path) => path.match(file))
    );
  const nativeDesktop =
    !presentationOnlyPR &&
    (has("desktop", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^(crates\/|tooling\/mcp|assets\/brand\/)/));
  return {
    editions:
      has("api", "web", "desktop") || changed(/^(ee\/|assets\/brand\/)/),
    "agent-rust":
      has("cli", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^crates\//),
    "desktop-mcp": nativeDesktop,
    "desktop-platforms": nativeDesktop,
    landing: has("landing"),
    docs: has("docs"),
    // Complete installer coverage belongs to packaging changes and release candidates.
    "self-hosted": changed(/^(infra\/|tooling\/(editions\/|self-host\/))/),
    smoke:
      has("api", "web", "@repo/data", "@repo/auth") ||
      changed(/^infra\/local\//),
    brand: changed(
      /^(assets\/brand\/|tooling\/generate-brand-assets|apps\/(desktop|web|landing)\/public\/|apps\/desktop\/src-tauri\/icons\/)/
    ),
    powersync:
      has("api", "@repo/data", "@repo/auth") ||
      changed(/^(infra\/|tooling\/powersync)/),
    release: changed(
      /^(tooling\/release\/|\.changeset\/|\.release\/)|\/(package\.json|Cargo\.toml|tauri\.conf\.json)$/
    ),
    "public-packages": has("@lunarisapp/plugin-sdk", "@lunarisapp/ui"),
  };
}

if (import.meta.main) {
  let selected: ReturnType<typeof selectChecks>;
  let affected: string[] = [];
  try {
    const base = process.env.CI_BASE_SHA;
    if (!base || /^0+$/.test(base) || process.env.CI_FULL === "true") {
      throw new Error("Full validation requested");
    }
    const files = changedFiles(base);
    affected = affectedWorkspaces(files, readWorkspaces());
    affected = [...new Set([...affected, ...affectedComponents(files)])];
    selected = selectChecks(
      files,
      affected,
      process.env.GITHUB_EVENT_NAME === "pull_request"
        ? "pull-request"
        : "affected"
    );
    if (requiresFullValidation(files)) {
      affected = readWorkspaces().map(({ name }) => name);
    }
  } catch (error) {
    console.warn("Running full validation:", String(error));
    selected = selectChecks([], [], "full");
    affected = readWorkspaces().map(({ name }) => name);
  }
  if (process.env.CI_SHADOW === "true") {
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `Proposed affected checks: ${JSON.stringify(selected)}\n`
      );
    }
    // Keep legacy broad JS/package/installer coverage until trunk cutover.
    selected["self-hosted"] ||= affected.some((name) =>
      ["api", "web", "self-hosted"].includes(name)
    );
    selected["public-packages"] = true;
    affected = readWorkspaces().map(({ name }) => name);
  }
  // An empty affected set must never turn into an unfiltered Turbo invocation.
  const filters = affected.length
    ? affected.map((name) => `--filter=${name}`)
    : ["--filter=__no_affected_workspace__"];
  console.log(selected);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${[
        ...Object.entries(selected).map(([name, value]) => `${name}=${value}`),
        `filters=${JSON.stringify(filters)}`,
      ].join("\n")}\n`
    );
  }
}
