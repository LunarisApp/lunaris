import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const source = resolve(root, "infra/self-host");
const repositories = {
  api: "ghcr.io/lunarisapp/lunaris-api",
  web: "ghcr.io/lunarisapp/lunaris-web",
} as const;
export interface BundleOptions {
  apiImage: string;
  directory: string;
  local?: boolean;
  sourceCommit: string;
  version: string;
  webImage: string;
}

/** Only release-owned files are copied: .env and operator overrides never ship. */
export function createBundle(options: BundleOptions) {
  if (!/^\d+\.\d+\.\d+$/.test(options.version)) {
    throw new Error("Invalid self-hosted release version");
  }
  if (!/^[a-f0-9]{40}$/.test(options.sourceCommit)) {
    throw new Error("Full source commit required");
  }
  const images = { api: options.apiImage, web: options.webImage };
  for (const [service, reference] of Object.entries(images)) {
    const repository = repositories[service as keyof typeof repositories];
    if (
      !(
        options.local ||
        new RegExp(`^${repository}@sha256:[a-f0-9]{64}$`).test(reference)
      )
    ) {
      throw new Error(`Expected digest-pinned ${service} release image`);
    }
    if (/\s|\$/.test(reference)) {
      throw new Error("Invalid image reference");
    }
  }
  mkdirSync(options.directory, { recursive: false });
  for (const file of [
    "install.sh",
    "ports.auto.yaml",
    "ports.external.yaml",
    ".env.example",
    "garage.toml",
    "powersync.yaml",
    "postgres-setup.sql",
    "smoke.sh",
    "README.md",
  ]) {
    cpSync(resolve(source, file), resolve(options.directory, file));
  }
  cpSync(
    resolve(root, "infra/local/config/sync_rules.yaml"),
    resolve(options.directory, "sync_rules.yaml")
  );
  cpSync(resolve(root, "LICENSE"), resolve(options.directory, "LICENSE"));
  let compose = readFileSync(resolve(source, "compose.yaml"), "utf8");
  for (const [service, reference] of Object.entries(images)) {
    compose = compose.replace(
      `${repositories[service as keyof typeof repositories]}:0.0.0`,
      reference
    );
  }
  writeFileSync(resolve(options.directory, "compose.yaml"), compose);
  writeFileSync(
    resolve(options.directory, "release.json"),
    `${JSON.stringify(
      {
        version: options.version,
        sourceCommit: options.sourceCommit,
        images,
      },
      null,
      2
    )}\n`
  );
}

if (import.meta.main) {
  const [directory, version, sourceCommit, apiImage, webImage, mode] =
    process.argv.slice(2);
  if (!(directory && version && sourceCommit && apiImage && webImage)) {
    throw new Error(
      "Usage: bundle.ts <new-directory> <version> <source-commit> <api-image> <web-image> [--local]"
    );
  }
  createBundle({
    directory: resolve(directory),
    version,
    sourceCommit,
    apiImage,
    webImage,
    local: mode === "--local",
  });
}
