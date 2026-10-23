import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { trunkRulesets } from "../release/automation/rulesets";

const workflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
test("independent sites have no core release dependency and never cancel active rollout", () => {
  const job = workflow("sites.deploy").jobs.deploy;
  expect(job.needs).toBeUndefined();
  expect(job.strategy["fail-fast"]).toBe(false);
  expect(job.strategy.matrix.component).toEqual(["landing", "docs"]);
  expect(job.concurrency["cancel-in-progress"]).toBe(false);
  expect(job.concurrency.group).toContain("matrix.component");
});
test("candidate stage waits for all image tests and protects the shared staging stack", () => {
  const { jobs } = workflow("core.candidate");
  expect(jobs.test.strategy.matrix.shard).toEqual([0, 1, 2]);
  expect(jobs.test.with.shards).toBe(3);
  expect(jobs.stage.needs).toEqual(["build", "test"]);
  expect(jobs.stage.concurrency).toEqual({
    group: "core-staging",
    "cancel-in-progress": false,
  });
  expect(jobs.stage.env.POWERSYNC_PROJECT_ID).toContain(
    "STAGING_POWERSYNC_PROJECT_ID"
  );
  expect(jobs.stage.env.RAILWAY_RELEASE_TARGETS).toContain(
    "RAILWAY_STAGING_TARGETS"
  );
  expect(workflow("e2e").concurrency.group).toContain("inputs.shard");
});
test("production uses trusted tooling and resolves evidence before source checkout", () => {
  const { jobs, concurrency } = workflow("core.promote");
  expect(jobs.promote.needs).toBe("resolve");
  expect(concurrency).toEqual({
    group: "core-production",
    "cancel-in-progress": false,
  });
  expect(jobs.promote.steps[0].with.path).toBe(".delivery-tools");
  expect(jobs.promote.steps[1].with.ref).toContain("needs.resolve.outputs.sha");
  expect(jobs.promote.steps.at(-1).run).toContain(
    ".delivery-tools/tooling/delivery/core.ts"
  );
});
test("cutover preserves immutable historical tags and permits normal main PRs", () => {
  const rules = trunkRulesets(123, 456);
  expect(rules.some((rule) => rule.name === "Release next - PRs")).toBe(false);
  const main = rules.find((rule) => rule.name === "Release main - PRs");
  expect(JSON.stringify(main)).toContain('"squash"');
  expect(
    rules.find((rule) => rule.name === "Release tags - immutable")
      ?.bypass_actors
  ).toEqual([]);
});

test("npm recovery checkout contains transitive release tooling imports", () => {
  const checkout = workflow("packages.publish").jobs.publish.steps.find(
    (step: { with?: { path?: string } }) => step.with?.path === ".release-tools"
  );
  expect(checkout.with["sparse-checkout"]).toContain("tooling/delivery");
});
