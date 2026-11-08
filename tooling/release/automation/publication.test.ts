import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(family = false) {
  const root = mkdtempSync(join(tmpdir(), "lunaris-publication-"));
  roots.push(root);
  const cwd = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(bin);
  run("git", ["init", "--bare", join(root, "remote.git")]);
  run("git", ["clone", join(root, "remote.git"), cwd]);
  const git = (...args: string[]) => run("git", args, { cwd }).text;
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("checkout", "-b", "main");
  const entries = [
    ["@lunarisapp/plugin-sdk", "packages/plugin-sdk"],
    ["@lunarisapp/ui", "packages/ui"],
  ].map(([name, path]) => ({
    name,
    path,
    kind: "npm",
    version: "1.0.0",
    tag: `${name}@1.0.0`,
    notes: "Fix.",
  }));
  for (const entry of entries) {
    mkdirSync(join(cwd, entry.path!), { recursive: true });
    writeFileSync(
      join(cwd, entry.path!, "package.json"),
      JSON.stringify({ name: entry.name, version: entry.version })
    );
    writeFileSync(join(cwd, entry.path!, "archive.tgz"), "validated archive");
  }
  git("add", ".");
  git("commit", "-m", "source");
  const sourceCommit = git("rev-parse", "HEAD");
  mkdirSync(join(cwd, ".release"));
  writeFileSync(
    join(cwd, family ? ".release/npm.json" : ".release/manifest.json"),
    JSON.stringify({ ...(family ? {} : { sourceCommit }), releases: entries })
  );
  if (family) {
    writeFileSync(
      join(cwd, ".release/manifest.json"),
      "legacy manifest must not be read"
    );
  }
  git("add", ".");
  git("commit", "-m", "release");
  for (const entry of entries) {
    git("tag", entry.tag);
  }
  git("push", "origin", "main", "--tags");
  const log = join(root, "calls.jsonl");
  const stub = `#!${process.execPath}
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const tool = process.argv[1].split("/").at(-1);
appendFileSync(process.env.CALL_LOG, JSON.stringify({tool,args})+"\\n");
if (tool === "npm" && args[0] === "pack") console.log(JSON.stringify([{filename:"archive.tgz"}]));
if (tool === "gh" && args[1] === "view" && args.includes("isDraft")) {
 console.log(JSON.stringify({isDraft: process.env.PENDING_RELEASE === args[2]}));
}
if (tool === "gh" && args[1] === "edit" && process.env.FAIL_PROMOTION === args[2]) process.exit(1);
`;
  for (const tool of ["gh", "npm"]) {
    writeFileSync(join(bin, tool), stub, { mode: 0o755 });
  }
  const preload = join(root, "fetch.ts");
  writeFileSync(
    preload,
    `globalThis.fetch = async (url) => {
    if (String(url).includes("registry.npmjs.org")) return Response.json({dist:{integrity: String(url).includes("%2Fui") && process.env.FAIL_INTEGRITY ? "wrong" : process.env.EXPECTED_INTEGRITY}});
    return new Response("healthy");
  };`
  );
  const invoke = (
    extra: Record<string, string> = {},
    script?: string,
    args: string[] = []
  ) =>
    Bun.spawnSync(
      [
        process.execPath,
        "--preload",
        preload,
        script ?? resolve(import.meta.dir, "publish-npm.ts"),
        ...args,
      ],
      {
        cwd,
        env: {
          ...process.env,
          RELEASE_FAMILY: family ? "npm" : "",
          PATH: `${bin}:${process.env.PATH}`,
          CALL_LOG: log,
          RUNNER_TEMP: mkdtempSync(join(root, "runner-")),
          GITHUB_STEP_SUMMARY: join(root, "summary"),
          EXPECTED_INTEGRITY: `sha512-${createHash("sha512").update("validated archive").digest("base64")}`,
          ...extra,
        },
      }
    );
  const calls = () =>
    (existsSync(log) ? readFileSync(log, "utf8") : "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { tool: string; args: string[] });
  const promoted = () =>
    calls()
      .filter(({ tool, args }) => tool === "gh" && args[1] === "edit")
      .map(({ args }) => args[2]);
  return { invoke, calls, promoted, git, cwd };
}

test("family publication reads its own manifest and permits validated older trunk commits", () => {
  const f = fixture(true);
  const release = f.git("rev-parse", "HEAD");
  writeFileSync(join(f.cwd, "later.txt"), "newer trunk commit");
  f.git("add", ".");
  f.git("commit", "-m", "later trunk commit");
  f.git("push", "origin", "main");
  f.git("checkout", release);
  const result = f.invoke();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(f.promoted()).toEqual([
    "@lunarisapp/plugin-sdk@1.0.0",
    "@lunarisapp/ui@1.0.0",
  ]);
});

test("family planning recovers older pending versions after newer version PRs merge", () => {
  const f = fixture(true);
  const original = f.git("rev-parse", "HEAD");
  const path = join(f.cwd, ".release/npm.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  for (const entry of manifest.releases) {
    entry.version = "1.1.0";
    entry.tag = `${entry.name}@1.1.0`;
  }
  writeFileSync(path, JSON.stringify(manifest));
  f.git("add", ".");
  f.git("commit", "-m", "new version PR");
  f.git("push", "origin", "main");
  const output = join(f.cwd, "outputs");
  const result = f.invoke(
    { PENDING_RELEASE: "@lunarisapp/plugin-sdk@1.0.0", GITHUB_OUTPUT: output },
    resolve(import.meta.dir, "../../delivery/artifact-release.ts"),
    ["plan"]
  );
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readFileSync(output, "utf8")).toContain(`sha=${original}`);
});

