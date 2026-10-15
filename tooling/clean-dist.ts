import { mkdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const packageDirectory = process.cwd();
const parent = basename(dirname(packageDirectory));
const packageName = basename(packageDirectory);
const allowedPackages = new Set([
  "apps/api",
  "packages/plugin-sdk",
  "packages/ui",
]);
const packageId = `${parent}/${packageName}`;

if (!allowedPackages.has(packageId)) {
  throw new Error("clean-dist must run from an allowed package directory");
}

const dist = resolve(packageDirectory, "dist");
rmSync(dist, { force: true, recursive: true });
mkdirSync(dist);
