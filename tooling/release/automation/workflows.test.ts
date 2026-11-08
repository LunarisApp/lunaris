import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

const workflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
test("retired release workflows are absent; PR policy remains unconditional", () => {
  for (const name of [
    "release.prepare",
    "release.publish",
    "release",
    "apps.publish",
  ]) {
    expect(existsSync(`.github/workflows/${name}.yml`)).toBe(false);
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
  expect(workflow("packages.publish").permissions.contents).toBe("write");
  expect(workflow("packages.publish").jobs.publish.env.GH_TOKEN).toBeDefined();
});

test("self-host publishing follows validation, with both native architectures and bundle promotion", () => {
  const pipeline = workflow("release.stable").jobs;
  expect(pipeline["self-hosted"].needs).toBe("reserve");
  expect(pipeline.hosted.needs).toContain("self-hosted");
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
