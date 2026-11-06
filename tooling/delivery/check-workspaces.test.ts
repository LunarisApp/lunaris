import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "check-workspaces.ts");

function run(task: string, filters: unknown) {
  return spawnSync(process.execPath, [script, task], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: {
      ...process.env,
      // A skipped selection must not require Bun or Turbo on PATH.
      PATH: "",
      WORKSPACE_FILTERS: JSON.stringify(filters),
    },
  });
}

test("empty affected selection skips Turbo for both workspace checks", () => {
  for (const task of ["typecheck", "test"]) {
    const result = run(task, ["--filter=__no_affected_workspace__"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  }
});

test("empty selection does not bypass task or filter validation", () => {
  expect(run("build", ["--filter=__no_affected_workspace__"]).stderr).toContain(
    "Expected typecheck or test"
  );
  for (const filters of [[], null, ["--filter=web;exit 0"]]) {
    const result = run("test", filters);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid affected workspace filters");
  }
});

test("real workspace selections still launch the task runner", () => {
  const result = run("test", ["--filter=web"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("bun");
});
