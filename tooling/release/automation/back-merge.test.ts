import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-backmerge-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  const cwd = join(root, "work");
  run("git", ["init", "--bare", remote]);
  run("git", ["clone", remote, cwd]);
  const git = (...args: string[]) => run("git", args, { cwd }).text;
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("checkout", "-b", "main");
  writeFileSync(join(cwd, "value"), "base");
  git("add", ".");
  git("commit", "-m", "base");
  git("push", "origin", "main");
  git("branch", "next");
  git("push", "origin", "next");
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    '#!/bin/sh\nif [ "$2" = list ]; then echo "[]"; else echo "$*" >> "$TEST_GH_LOG"; fi\n',
    { mode: 0o755 }
  );
  const invoke = () =>
    Bun.spawnSync(
      [process.execPath, resolve(import.meta.dir, "back-merge.ts")],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TEST_GH_LOG: join(root, "gh.log"),
        },
      }
    );
  return { root, cwd, git, invoke };
}
test("fast-forwards next and safely repeats a completed back-merge", () => {
  const { cwd, git, invoke } = fixture();
  writeFileSync(join(cwd, "value"), "release");
  git("commit", "-am", "release");
  git("push", "origin", "main");
  expect(invoke().exitCode).toBe(0);
  expect(git("rev-parse", "origin/next")).toBe(git("rev-parse", "origin/main"));
  git("checkout", "main");
  expect(invoke().exitCode).toBe(0);
});
test("conflicted hotfix preserves next and opens a recovery branch", () => {
  const { cwd, git, invoke } = fixture();
  git("checkout", "next");
  writeFileSync(join(cwd, "value"), "feature");
  git("commit", "-am", "feature");
  git("push", "origin", "next");
  const next = git("rev-parse", "HEAD");
  git("checkout", "main");
  writeFileSync(join(cwd, "value"), "hotfix");
  git("commit", "-am", "hotfix");
  git("push", "origin", "main");
  const main = git("rev-parse", "HEAD");
  expect(invoke().exitCode).toBe(0);
  expect(git("rev-parse", "origin/next")).toBe(next);
  expect(git("ls-remote", "--heads", "origin", `back-merge/${main}`)).toContain(
    main
  );
});
test("clean divergent hotfix preserves both histories with a merge commit", () => {
  const { cwd, git, invoke } = fixture();
  git("checkout", "next");
  writeFileSync(join(cwd, "feature"), "feature");
  git("add", ".");
  git("commit", "-m", "feature");
  git("push", "origin", "next");
  const next = git("rev-parse", "HEAD");
  git("checkout", "main");
  writeFileSync(join(cwd, "fix"), "fix");
  git("add", ".");
  git("commit", "-m", "hotfix");
  git("push", "origin", "main");
  const main = git("rev-parse", "HEAD");
  expect(invoke().exitCode).toBe(0);
  expect(git("rev-parse", "origin/next^1")).toBe(next);
  expect(git("rev-parse", "origin/next^2")).toBe(main);
});
