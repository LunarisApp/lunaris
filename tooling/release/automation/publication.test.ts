import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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

function fixture(kind: "npm" | "hosted") {
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
  const entries = (
    kind === "npm"
      ? [
          ["@lunarisapp/plugin-sdk", "packages/plugin-sdk"],
          ["@lunarisapp/ui", "packages/ui"],
        ]
      : [
          ["web", "apps/web"],
          ["docs", "apps/docs"],
        ]
  ).map(([name, path]) => ({
    name,
    path,
    kind,
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
    join(cwd, ".release/manifest.json"),
    JSON.stringify({ sourceCommit, releases: entries })
  );
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
if (tool === "gh" && args[1] === "view") console.log(JSON.stringify({assets:[]}));
if (tool === "gh" && args[1] === "edit" && process.env.FAIL_PROMOTION === args[2]) process.exit(1);
if (tool === "railway") {
 const service = args[args.indexOf("--service")+1];
 if (args[0] === "up") console.log(JSON.stringify({deploymentId:service}));
 else console.log(JSON.stringify([{id:service,status:service===process.env.FAIL_SERVICE?"FAILED":"SUCCESS"}]));
}
`;
  for (const tool of ["gh", "npm", "railway"]) {
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
  const service = (n: number) =>
    `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const destination = (n: number) => ({
    project: service(9),
    environment: service(8),
    service: service(n),
    healthUrl: "https://fixture.test/health",
  });
  const invoke = (extra: Record<string, string> = {}) =>
    Bun.spawnSync(
      [
        process.execPath,
        "--preload",
        preload,
        resolve(
          import.meta.dir,
          kind === "npm" ? "publish-npm.ts" : "deploy-hosted.ts"
        ),
      ],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          CALL_LOG: log,
          RUNNER_TEMP: root,
          GITHUB_STEP_SUMMARY: join(root, "summary"),
          EXPECTED_INTEGRITY: `sha512-${createHash("sha512").update("validated archive").digest("base64")}`,
          RAILWAY_RELEASE_TARGETS: JSON.stringify({
            web: [destination(1), destination(2)],
            docs: [destination(3)],
          }),
          ...extra,
        },
      }
    );
  const calls = () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { tool: string; args: string[] });
  const promoted = () =>
    calls()
      .filter(({ tool, args }) => tool === "gh" && args[1] === "edit")
      .map(({ args }) => args[2]);
  return { invoke, calls, promoted, service };
}

test("npm recovery promotes verified existing versions, including reruns, without republishing", () => {
  const f = fixture("npm");
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
  const f = fixture("npm");
  const result = f.invoke({ FAIL_INTEGRITY: "true" });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("different bytes");
  expect(f.promoted()).toEqual(["@lunarisapp/plugin-sdk@1.0.0"]);
});

test("GitHub promotion failure fails the job and can retry without republishing", () => {
  const f = fixture("npm");
  expect(
    f.invoke({ FAIL_PROMOTION: "@lunarisapp/plugin-sdk@1.0.0" }).exitCode
  ).not.toBe(0);
  expect(f.invoke().exitCode).toBe(0);
  expect(
    f.calls().some(({ tool, args }) => tool === "npm" && args[0] === "publish")
  ).toBe(false);
});

test("hosted promotion requires every destination to succeed", () => {
  const f = fixture("hosted");
  expect(f.invoke({ FAIL_SERVICE: f.service(2) }).exitCode).not.toBe(0);
  expect(f.promoted()).toEqual([]);
});

test("later hosted failure preserves already promoted target", () => {
  const f = fixture("hosted");
  expect(f.invoke({ FAIL_SERVICE: f.service(3) }).exitCode).not.toBe(0);
  expect(f.promoted()).toEqual(["web@1.0.0"]);
});
