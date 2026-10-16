import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { releaseRulesets } from "./rulesets";

const workflow = (name: string) => parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
test("release ordering validates the version commit and isolates back-merge from publishing", () => {
  const { jobs } = workflow("release.publish");
  expect(jobs.validate.with.ref).toBe("${{ needs.version.outputs.sha }}");
  expect(jobs.tag.needs).toEqual(["version", "validate"]);
  expect(jobs["back-merge"].needs).toEqual(["version", "validate", "tag"]);
  expect(jobs.complete.needs).toEqual(["version", "npm", "hosted"]);
});
test("all workflow actions are pinned and only stable coordinator publishes", () => {
  for (const name of ["ci", "e2e", "release.prepare", "release.publish", "packages.publish", "apps.publish"]) {
    const document = workflow(name);
    for (const job of Object.values(document.jobs) as { steps?: { uses?: string }[] }[]) {
      for (const step of job.steps ?? []) {
        if (step.uses && !step.uses.startsWith("./")) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      }
    }
  }
  expect(Object.keys(workflow("packages.publish").on)).toEqual(["workflow_call"]);
  expect(Object.keys(workflow("apps.publish").on)).toEqual(["workflow_call"]);
  expect(workflow("release").jobs["version-pr"]).toBeUndefined();
});
test("rules preserve immutable history even for automation and scoped tags", () => {
  const rules = releaseRulesets(123, 456);
  expect(rules.find(({ name }) => name === "Release tags - immutable")?.bypass_actors).toEqual([]);
  expect(rules.find(({ name }) => name === "Release branches - immutable history")?.bypass_actors).toEqual([]);
  expect(JSON.stringify(rules)).toContain("refs/tags/@lunarisapp/plugin-sdk@*");
  expect(JSON.stringify(rules)).not.toContain("refs/tags/desktop");
});

test("E2E runs only for ready main PRs, manual CI, and explicit release refs", () => {
  const { jobs, on } = workflow("ci");
  const condition = jobs.e2e.if.trim();
  expect(jobs.ci.steps[0].env.E2E_REQUIRED).toBe(`\u0024{{ ${condition} }}`);
  expect(on.pull_request.types).toContain("ready_for_review");
  expect(on.pull_request.types).toContain("converted_to_draft");
  const cases = [
    { event: "pull_request", base: "next", draft: false, ref: "", expected: false },
    { event: "pull_request", base: "main", draft: true, ref: "", expected: false },
    { event: "pull_request", base: "main", draft: false, ref: "", expected: true },
    { event: "push", base: "", draft: false, ref: "", expected: false },
    { event: "workflow_dispatch", base: "", draft: false, ref: "", expected: true },
    // Reusable workflows inherit the caller's event, not "workflow_call".
    { event: "push", base: "", draft: false, ref: "version-sha", expected: true },
  ];
  for (const entry of cases) {
    // This workflow expression uses only boolean operators shared with JS.
    const result = runInNewContext(condition, {
      inputs: { ref: entry.ref },
      github: { event_name: entry.event, base_ref: entry.base, event: { pull_request: { draft: entry.draft } } },
    });
    expect(result).toBe(entry.expected);
  }
});

test("aggregate CI rejects missing E2E for releases while permitting deliberate skips", () => {
  const script = workflow("ci").jobs.ci.steps[0].run;
  for (const result of ["success", "skipped", "failure", "cancelled", ""]) {
    for (const required of [true, false]) {
      const run = Bun.spawnSync(["bash", "-e", "-c", script], {
        env: { ...process.env, NEEDS_JSON: JSON.stringify({ changes: { result: "success", outputs: { editions: "false", "agent-rust": "false", "desktop-mcp": "false", sites: "false" } }, quality: { result: "success" }, typecheck: { result: "success" }, test: { result: "success" } }), RESULTS: `success ${result}`, POLICY: "success", EVENT: "pull_request", E2E_REQUIRED: String(required), E2E_RESULT: result },
      });
      const shouldPass = result === "success" || (!required && (result === "skipped" || result === ""));
      expect(run.exitCode === 0).toBe(shouldPass);
    }
  }
});

test("E2E avoids nightly duplicates and cancels superseded PR runs only", () => {
  const e2e = workflow("e2e");
  expect(Object.keys(e2e.on).sort()).toEqual(["workflow_call", "workflow_dispatch"]);
  expect(e2e.concurrency.group).toContain("github.event.pull_request.number");
  expect(e2e.concurrency["cancel-in-progress"]).toBe("${{ github.event_name == 'pull_request' }}");
  expect(e2e.jobs.e2e.if).toBeUndefined();
});


test("aggregate CI rejects skipped or failed selected jobs", () => {
  const script = workflow("ci").jobs.ci.steps[0].run;
  for (const selected of ["true", "false", undefined]) {
    for (const result of ["success", "skipped", "failure", "cancelled"]) {
      const needs = {
        changes: { result: "success", outputs: { editions: selected, "agent-rust": "false", "desktop-mcp": "false", sites: "false" } },
        quality: { result: "success" }, typecheck: { result: "success" }, test: { result: "success" }, editions: { result },
      };
      const run = Bun.spawnSync(["bash", "-e", "-c", script], {
        env: { ...process.env, NEEDS_JSON: JSON.stringify(needs), RESULTS: `success ${result}`, EVENT: "push", E2E_REQUIRED: "false" },
      });
      expect(run.exitCode === 0).toBe(selected !== undefined && (result === "success" || (selected === "false" && result === "skipped")));
    }
  }
});


test("release automation runs without configuration flags and preserves branch guards", () => {
  const prepare = workflow("release.prepare").jobs.prepare.if;
  const publish = workflow("release.publish").jobs.version.if.trim();
  for (const branch of ["main", "next", "feature/test"]) {
    for (const event of ["push", "workflow_dispatch"]) {
      for (const message of ["feat: ship changes", "chore(release): version packages"]) {
        const context = { github: { ref: `refs/heads/${branch}`, event_name: event, event: { head_commit: { message } } } };
        expect(runInNewContext(prepare, context)).toBe(branch === "next");
        expect(runInNewContext(publish, context)).toBe(branch === "main" && (event === "workflow_dispatch" || message !== "chore(release): version packages"));
      }
    }
  }
  const policy = workflow("ci").jobs["release-policy"];
  expect(policy.if).toBe("github.event_name == 'pull_request'");
  const check = policy.steps.find((step: { run?: string }) => step.run === "bun tooling/release/automation/check-policy.ts");
  expect(check).toBeDefined();
  expect(check.if).toBeUndefined();
  expect(existsSync(".github/workflows/deploy-powersync.yml")).toBe(false);
  expect(workflow("apps.publish").jobs.deploy.steps.some((step: { run?: string }) => step.run === "bun tooling/release/automation/deploy-hosted.ts")).toBe(true);
});
