import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "native-source.ts");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-native-source-"));
  roots.push(root);
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  };
  git("init", "-b", "main", ".");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("commit", "--allow-empty", "-m", "Validated historical source");
  const sha = git("rev-parse", "HEAD");
  git("checkout", "-b", "unmerged");
  git("commit", "--allow-empty", "-m", "Unmerged source");
  const unmerged = git("rev-parse", "HEAD");
  git("checkout", "main");
  git("commit", "--allow-empty", "-m", "Newer trunk source");
  // Fetch from a local origin with the same refs as the trusted checkout.
  git("remote", "add", "origin", root);
  const output = join(root, "output");
  const calls = join(root, "calls");
  const preload = join(root, "fetch.ts");
  writeFileSync(
    preload,
    `import { appendFileSync } from "node:fs";
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url !== "https://api.github.com/repos/fixture/repo/commits/" + process.env.NATIVE_SOURCE_SHA + "/check-runs?check_name=CI&filter=latest&per_page=100") {
    throw new Error("Unexpected request " + url);
  }
  appendFileSync(process.env.FIXTURE_CALLS, url + "\\n");
  return Response.json({check_runs: JSON.parse(process.env.FIXTURE_CHECKS)});
};
`
  );
  const run = (
    selected: string,
    checks = [
      { name: "CI", conclusion: "success", app: { slug: "github-actions" } },
    ]
  ) => {
    writeFileSync(output, "");
    writeFileSync(calls, "");
    return spawnSync(process.execPath, ["--preload", preload, script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GH_TOKEN: "fixture",
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_OUTPUT: output,
        NATIVE_SOURCE_SHA: selected,
        FIXTURE_CALLS: calls,
        FIXTURE_CHECKS: JSON.stringify(checks),
      },
    });
  };
  return {
    sha,
    unmerged,
    run,
    head: () => git("rev-parse", "HEAD"),
    output: () => readFileSync(output, "utf8"),
    calls: () => readFileSync(calls, "utf8"),
  };
}

test("native source gate accepts a validated historical SHA without checking it out", () => {
  const f = fixture();
  const head = f.head();
  expect(head).not.toBe(f.sha);
  const result = f.run(f.sha);
  expect(result.status).toBe(0);
  expect(f.head()).toBe(head);
  expect(f.output()).toBe(`validated_revision=${f.sha}\n`);
  expect(f.calls()).toContain(`/commits/${f.sha}/check-runs?`);
});

test("native source gate rejects refs and unmerged commits before requesting CI evidence", () => {
  const f = fixture();
  for (const source of [
    "",
    "main",
    "a".repeat(39),
    `${f.sha}\nsha=main`,
    f.unmerged,
  ]) {
    expect(f.run(source).status).not.toBe(0);
    expect(f.output()).toBe("");
    expect(f.calls()).toBe("");
  }
});

test("native source gate emits nothing without successful exact-SHA GitHub Actions CI", () => {
  const f = fixture();
  for (const checks of [
    [],
    [{ name: "CI", conclusion: "failure", app: { slug: "github-actions" } }],
    [{ name: "Tests", conclusion: "success", app: { slug: "github-actions" } }],
    [{ name: "CI", conclusion: "success", app: { slug: "other-app" } }],
  ]) {
    const result = f.run(f.sha, checks);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "requires successful CI on the exact trunk SHA"
    );
    expect(f.output()).toBe("");
  }
});
