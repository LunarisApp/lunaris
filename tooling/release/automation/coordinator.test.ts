import { spawnSync } from "bun";
import { afterEach, expect, test } from "bun:test";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./process";
import { targets } from "./policy";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-coordinator-"));
  roots.push(root);
  const cwd = join(root, "work");
  const remote = join(root, "remote.git");
  run("git", ["init", "--bare", remote]);
  run("git", ["clone", remote, cwd]);
  const git = (...args: string[]) => run("git", args, { cwd }).text;
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("checkout", "-b", "main");
  mkdirSync(join(cwd, "apps/api"), { recursive: true });
  writeFileSync(
    join(cwd, "apps/api/package.json"),
    JSON.stringify({ name: "api", version: "1.0.1" })
  );
  git("add", ".");
  git("commit", "-m", "source");
  const source = git("rev-parse", "HEAD");
  mkdirSync(join(cwd, ".release"));
  writeFileSync(
    join(cwd, ".release/manifest.json"),
    JSON.stringify({
      sourceCommit: source,
      releases: [
        {
          name: "api",
          path: "apps/api",
          kind: "hosted",
          version: "1.0.1",
          tag: "api@1.0.1",
          notes: "Fix.",
        },
      ],
    })
  );
  git("add", ".");
  git("commit", "-m", "chore(release): version packages");
  git("push", "origin", "main");
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    '#!/bin/sh\nprintf \'[{"tag_name":"api@1.0.1"}]\'\n',
    { mode: 0o755 }
  );
  const invoke = (mode: string) =>
    spawnSync(
      [process.execPath, resolve(import.meta.dir, "coordinate.ts"), mode],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "fixture/repo",
        },
      }
    );
  return { cwd, git, source, invoke };
}
test("version retry reuses committed manifest; tag retry preserves the same commit", () => {
  const { git, invoke } = fixture();
  const head = git("rev-parse", "HEAD");
  expect(invoke("version").exitCode).toBe(0);
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(invoke("tags").exitCode).toBe(0);
  expect(invoke("tags").exitCode).toBe(0);
  expect(git("rev-parse", "api@1.0.1")).toBe(head);
});
test("existing conflicting tag is rejected without moving it", () => {
  const { git, source, invoke } = fixture();
  git("tag", "api@1.0.1", source);
  git("push", "origin", "api@1.0.1");
  const result = invoke("tags");
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("points at another commit");
  expect(git("rev-parse", "api@1.0.1")).toBe(source);
});

test("fresh changesets release formats JSON and pushes its version commit", () => {
  const root = mkdtempSync(join(tmpdir(), "lunaris-fresh-release-"));
  roots.push(root);
  const cwd = join(root, "work");
  const remote = join(root, "remote.git");
  run("git", ["init", "--bare", remote]);
  run("git", ["clone", remote, cwd]);
  const git = (...args: string[]) => run("git", args, { cwd }).text;
  const put = (path: string, value: unknown) =>
    writeFileSync(join(cwd, path), `${JSON.stringify(value, null, 2)}\n`);
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("checkout", "-b", "main");
  put("package.json", {
    name: "fixture",
    private: true,
    workspaces: ["apps/*", "packages/*", "infra/*"],
  });
  writeFileSync(join(cwd, "bun.lock"), "");
  writeFileSync(join(cwd, ".gitignore"), "node_modules/\n");
  for (const directory of [".changeset", "internal", "extensions", "ee"]) {
    mkdirSync(join(cwd, directory));
    writeFileSync(join(cwd, directory, ".gitkeep"), "");
  }
  put(".changeset/config.json", {
    changelog: ["@changesets/cli/changelog", {}],
    commit: false,
    fixed: [],
    linked: [],
    access: "public",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: [],
    privatePackages: { version: true, tag: false },
  });
  for (const target of targets) {
    mkdirSync(join(cwd, target.path), { recursive: true });
    put(`${target.path}/package.json`, {
      name: target.name,
      version: "1.0.0",
      private: target.kind !== "npm",
    });
  }
  copyFileSync(resolve("biome.jsonc"), join(cwd, "biome.jsonc"));
  symlinkSync(resolve("node_modules"), join(cwd, "node_modules"));
  writeFileSync(
    join(cwd, ".changeset/change.md"),
    `---\n${targets.map(({ name }) => `${JSON.stringify(name)}: patch`).join("\n")}\n---\n\nFix.\n`
  );
  git("add", ".");
  git("commit", "-m", "source");
  git("push", "origin", "main");
  const source = git("rev-parse", "HEAD");
  const outputPath = join(root, "outputs");
  const result = spawnSync(
    [process.execPath, resolve(import.meta.dir, "coordinate.ts"), "version"],
    {
      cwd,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_OUTPUT: outputPath,
      },
    }
  );
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const head = git("rev-parse", "HEAD");
  expect(head).not.toBe(source);
  expect(git("rev-parse", "origin/main")).toBe(head);
  expect(git("rev-parse", "HEAD^")).toBe(source);
  expect(git("status", "--porcelain")).toBe("");
  const manifest = JSON.parse(
    readFileSync(join(cwd, ".release/manifest.json"), "utf8")
  );
  expect(manifest.sourceCommit).toBe(source);
  expect(manifest.releases).toHaveLength(targets.length);
  for (const target of targets) {
    expect(
      JSON.parse(readFileSync(join(cwd, target.path, "package.json"), "utf8"))
        .version
    ).toBe("1.0.1");
    expect(manifest.releases).toContainEqual({
      ...target,
      version: "1.0.1",
      tag: `${target.name}@1.0.1`,
      notes: expect.any(String),
    });
  }
  expect(readFileSync(outputPath, "utf8")).toContain(`sha=${head}`);
  expect(readFileSync(outputPath, "utf8")).toContain("publish=true");
}, 30_000);
