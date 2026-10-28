import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("desktop source gate rejects unmerged dispatch refs and PR publication", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-source-"));
  directories.push(root);
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  };
  git("init", "--initial-branch=main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  git("commit", "--allow-empty", "-m", "trunk");
  const trunk = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", trunk);
  git("checkout", "-b", "unmerged");
  git("commit", "--allow-empty", "-m", "unmerged");
  const unmerged = git("rev-parse", "HEAD");
  const script = parse(
    readFileSync(".github/workflows/desktop.build.yml", "utf8")
  ).jobs.source.steps[1].run as string;
  const run = (ref: string, event: string, release = false, eventSha = trunk) =>
    spawnSync("bash", ["-c", script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SOURCE_REF: ref,
        EVENT_NAME: event,
        EVENT_SHA: eventSha,
        RELEASE_BUILD: String(release),
        GITHUB_OUTPUT: join(root, "outputs"),
      },
    });
  expect(run(trunk, "workflow_dispatch", true).status).toBe(0);
  expect(readFileSync(join(root, "outputs"), "utf8")).toBe(`sha=${trunk}\n`);
  expect(run(unmerged, "workflow_dispatch").status).not.toBe(0);
  expect(run(unmerged, "push").status).not.toBe(0);
  expect(run("main", "workflow_dispatch").status).not.toBe(0);
  expect(run("a".repeat(40), "workflow_dispatch").status).not.toBe(0);
  expect(run(unmerged, "pull_request", false, unmerged).status).toBe(0);
  expect(run(unmerged, "pull_request", true, unmerged).status).not.toBe(0);
  expect(run(trunk, "pull_request", false, unmerged).status).not.toBe(0);
});
