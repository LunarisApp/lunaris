import { afterEach, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});
function run(cwd: string, command: string[]) {
  const result = Bun.spawnSync(command, {
    cwd,
    env: { ...process.env, HUSKY: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}
function git(cwd: string, ...args: string[]) {
  const result = run(cwd, ["git", ...args]);
  if (result.status !== 0) {
    throw new Error(result.output);
  }
  return result.output.trim();
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "lunaris-precommit-"));
  fixtures.push(cwd);
  symlinkSync(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  writeFileSync(join(cwd, ".gitignore"), "node_modules\n");
  writeFileSync(
    join(cwd, "biome.jsonc"),
    readFileSync(join(root, "biome.jsonc"))
  );
  const config = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ private: true, "lint-staged": config["lint-staged"] })
  );
  writeFileSync(
    join(cwd, "example.ts"),
    "export const first = 1;\n\nexport const second = 2;\n"
  );
  writeFileSync(join(cwd, "unrelated.ts"), "export const unrelated = 1;\n");
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "Hook test");
  git(cwd, "config", "user.email", "hook-test@example.invalid");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "fixture");
  return cwd;
}
function hook(cwd: string) {
  return run(cwd, ["sh", join(root, ".husky/pre-commit")]);
}

test("pre-commit formats staged content and preserves unstaged edits", () => {
  const cwd = fixture();
  writeFileSync(
    join(cwd, "example.ts"),
    "export const first=3;\n\nexport const second = 2;\n"
  );
  git(cwd, "add", "example.ts");
  writeFileSync(
    join(cwd, "example.ts"),
    "export const first=3;\n\nexport const second = 4;\n"
  );
  const unrelated = "export const unrelated=  9\n";
  writeFileSync(join(cwd, "unrelated.ts"), unrelated);
  const result = hook(cwd);
  expect(result, result.output).toMatchObject({ status: 0 });
  expect(git(cwd, "show", ":example.ts")).toBe(
    "export const first = 3;\n\nexport const second = 2;"
  );
  expect(readFileSync(join(cwd, "example.ts"), "utf8")).toBe(
    "export const first = 3;\n\nexport const second = 4;\n"
  );
  expect(readFileSync(join(cwd, "unrelated.ts"), "utf8")).toBe(unrelated);
  expect(git(cwd, "diff", "--cached", "--name-only")).toBe("example.ts");
}, 30_000);

test("failed pre-commit restores index/worktree and preserves an existing stash", () => {
  const cwd = fixture();
  writeFileSync(join(cwd, "unrelated.ts"), "export const unrelated = 8;\n");
  git(cwd, "stash", "push", "-qm", "existing stash");
  const stash = git(cwd, "stash", "list", "--format=%H");
  writeFileSync(
    join(cwd, "example.ts"),
    "export const first=missingValue;\n\nexport const second = 2;\n"
  );
  git(cwd, "add", "example.ts");
  writeFileSync(
    join(cwd, "example.ts"),
    "export const first=missingValue;\n\nexport const second = 4;\n"
  );
  const index = git(cwd, "diff", "--cached");
  const worktree = git(cwd, "diff");
  const result = hook(cwd);
  expect(result.status, result.output).not.toBe(0);
  expect(result.output).toContain("missingValue");
  expect(git(cwd, "diff", "--cached")).toBe(index);
  expect(git(cwd, "diff")).toBe(worktree);
  expect(git(cwd, "stash", "list", "--format=%H")).toBe(stash);
}, 30_000);
