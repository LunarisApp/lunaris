import { expect, test } from "bun:test";
import { incompleteReleaseReasons } from "./incomplete-release";
import type { ReleaseManifest } from "./manifest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./process";

const sha = "a".repeat(40);
const manifest: ReleaseManifest = {
  sourceCommit: "b".repeat(40),
  releases: [
    {
      name: "landing",
      path: "apps/landing",
      kind: "hosted",
      tag: "landing@1.0.0",
      version: "1.0.0",
      notes: "Fix",
    },
  ],
};
const published = [{ tag: "landing@1.0.0", sha, published: true }];

test("completed release requires every target and back-merge", () => {
  expect(incompleteReleaseReasons(sha, manifest, true, published)).toEqual([]);
  expect(incompleteReleaseReasons(sha, manifest, false, published)).toEqual([
    `${sha}: back-merge into next incomplete`,
  ]);
  expect(incompleteReleaseReasons(sha, manifest, true, [])).toHaveLength(2);
  expect(
    incompleteReleaseReasons(sha, manifest, true, [
      { ...published[0]!, sha: "c".repeat(40) },
    ])
  ).toEqual(["landing@1.0.0: missing or mismatched tag"]);
  expect(
    incompleteReleaseReasons(sha, manifest, true, [
      { ...published[0]!, published: false },
    ])
  ).toEqual(["landing@1.0.0: publication incomplete"]);
});

test("one incomplete target blocks a multi-target release", () => {
  const combined: ReleaseManifest = {
    ...manifest,
    releases: [
      ...manifest.releases,
      {
        ...manifest.releases[0]!,
        name: "web",
        path: "apps/web",
        tag: "web@1.0.0",
      },
    ],
  };
  expect(incompleteReleaseReasons(sha, combined, true, published)).toEqual([
    "web@1.0.0: missing or mismatched tag",
    "web@1.0.0: publication incomplete",
  ]);
});

test("release guard inspects remote history, publication and back-merge; API errors fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "lunaris-release-guard-"));
  try {
    const cwd = join(root, "work");
    run("git", ["init", "--bare", join(root, "remote.git")]);
    run("git", ["clone", join(root, "remote.git"), cwd]);
    const git = (...args: string[]) => run("git", args, { cwd }).text;
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    git("checkout", "-b", "main");
    writeFileSync(join(cwd, "README.md"), "source");
    git("add", ".");
    git("commit", "-m", "source");
    const source = git("rev-parse", "HEAD");
    git("branch", "next");
    mkdirSync(join(cwd, ".release"));
    writeFileSync(
      join(cwd, ".release/manifest.json"),
      JSON.stringify({ ...manifest, sourceCommit: source })
    );
    git("add", ".");
    git("commit", "-m", "chore(release): version packages");
    git("push", "origin", "main", "next");
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "gh"),
      `#!${process.execPath}\nif (process.env.API_ERROR) process.exit(1); console.log(process.argv[2] === "run" ? "[]" : process.env.RELEASE_STATE);\n`,
      { mode: 0o755 }
    );
    const invoke = (state: string, apiError = "") =>
      Bun.spawnSync(
        [
          process.execPath,
          "-e",
          `import { requireCompletedRelease } from ${JSON.stringify(resolve(import.meta.dir, "incomplete-release.ts"))}; requireCompletedRelease();`,
        ],
        {
          cwd,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_REPOSITORY: "fixture/repo",
            RELEASE_STATE: state,
            API_ERROR: apiError,
          },
        }
      );
    const publishedState = JSON.stringify({
      isDraft: false,
      isPrerelease: false,
    });
    expect(invoke(publishedState).stderr.toString()).toContain(
      "missing or mismatched tag"
    );
    git("tag", "landing@1.0.0");
    git("push", "origin", "--tags");
    expect(invoke(publishedState).stderr.toString()).toContain(
      "back-merge into next incomplete"
    );
    git("push", "origin", "main:next");
    expect(invoke(publishedState).exitCode).toBe(0);
    expect(
      invoke('{"isDraft":true,"isPrerelease":false}').stderr.toString()
    ).toContain("publication incomplete");
    expect(invoke(publishedState, "true").exitCode).not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);
