import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";

test("stack tests execute only the event commit or a trusted main release", () => {
  const workflow = parse(
    readFileSync(".github/workflows/self-host.test.yml", "utf8")
  );
  const steps = workflow.jobs.stack.steps;
  const checkout = steps[0];
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  expect(checkout.with.ref).toBe("${{ github.sha }}");
  expect(checkout.with["fetch-depth"]).toBe(0);
  expect(checkout.with["persist-credentials"]).toBe(false);
  const guard = steps[1];
  expect(guard.name).toBe("Select trusted release revision");
  expect(steps[2].uses).toBe("./.github/actions/setup-bun");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  expect(guard.env.RELEASE_SHA).toBe("${{ inputs.ref }}");

  const cwd = mkdtempSync(join(tmpdir(), "lunaris-stack-revision-"));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    git("commit", "--allow-empty", "-m", "source");
    const source = git("rev-parse", "HEAD");
    git("commit", "--allow-empty", "-m", "release");
    const release = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", release);
    git("checkout", "--detach", source);
    git("commit", "--allow-empty", "-m", "untrusted");
    const untrusted = git("rev-parse", "HEAD");

    const check = (
      sha: string,
      ref: string,
      event: string,
      requested: string,
      accepted: boolean
    ) => {
      git("checkout", "--detach", sha);
      const shouldRun = runInNewContext(guard.if, {
        inputs: { ref: requested },
        github: { sha },
      });
      const result = shouldRun
        ? spawnSync("bash", ["-euo", "pipefail", "-c", guard.run], {
            cwd,
            encoding: "utf8",
            env: {
              ...process.env,
              RELEASE_SHA: requested,
              GITHUB_REF: ref,
              GITHUB_EVENT_NAME: event,
            },
          })
        : { status: 0, stderr: "" };
      expect(result.status === 0, result.stderr).toBe(accepted);
      expect(git("rev-parse", "HEAD")).toBe(accepted ? requested : sha);
    };

    for (const event of ["push", "workflow_dispatch"]) {
      check(source, "refs/heads/main", event, release, true);
      check(source, "refs/heads/main", event, untrusted, false);
      for (const requested of [
        "main",
        "",
        `${release}; exit 0`,
        "a".repeat(40),
      ]) {
        check(source, "refs/heads/main", event, requested, false);
      }
    }
    check(untrusted, "refs/pull/17/merge", "pull_request", untrusted, true);
    check(untrusted, "refs/pull/17/merge", "pull_request", release, false);
    check(source, "refs/heads/next", "push", source, true);
    check(source, "refs/heads/next", "workflow_dispatch", release, false);
    check(source, "refs/heads/main", "workflow_run", release, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