test("family planning selects the merged trunk tree rather than a version PR parent", () => {
  const f = fixture(true);
  f.git("checkout", "-b", "version-pr");
  const path = join(f.cwd, ".release/npm.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  for (const entry of manifest.releases) {
    entry.version = "1.1.0";
    entry.tag = `${entry.name}@1.1.0`;
  }
  writeFileSync(path, JSON.stringify(manifest));
  f.git("add", ".");
  f.git("commit", "-m", "version PR");
  f.git("checkout", "main");
  writeFileSync(
    join(f.cwd, "new-source.txt"),
    "code merged while version PR was open"
  );
  f.git("add", ".");
  f.git("commit", "-m", "new source");
  f.git("merge", "--no-ff", "version-pr", "-m", "merge version PR");
  const merged = f.git("rev-parse", "HEAD");
  f.git("push", "origin", "main");
  const output = join(f.cwd, "outputs");
  const result = f.invoke(
    { PENDING_RELEASE: "@lunarisapp/plugin-sdk@1.1.0", GITHUB_OUTPUT: output },
    resolve(import.meta.dir, "../../delivery/artifact-release.ts"),
    ["plan"]
  );
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readFileSync(output, "utf8")).toContain(`sha=${merged}`);
});

test("npm recovery promotes verified existing versions, including reruns, without republishing", () => {
  const f = fixture();
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.invoke();
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  }
  expect(f.promoted()).toEqual([
    "@lunarisapp/plugin-sdk@1.0.0",
    "@lunarisapp/ui@1.0.0",
    "@lunarisapp/plugin-sdk@1.0.0",
    "@lunarisapp/ui@1.0.0",
  ]);
  expect(
    f.calls().some(({ tool, args }) => tool === "npm" && args[0] === "publish")
  ).toBe(false);
});

test("later npm integrity failure keeps that draft without hiding successful SDK", () => {
  const f = fixture();
  const result = f.invoke({ FAIL_INTEGRITY: "true" });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("different bytes");
  expect(f.promoted()).toEqual(["@lunarisapp/plugin-sdk@1.0.0"]);
});

test("GitHub promotion failure fails the job and can retry without republishing", () => {
  const f = fixture();
  expect(
    f.invoke({ FAIL_PROMOTION: "@lunarisapp/plugin-sdk@1.0.0" }).exitCode
  ).not.toBe(0);
  expect(f.invoke().exitCode).toBe(0);
  expect(
    f.calls().some(({ tool, args }) => tool === "npm" && args[0] === "publish")
  ).toBe(false);
});
