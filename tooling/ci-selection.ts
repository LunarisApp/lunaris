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

export function selectChecks(
  files: string[],
  affected: string[],
  full = false
) {
  affected = [...new Set([...affected, ...affectedComponents(files)])];
  if (full || requiresFullValidation(files)) {
    return Object.fromEntries(checks.map((name) => [name, true]));
  }
  if (files.every(repositoryDoc)) {
    return Object.fromEntries(checks.map((name) => [name, false]));
  }
  const changed = (pattern: RegExp) => files.some((file) => pattern.test(file));
  const has = (...names: string[]) =>
    names.some((name) => affected.includes(name));
  return {
    editions:
      has("api", "web", "desktop") || changed(/^(ee\/|assets\/brand\/)/),
    "agent-rust":
      has("cli", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^crates\//),
    "desktop-mcp":
      has("desktop", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^(crates\/|tooling\/mcp|assets\/brand\/)/),
    "desktop-platforms":
      has("desktop", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^(crates\/|tooling\/mcp|assets\/brand\/)/),
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
    selected = selectChecks(files, affected);
    if (requiresFullValidation(files)) {
      affected = readWorkspaces().map(({ name }) => name);
    }
  } catch (error) {
    console.warn("Running full validation:", String(error));
    selected = selectChecks([], [], true);
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
