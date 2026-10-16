import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const checkOnly = process.argv.includes("--check");

interface PackageManifest {
  name: string;
  version: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
}

function cargoPackageVersion(path: string): string {
  const source = readFileSync(resolve(root, path), "utf8");
  const packageSection = source.match(
    /\[package\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/
  )?.[1];
  const version = packageSection?.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) {
    throw new Error(`Cannot find [package] version in ${path}`);
  }
  return version;
}

function updateCargoPackageVersion(path: string, version: string) {
  const absolutePath = resolve(root, path);
  const source = readFileSync(absolutePath, "utf8");
  let replaced = false;
  const next = source.replace(
    /(\[package\][\s\S]*?^\s*version\s*=\s*")[^"]+(")/m,
    (_match, before: string, after: string) => {
      replaced = true;
      return `${before}${version}${after}`;
    }
  );
  if (!replaced) {
    throw new Error(`Cannot update [package] version in ${path}`);
  }
  writeFileSync(absolutePath, next, "utf8");
}

function updateJsonVersion(path: string, version: string) {
  const absolutePath = resolve(root, path);
  const source = readFileSync(absolutePath, "utf8");
  const next = source.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  if (next === source && !source.includes(`"version": "${version}"`)) {
    throw new Error(`Cannot update JSON version in ${path}`);
  }
  writeFileSync(absolutePath, next, "utf8");
}

function runCargoUpdate(
  manifestPath: string,
  packageName: string,
  version: string
) {
  const result = spawnSync(
    "cargo",
    [
      "update",
      "--manifest-path",
      resolve(root, manifestPath),
      "-p",
      packageName,
      "--precise",
      version,
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `Failed to update ${packageName} lockfile:\n${result.stderr || result.stdout}`
    );
  }
}

function assertVersion(label: string, actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`${label} is ${actual}; expected ${expected}`);
  }
}

const cliPackage = readJson<PackageManifest>("apps/cli/package.json");
const desktopPackage = readJson<PackageManifest>("apps/desktop/package.json");
const tauriConfig = readJson<{ version: string }>(
  "apps/desktop/src-tauri/tauri.conf.json"
);

if (checkOnly) {
  assertVersion(
    "CLI Cargo version",
    cargoPackageVersion("apps/cli/Cargo.toml"),
    cliPackage.version
  );
  assertVersion(
    "Desktop Cargo version",
    cargoPackageVersion("apps/desktop/src-tauri/Cargo.toml"),
    desktopPackage.version
  );
  assertVersion(
    "Desktop Tauri version",
    tauriConfig.version,
    desktopPackage.version
  );
  console.log(
    `Release versions valid: cli=${cliPackage.version}, desktop=${desktopPackage.version}`
  );
  process.exit(0);
}

updateCargoPackageVersion("apps/cli/Cargo.toml", cliPackage.version);
updateCargoPackageVersion(
  "apps/desktop/src-tauri/Cargo.toml",
  desktopPackage.version
);
updateJsonVersion(
  "apps/desktop/src-tauri/tauri.conf.json",
  desktopPackage.version
);

runCargoUpdate("apps/cli/Cargo.toml", "lunaris-cli", cliPackage.version);
runCargoUpdate(
  "apps/desktop/src-tauri/Cargo.toml",
  "lunaris-desktop",
  desktopPackage.version
);

console.log(
  `Synchronized release versions: cli=${cliPackage.version}, desktop=${desktopPackage.version}`
);
