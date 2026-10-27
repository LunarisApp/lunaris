import { readFileSync, writeFileSync } from "node:fs";
import { stableVersion } from "./product";
import { run } from "../release/automation/process";

const version = process.env.PRODUCT_VERSION;
if (!(version && stableVersion.test(version))) {
  throw new Error("Stable PRODUCT_VERSION required");
}
for (const directory of ["apps/cli", "apps/desktop", "infra/self-host"]) {
  const path = `${directory}/package.json`;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.version = version;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
for (const path of [
  "apps/cli/Cargo.toml",
  "apps/desktop/src-tauri/Cargo.toml",
]) {
  const source = readFileSync(path, "utf8");
  const next = source.replace(
    /(\[package\][\s\S]*?^version\s*=\s*")[^"]+/m,
    (_match, before: string) => `${before}${version}`
  );
  if (source === next && !source.includes(`version = "${version}"`)) {
    throw new Error(`Cannot version ${path}`);
  }
  writeFileSync(path, next);
}
const tauriPath = "apps/desktop/src-tauri/tauri.conf.json";
const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
tauri.version = version;
writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);
run("cargo", ["update", "--workspace"]);
run("bun", ["install", "--lockfile-only", "--ignore-scripts"]);
