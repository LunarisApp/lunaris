import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { releaseRulesets } from "./rulesets";

const workflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
test("release ordering validates the version commit and isolates back-merge from publishing", () => {
  const { jobs } = workflow("release.publish");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression, not JavaScript interpolation.
  expect(jobs.validate.with.ref).toBe("${{ needs.version.outputs.sha }}");
  expect(jobs.tag.needs).toEqual(["version", "validate"]);
  expect(jobs["back-merge"].needs).toEqual(["version", "validate", "tag"]);
  expect(jobs.complete).toBeUndefined();
  expect(jobs.result.needs).toContain("npm");
  expect(jobs.result.needs).toContain("hosted");
  expect(jobs.npm.permissions.contents).toBe("write");
  expect(workflow("packages.publish").permissions.contents).toBe("write");
  expect(workflow("packages.publish").jobs.publish.env.GH_TOKEN).toBeDefined();
});
test("rules preserve immutable history even for automation and scoped tags", () => {
  const rules = releaseRulesets(123, 456);
  expect(
    rules.find(({ name }) => name === "Release tags - immutable")?.bypass_actors
  ).toEqual([]);
  expect(
    rules.find(({ name }) => name === "Release branches - immutable history")
      ?.bypass_actors
  ).toEqual([]);
  expect(JSON.stringify(rules)).toContain("refs/tags/@lunarisapp/plugin-sdk@*");
  expect(JSON.stringify(rules)).not.toContain("refs/tags/desktop");
});

test("release automation runs without configuration flags and preserves branch guards", () => {
  const prepare = workflow("release.prepare").jobs.prepare.if;
  const publish = workflow("release.publish").jobs.version.if.trim();
  for (const branch of ["main", "next", "feature/test"]) {
    for (const event of ["push", "workflow_dispatch"]) {
      for (const message of [
        "feat: ship changes",
        "chore(release): version packages",
      ]) {
        const context = {
          github: {
            ref: `refs/heads/${branch}`,
            event_name: event,
            event: { head_commit: { message } },
          },
        };
        expect(runInNewContext(prepare, context)).toBe(branch === "next");
        expect(runInNewContext(publish, context)).toBe(
          branch === "main" &&
            (event === "workflow_dispatch" ||
              message !== "chore(release): version packages")
        );
      }
    }
  }
  const policy = workflow("ci").jobs["release-policy"];
  expect(policy.if).toBe("github.event_name == 'pull_request'");
  const check = policy.steps.find(
    (step: { run?: string }) =>
      step.run === "bun tooling/release/automation/check-policy.ts"
  );
  expect(check).toBeDefined();
  expect(check.if).toBeUndefined();
  expect(existsSync(".github/workflows/deploy-powersync.yml")).toBe(false);
  expect(
    workflow("apps.publish").jobs.deploy.steps.some(
      (step: { run?: string }) =>
        step.run === "bun tooling/release/automation/deploy-hosted.ts"
    )
  ).toBe(true);
});

test("npm recovery separates tooling from release sources and never deploys hosted services", () => {
  const recovery = workflow("packages.publish");
  expect(recovery.on.workflow_dispatch.inputs.ref.required).toBe(true);
  const steps = recovery.jobs.publish.steps;
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  expect(steps[0].with.ref).toBe("${{ inputs.ref }}");
  const tooling = steps.find(
    (step: { with?: { path?: string } }) => step.with?.path === ".release-tools"
  );
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  expect(tooling.with.ref).toBe("${{ github.sha }}");
  expect(tooling.if).toBe("github.event_name == 'workflow_dispatch'");
  expect(tooling.with["sparse-checkout"]).toContain(
    ".github/actions/setup-bun"
  );
  expect(
    steps.find(
      (step: { uses?: string }) =>
        step.uses === "./.release-tools/.github/actions/setup-bun"
    ).if
  ).toBe("github.event_name == 'workflow_dispatch'");
  expect(
    steps.find(
      (step: { uses?: string }) => step.uses === "./.github/actions/setup-bun"
    ).if
  ).toBe("github.event_name != 'workflow_dispatch'");
  expect(JSON.stringify(recovery)).not.toContain("deploy-hosted");
  expect(JSON.stringify(recovery)).not.toContain("powersync");
});

test("publication entrypoints remain explicit", () => {
  expect(Object.keys(workflow("packages.publish").on)).toEqual([
    "workflow_dispatch",
    "workflow_call",
  ]);
  expect(Object.keys(workflow("apps.publish").on)).toEqual(["workflow_call"]);
  expect(workflow("release").jobs["version-pr"]).toBeUndefined();
});
