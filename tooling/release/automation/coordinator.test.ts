import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./process";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-coordinator-")); roots.push(root);
  const cwd = join(root, "work");
  const remote = join(root, "remote.git");
  run("git", ["init", "--bare", remote]); run("git", ["clone", remote, cwd]);
  const git = (...args: string[]) => run("git", args, { cwd }).text;
  git("config", "user.name", "Test"); git("config", "user.email", "test@example.com"); git("checkout", "-b", "main");
  mkdirSync(join(cwd, "apps/api"), { recursive: true });
  writeFileSync(join(cwd, "apps/api/package.json"), JSON.stringify({ name: "api", version: "1.0.1" }));
  git("add", "."); git("commit", "-m", "source");
  const source = git("rev-parse", "HEAD");
  mkdirSync(join(cwd, ".release"));
  writeFileSync(join(cwd, ".release/manifest.json"), JSON.stringify({ sourceCommit: source, releases: [{ name: "api", path: "apps/api", kind: "hosted", version: "1.0.1", tag: "api@1.0.1", notes: "Fix." }] }));
  git("add", "."); git("commit", "-m", "chore(release): version packages"); git("push", "origin", "main");
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "gh"), '#!/bin/sh\nprintf \'[{"tag_name":"api@1.0.1"}]\'\n', { mode: 0o755 });
  const invoke = (mode: string) => Bun.spawnSync([process.execPath, resolve(import.meta.dir, "coordinate.ts"), mode], { cwd, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "fixture/repo" } });
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
  git("tag", "api@1.0.1", source); git("push", "origin", "api@1.0.1");
  const result = invoke("tags");
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("points at another commit");
  expect(git("rev-parse", "api@1.0.1")).toBe(source);
});
