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
test("retired native publication retains source validation before checkout", () => {
  const { jobs } = workflow("release");
  const source = jobs.source;
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression.
  expect(source.if).toBe("${{ false }}");
  expect(source.permissions).toEqual({ contents: "read", checks: "read" });
  expect(source.steps[0].with.ref).toBeUndefined();
  expect(source.steps[0].with["fetch-depth"]).toBe(0);
  expect(source.steps.at(-1).run).toBe("bun tooling/delivery/native-source.ts");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  expect(source.steps.at(-1).env.NATIVE_SOURCE_SHA).toBe("${{ inputs.ref }}");
  expect(source.outputs.validated_revision).toContain(
    "steps.source.outputs.validated_revision"
  );
  expect(jobs.plan.needs).toBe("source");
  expect(jobs.plan.outputs.validated_revision).toContain(
    "needs.source.outputs.validated_revision"
  );
  expect(jobs.plan.steps[1].with.ref).toContain(
    "needs.source.outputs.validated_revision"
  );
  for (const name of [
    "signing",
    "verify",
    "build-cli",
    "build-desktop",
    "publish-cli",
    "publish-desktop",
  ]) {
    expect(jobs[name].needs).toContain("plan");
    expect(jobs[name].steps[0].with.ref).toContain(
      "needs.plan.outputs.validated_revision"
    );
    expect(JSON.stringify(jobs[name])).not.toContain("inputs.ref");
  }
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

test("stable release stages every artifact before production and finalizes after distribution", () => {
  const { jobs, concurrency, on } = workflow("release.stable");
  expect(Object.keys(on)).toEqual(["workflow_dispatch"]);
  expect(on.workflow_dispatch.inputs.candidate_run_id.required).toBe(true);
  expect(concurrency).toEqual({
    group: "stable-release",
    "cancel-in-progress": false,
  });
  expect(jobs.hosted.needs).toEqual(["reserve", "native", "self-hosted"]);
  expect(jobs.finalize.needs).toEqual(["reserve", "hosted", "distribute"]);
  expect(jobs.hosted.with.stable_release).toBe(true);
  expect(workflow("core.promote").jobs.resolve.if).toContain(
    "inputs.stable_release"
  );
  expect(jobs.native.uses).toBe("./.github/workflows/native.build.yml");
  expect(
    jobs.reserve.steps.find((step: { id?: string }) => step.id === "reserve")
      .env.PRODUCT_TAG_TOKEN
  ).toContain("steps.app.outputs.token");
});
test("native builders retain signing and durable receipts; product artifact releases exclude npm", () => {
  const { jobs } = workflow("native.build");
  for (const name of ["build-cli", "build-desktop"]) {
    expect(
      jobs[name].steps.some((step: { run?: string }) =>
        step.run?.includes("product-version.ts")
      )
    ).toBe(true);
    expect(jobs[name].steps.at(-1).run).toContain("product-release.ts upload");
    expect(jobs[name].permissions.contents).toBe("write");
  }
  expect(
    workflow("artifacts.prepare").jobs.version.strategy.matrix.family
  ).toEqual(["npm"]);
  expect(workflow("artifacts.publish").jobs["self-hosted"]).toBeUndefined();
});

test("Homebrew is optional while S3 distribution remains required", () => {
  const stable = workflow("release.stable");
  const preflight = stable.jobs.reserve.steps.find(
    (step: { id?: string }) => step.id === "distribution"
  );
  expect(preflight.run).toContain(
    "for name in S3_ACCESS_KEY S3_SECRET_KEY S3_REGION S3_BUCKET; do"
  );
  expect(preflight.run).toContain("homebrew_enabled=false");
  const steps = stable.jobs.distribute.steps;
  expect(
    steps.find((step: { run?: string }) => step.run?.includes("publish-s3.sh"))
      .if
  ).toBeUndefined();
  expect(
    steps.find(
      (step: { with?: { repository?: string } }) =>
        step.with?.repository === "LunarisApp/homebrew-tap"
    ).if
  ).toBe("env.HOMEBREW_ENABLED == 'true'");
  expect(
    steps.find((step: { run?: string }) =>
      step.run?.includes("publish-homebrew.sh")
    ).if
  ).toBe("env.HOMEBREW_ENABLED == 'true'");
  expect(stable.jobs.finalize.env.HOMEBREW_ENABLED).toBe(
    stable.jobs.distribute.env.HOMEBREW_ENABLED
  );
});

test("CI-selected sites always build even when only shared tooling changed", () => {
  for (const component of ["landing", "docs"]) {
    const config = JSON.parse(
      readFileSync(`apps/${component}/railway.json`, "utf8")
    );
    expect(config.build.watchPatterns).toEqual(["/**"]);
  }
});
