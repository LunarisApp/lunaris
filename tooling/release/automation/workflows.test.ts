import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { releaseRulesets } from "./rulesets";

const workflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
test("release ordering validates the version commit and isolates back-merge from publishing", () => {
  const { jobs } = workflow("release.publish");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression, not JavaScript interpolation.
  expect(jobs.validate.with.ref).toBe("${{ needs.version.outputs.sha }}");
  expect(jobs.validate.permissions).toEqual(workflow("ci").permissions);
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

test("legacy release entrypoints stay retired without configuration flags", () => {
  for (const name of ["release.prepare", "release.publish", "release"]) {
    const jobs = workflow(name).jobs;
    const entry =
      name === "release.prepare"
        ? jobs.prepare
        : name === "release.publish"
          ? jobs.version
          : Object.values(jobs)[0];
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression.
    expect(entry.if).toBe("${{ false }}");
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

test("self-host publishing follows validation, with both native architectures and bundle promotion", () => {
  const pipeline = workflow("release.publish").jobs;
  expect(pipeline["self-hosted"].needs).toEqual(["version", "tag"]);
  expect(pipeline.result.needs).toContain("self-hosted");
  expect(pipeline["self-hosted"].permissions.packages).toBe("write");
  const publish = workflow("self-host.publish");
  expect(Object.keys(publish.on)).toEqual(["workflow_call"]);
  expect(publish.jobs.bundle.needs).toEqual(["prepare", "images"]);
  expect(
    publish.jobs.images.strategy.matrix.include.map(
      (entry: { architecture: string }) => entry.architecture
    )
  ).toEqual(["amd64", "arm64"]);
  const tests = workflow("self-host.test");
  expect(tests.jobs.stack.strategy.matrix.runner).toEqual([
    "ubuntu-latest",
    "ubuntu-24.04-arm",
  ]);
  expect(workflow("ci").jobs.ci.needs).toContain("self-hosted");
});
