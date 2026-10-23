import { afterEach, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { targets, parseChangeset } from "../release/automation/policy";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
test("version families preserve other pending changesets and restore configuration", () => {
  const cwd = mkdtempSync(join(tmpdir(), "lunaris-family-"));
  roots.push(cwd);
  const put = (path: string, value: unknown) =>
    writeFileSync(join(cwd, path), `${JSON.stringify(value, null, 2)}\n`);
  put("package.json", {
    name: "fixture",
    private: true,
    workspaces: ["apps/*", "packages/*", "infra/*"],
  });
  writeFileSync(join(cwd, "bun.lock"), "");
  mkdirSync(join(cwd, ".changeset"));
  const config = {
    changelog: ["@changesets/cli/changelog", {}],
    commit: false,
    fixed: [],
    linked: [],
    access: "public",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: ["desktop"],
    privatePackages: { version: true, tag: false },
  };
  put(".changeset/config.json", config);
  writeFileSync(
    join(cwd, ".changeset/mixed.md"),
    '---\n"@lunarisapp/plugin-sdk": patch\nself-hosted: minor\napi: patch\ndesktop: patch\n---\n\nShip independently.\n'
  );
  for (const target of [
    ...targets,
    { name: "desktop", path: "apps/desktop", kind: "native" },
  ]) {
    mkdirSync(join(cwd, target.path), { recursive: true });
    put(`${target.path}/package.json`, {
      name: target.name,
      version: "1.0.0",
      private: target.kind !== "npm",
      ...(target.name === "desktop"
        ? { dependencies: { "@lunarisapp/plugin-sdk": "workspace:*" } }
        : {}),
    });
  }
  symlinkSync(resolve("node_modules"), join(cwd, "node_modules"));
  Bun.spawnSync(["git", "init"], { cwd });
  const invoke = (family: string) =>
    Bun.spawnSync(
      [process.execPath, resolve(import.meta.dir, "version-family.ts"), family],
      { cwd }
    );
  const npm = invoke("npm");
  expect(npm.exitCode, npm.stderr.toString()).toBe(0);
  expect(
    JSON.parse(
      readFileSync(join(cwd, "packages/plugin-sdk/package.json"), "utf8")
    ).version
  ).toBe("1.0.1");
  expect(
    parseChangeset(readFileSync(join(cwd, ".changeset/mixed.md"), "utf8"))
      .releases
  ).toEqual({ "self-hosted": "minor", api: "patch", desktop: "patch" });
  expect(
    JSON.parse(readFileSync(join(cwd, ".changeset/config.json"), "utf8"))
  ).toEqual(config);
  const selfhost = invoke("self-hosted");
  expect(selfhost.exitCode, selfhost.stderr.toString()).toBe(0);
  expect(
    JSON.parse(readFileSync(join(cwd, "infra/self-host/package.json"), "utf8"))
      .version
  ).toBe("1.1.0");
  expect(
    parseChangeset(readFileSync(join(cwd, ".changeset/mixed.md"), "utf8"))
      .releases
  ).toEqual({ api: "patch", desktop: "patch" });
  expect(invoke("npm").exitCode).toBe(0);
  expect(
    JSON.parse(
      readFileSync(join(cwd, "packages/plugin-sdk/package.json"), "utf8")
    ).version
  ).toBe("1.0.1");
  const output = join(cwd, "pending-outputs");
  const pending = Bun.spawnSync(
    [
      process.execPath,
      resolve(import.meta.dir, "version-family.ts"),
      "--pending",
      "npm",
    ],
    {
      cwd,
      env: { ...process.env, GITHUB_OUTPUT: output },
    }
  );
  expect(pending.exitCode, pending.stderr.toString()).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("enabled=false\n");
});
