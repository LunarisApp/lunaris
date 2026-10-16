import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const optionalJobs = [
  "editions",
  "agent-rust",
  "desktop-mcp",
  "sites",
] as const;
export const checks = [
  ...optionalJobs,
  "brand",
  "powersync",
  "release",
] as const;

export function selectChecks(
  files: string[],
  affected: string[],
  full = false
) {
  const all = () => Object.fromEntries(checks.map((name) => [name, true]));
  // Unknown root/tooling inputs must never silently lose coverage.
  const known =
    /^(apps\/|internal\/|packages\/|extensions\/|ee\/|crates\/|assets\/brand\/|infra\/|tooling\/(powersync|generate-brand-assets|release\/)|docs\/|\.changeset\/)/;
  const repositoryDoc = (file: string) =>
    file.startsWith("docs/") || (!file.includes("/") && file.endsWith(".md"));
  if (
    full ||
    files.includes("THIRD-PARTY-NOTICES.md") ||
    files.some((file) => !(known.test(file) || repositoryDoc(file)))
  ) {
    return all();
  }
  // LICENSE inputs remain covered by the full-check fallback above.
  if (files.every(repositoryDoc)) {
    return Object.fromEntries(checks.map((name) => [name, false]));
  }
  const changed = (pattern: RegExp) => files.some((file) => pattern.test(file));
  const has = (...names: string[]) =>
    names.some((name) => affected.includes(name));
  return {
    editions:
      has("api", "web", "desktop") ||
      changed(/^(ee\/|assets\/brand\/|infra\/)/),
    "agent-rust":
      has("cli", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^crates\//),
    "desktop-mcp":
      has("desktop", "@repo/agent-contracts", "@lunarisapp/plugin-sdk") ||
      changed(/^(crates\/|tooling\/mcp|assets\/brand\/)/),
    sites: has("docs", "landing"),
    brand: changed(
      /^(assets\/brand\/|tooling\/generate-brand-assets|apps\/(desktop|web|landing)\/public\/|apps\/desktop\/src-tauri\/icons\/)/
    ),
    powersync:
      has("api", "@repo/data", "@repo/auth") ||
      changed(/^(infra\/|tooling\/powersync)/),
    release: changed(
      /^(tooling\/release\/|\.changeset\/)|\/(package\.json|Cargo\.toml|tauri\.conf\.json)$/
    ),
  };
}

function detect() {
  const base = process.env.CI_BASE_SHA;
  if (process.env.CI_FULL === "true" || !base) {
    return selectChecks([], [], true);
  }
  try {
    const files = execFileSync(
      "git",
      ["diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`],
      { encoding: "utf8" }
    )
      .split("\0")
      .filter(Boolean);
    const result = JSON.parse(
      execFileSync(
        "bun",
        ["x", "--no-install", "turbo", "ls", "--affected", "--output=json"],
        {
          encoding: "utf8",
          env: { ...process.env, TURBO_SCM_BASE: base, TURBO_SCM_HEAD: "HEAD" },
        }
      )
    );
    const items: unknown = result.packages?.items;
    if (
      !Array.isArray(items) ||
      items.some((item) => typeof item.name !== "string")
    ) {
      throw new Error("Unexpected Turbo package list");
    }
    return selectChecks(
      files,
      items.map((item) => item.name)
    );
  } catch (error) {
    console.warn("Change detection failed; running full validation.", error);
    return selectChecks([], [], true);
  }
}

if (import.meta.main) {
  const selected = detect();
  console.log(selected);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(selected)
        .map(([name, value]) => `${name}=${value}\n`)
        .join("")
    );
  }
}
