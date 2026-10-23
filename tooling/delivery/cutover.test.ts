import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const script = join(import.meta.dir, "cutover.ts");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-cutover-"));
  roots.push(root);
  const exec = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
  };
  exec("git", ["init", "--bare", "origin.git"]);
  exec("git", ["init", "-b", "main", "checkout"]);
  const checkout = join(root, "checkout");
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: checkout, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
  };
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "--allow-empty",
    "-m",
    "Initial"
  );
  git("branch", "next");
  git("remote", "add", "origin", join(root, "origin.git"));
  git("push", "origin", "main", "next");
  mkdirSync(join(root, "bin"));
  const callsPath = join(root, "calls.jsonl");
  const pagesPath = join(root, "pages.json");
  writeFileSync(callsPath, "");
  writeFileSync(
    join(root, "bin/gh"),
    `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const mutation = args[0] !== "api" || args.includes("--method");
const input = args.includes("--input") ? readFileSync(0, "utf8") : undefined;
appendFileSync(process.env.CUTOVER_CALLS, JSON.stringify({ args, input }) + "\\n");
if (!mutation) {
  if (!(args.includes("--paginate") && args.includes("--slurp"))) throw new Error("Unpaginated list");
  const pages = JSON.parse(readFileSync(process.env.CUTOVER_PAGES, "utf8"))[args[1]];
  if (!pages) throw new Error("Unexpected read " + args[1]);
  console.log(JSON.stringify(pages));
}
`,
    { mode: 0o755 }
  );
  const pages: Record<string, unknown[]> = {
    "actions/variables?per_page=100": [
      { variables: [] },
      {
        variables: [
          { name: "DELIVERY_MODE", value: "cutover" },
          { name: "RELEASE_APP_ID", value: "1" },
          { name: "CORE_CONFIGURATION_REVISION", value: "1" },
        ],
      },
    ],
    "releases?per_page=100": [[], []],
    "environments/production/variables?per_page=100": [
      { variables: [] },
      { variables: [{ name: "RAILWAY_RELEASE_TARGETS", value: "{}" }] },
    ],
    "environments/staging/variables?per_page=100": [
      { variables: [] },
      { variables: [{ name: "RAILWAY_STAGING_TARGETS", value: "{}" }] },
    ],
    "rulesets?per_page=100": [[], [{ id: 11, name: "Release main - PRs" }]],
    "pulls?base=next&state=open&per_page=100": [
      [{ number: 1 }],
      [{ number: 101 }],
    ],
  };
  for (const status of [
    "in_progress",
    "queued",
    "requested",
    "waiting",
    "pending",
  ]) {
    pages[`actions/runs?status=${status}&per_page=100`] = [
      { total_count: 0, workflow_runs: [] },
    ];
  }
  const run = (apply = true) => {
    const responsePages = Object.fromEntries(
      Object.entries(pages).map(([path, value]) => [
        `repos/fixture/repo/${path}`,
        value,
      ])
    );
    writeFileSync(pagesPath, JSON.stringify(responsePages));
    return spawnSync(
      process.execPath,
      [script, ...(apply ? ["--apply"] : [])],
      {
        cwd: checkout,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "fixture/repo",
          RELEASE_MAINTAINER_TEAM_ID: "2",
          CUTOVER_CALLS: callsPath,
          CUTOVER_PAGES: pagesPath,
        },
      }
    );
  };
  const mutations = () =>
    readFileSync(callsPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[]; input?: string })
      .filter(({ args }) => args[0] !== "api" || args.includes("--method"));
  return { pages, run, mutations };
}

test("cutover refuses mutations unless repository delivery mode is paused", () => {
  const f = fixture();
  f.pages["actions/variables?per_page=100"] = [
    { variables: [{ name: "DELIVERY_MODE", value: "legacy" }] },
  ];
  const result = f.run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("DELIVERY_MODE=cutover");
  expect(f.mutations()).toEqual([]);
});

test("active legacy releases on later pages block cutover", () => {
  const f = fixture();
  f.pages["actions/runs?status=waiting&per_page=100"] = [
    { total_count: 101, workflow_runs: [] },
    {
      total_count: 101,
      workflow_runs: [{ path: ".github/workflows/release.publish.yml" }],
    },
  ];
  const result = f.run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("still running");
  expect(f.mutations()).toEqual([]);
});

test("draft releases on later pages block cutover", () => {
  const f = fixture();
  f.pages["releases?per_page=100"] = [[{ draft: false }], [{ draft: true }]];
  const result = f.run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Finish draft publications");
  expect(f.mutations()).toEqual([]);
});

test("cutover retargets every PR and updates existing rules from later pages", () => {
  const f = fixture();
  const result = f.run();
  expect(result.status).toBe(0);
  const mutations = f.mutations();
  expect(
    mutations.some(
      ({ args }) =>
        args.includes("repos/fixture/repo/rulesets/11") && args.includes("PUT")
    )
  ).toBe(true);
  for (const number of [1, 101]) {
    expect(
      mutations.some(
        ({ args, input }) =>
          args.includes(`repos/fixture/repo/pulls/${number}`) &&
          input === JSON.stringify({ base: "main" })
      )
    ).toBe(true);
  }
  expect(mutations.at(-1)?.args).toEqual([
    "variable",
    "set",
    "DELIVERY_MODE",
    "--repo",
    "fixture/repo",
    "--body",
    "trunk",
  ]);
});

test("cutover preview reads complete state without mutations", () => {
  const f = fixture();
  const result = f.run(false);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"defaultBranch": "main"');
  expect(f.mutations()).toEqual([]);
});
