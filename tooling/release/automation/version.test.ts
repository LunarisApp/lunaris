import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { targets } from "./policy";
import { run } from "./process";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("real Changesets versioning preserves native changesets and is idempotent", () => {
  const cwd = mkdtempSync(join(tmpdir(), "lunaris-version-")); roots.push(cwd);
  const put = (path: string, value: unknown) => writeFileSync(join(cwd, path), `${JSON.stringify(value, null, 2)}\n`);
  put("package.json", { name: "fixture", private: true, workspaces: ["apps/*", "packages/*"] });
  writeFileSync(join(cwd, "bun.lock"), "");
  mkdirSync(join(cwd, ".changeset"));
  put(".changeset/config.json", { changelog: ["@changesets/cli/changelog", {}], commit: false, fixed: [], linked: [], access: "public", baseBranch: "main", updateInternalDependencies: "patch", ignore: ["desktop"], privatePackages: { version: true, tag: false } });
  for (const target of [...targets, { name: "desktop", path: "apps/desktop", kind: "native" }]) {
    mkdirSync(join(cwd, target.path), { recursive: true });
    put(`${target.path}/package.json`, { name: target.name, version: "1.0.0", private: target.kind !== "npm" });
  }
  symlinkSync(resolve("node_modules"), join(cwd, "node_modules"));
  run("git", ["init"], { cwd });
  writeFileSync(join(cwd, ".changeset/change.md"), '---\napi: patch\ndesktop: patch\n---\n\nFix.\n');
  const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, "version.ts")], { cwd });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(readFileSync(join(cwd, "apps/api/package.json"), "utf8")).version).toBe("1.0.1");
  expect(JSON.parse(readFileSync(join(cwd, "apps/desktop/package.json"), "utf8")).version).toBe("1.0.0");
  expect(readFileSync(join(cwd, ".changeset/change.md"), "utf8")).toContain("desktop: patch");
  expect(Bun.spawnSync([process.execPath, resolve(import.meta.dir, "version.ts")], { cwd }).exitCode).toBe(0);
  expect(JSON.parse(readFileSync(join(cwd, "apps/api/package.json"), "utf8")).version).toBe("1.0.1");
});
