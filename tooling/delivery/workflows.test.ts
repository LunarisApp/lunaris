import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));

test("artifact publication carries permissions through nested workflows", () => {
  const caller = workflow("artifacts.publish").jobs.npm.permissions;
  const family = workflow("artifact.family").permissions;
  const publish = workflow("self-host.publish").permissions;
  const ranks: Record<string, number> = { none: 0, read: 1, write: 2 };
  for (const [scope, level] of Object.entries(publish)) {
    const required = ranks[level as string]!;
    expect(ranks[family[scope] ?? "none"]!).toBeGreaterThanOrEqual(required);
    expect(ranks[caller[scope] ?? "none"]!).toBeGreaterThanOrEqual(required);
  }
});

test("independent sites have no core release dependency and never cancel active rollout", () => {
  const job = workflow("sites.deploy").jobs.deploy;
  expect(job.needs).toBeUndefined();
  expect(job.strategy["fail-fast"]).toBe(false);
  expect(job.strategy.matrix.component).toEqual(["landing", "docs"]);
  expect(job.concurrency["cancel-in-progress"]).toBe(false);
  expect(job.concurrency.group).toContain("matrix.component");
});
test("candidate certification waits for all image tests without deploying", () => {
  const { jobs, permissions } = workflow("core.candidate");
  expect(jobs.test.strategy.matrix.shard).toEqual([0, 1, 2]);
  expect(jobs.test.with.shards).toBe(3);
  expect(jobs.certify.needs).toEqual(["build", "test"]);
  expect(jobs.certify.environment).toBeUndefined();
  expect(jobs.certify.steps.at(-1).with.name).toBe("core-candidate");
  expect(jobs.certify.steps.at(-1).with.path).toBe("artifacts/candidate.json");
  expect(permissions.deployments).toBe("read");
  expect(Object.keys(jobs)).toEqual(["build", "test", "certify"]);
  expect(workflow("e2e").concurrency.group).toContain("inputs.shard");
});
test("production uses trusted tooling and resolves evidence before source checkout", () => {
  const { jobs, concurrency } = workflow("core.promote");
  expect(jobs.promote.needs).toBe("resolve");
  expect(concurrency).toEqual({
    group: "core-production",
    "cancel-in-progress": false,
  });
  // Root checkout can delete nested repositories even with clean: false.
  // Fetch trusted tooling only after the candidate source is in place.
  expect(jobs.promote.steps[0].with.ref).toContain("needs.resolve.outputs.sha");
  expect(jobs.promote.steps[1].with.path).toBe(".delivery-tools");
  expect(jobs.promote.steps[1].with.ref).toBeUndefined();
  expect(jobs.promote.steps[1].with["sparse-checkout"]).toContain(
    ".github/actions/setup-bun"
  );
  expect(jobs.promote.steps[2].uses).toBe(
    "./.delivery-tools/.github/actions/setup-bun"
  );
  expect(jobs.promote.steps.at(-1).run).toContain(
    ".delivery-tools/tooling/delivery/core.ts"
  );
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

test("macOS release builds plugin SDK before compiling the agent sidecar", () => {
  const { steps } = workflow("native.build").jobs["build-desktop"];
  const sdk = steps.findIndex(
    (step: { run?: string }) =>
      step.run === "bun run --cwd packages/plugin-sdk build"
  );
  const agent = steps.findIndex(
    (step: { run?: string }) =>
      step.run === "bun run --cwd apps/desktop build:agent"
  );
  expect(sdk).toBeGreaterThanOrEqual(0);
  expect(agent).toBeGreaterThan(sdk);
  expect(steps[sdk].if).toBe(steps[agent].if);
});

test("Homebrew is optional and distribution needs no S3 credentials", () => {
  const stable = workflow("release.stable");
  const preflight = stable.jobs.reserve.steps.find(
    (step: { id?: string }) => step.id === "distribution"
  );
  expect(preflight.run).not.toContain("S3_");
  expect(preflight.run).toContain("homebrew_enabled=false");
  const steps = stable.jobs.distribute.steps;
  expect(JSON.stringify(stable)).not.toContain("RELEASES_S3_");
  expect(
    steps.some((step: { run?: string }) => step.run?.includes("publish-s3.sh"))
  ).toBe(false);
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

test("CI owns site selection without Railway watch-path filtering", () => {
  for (const component of ["landing", "docs"]) {
    const config = JSON.parse(
      readFileSync(`apps/${component}/railway.json`, "utf8")
    );
    expect(config.build.watchPatterns).toEqual([]);
  }
});

test("desktop installers build on native runners in CI and stable releases", () => {
  const platforms = workflow("desktop.build");
  const build = platforms.jobs.build;
  expect(build.strategy["fail-fast"]).toBe(false);
  expect(
    build.strategy.matrix.include.map((item: { runner: string }) => item.runner)
  ).toEqual(["windows-2022", "ubuntu-22.04"]);
  expect(workflow("native.build").jobs["persist-desktop-platforms"].needs).toBe(
    "build-desktop-platforms"
  );
  expect(build.permissions.contents).toBe("read");
  expect(workflow("ci").jobs.ci.needs).toContain("desktop-platforms");
  expect(workflow("ci").jobs["desktop-platforms"].with.publish).toBeUndefined();
  expect(
    workflow("native.build").jobs["build-desktop-platforms"].with.publish
  ).toBe(true);
  expect(
    workflow("release.stable").jobs.distribute.strategy.matrix.component
  ).toEqual(["cli", "desktop"]);
  expect(
    workflow("native.build").jobs["build-desktop"].steps.find(
      (step: { name?: string }) => step.name === "Configure ad-hoc signing"
    ).if
  ).toContain("mode == 'adhoc'");
});

test("draft release restores have write access without elevating PR build tokens", () => {
  const build = workflow("desktop.build").jobs.build;
  expect(build.permissions.contents).toBe("read");
  expect(build.environment).toBe(`\${{ inputs.publish && 'release' || '' }}`);
  const app = build.steps.find(
    (step: { id?: string }) => step.id === "release-app"
  );
  expect(app.if).toBe("inputs.publish");
  expect(app.with["permission-contents"]).toBe("write");
  expect(app.with["app-id"]).toContain("vars.RELEASE_APP_ID");
  expect(app.with["private-key"]).toContain("secrets.RELEASE_APP_PRIVATE_KEY");
  const restore = build.steps.find(
    (step: { id?: string }) => step.id === "restore"
  );
  expect(restore.if).toBe("inputs.publish");
  expect(restore.env.GH_TOKEN).toContain("steps.release-app.outputs.token");
  expect(build.steps.indexOf(app)).toBeLessThan(build.steps.indexOf(restore));
  expect(workflow("release.stable").jobs.distribute.permissions.contents).toBe(
    "write"
  );
});

test("desktop source validation runs before requested code or caches", () => {
  const { jobs } = workflow("desktop.build");
  const source = jobs.source;
  expect(source.steps[0].with.ref).toBeUndefined();
  expect(source.steps[0].with["persist-credentials"]).toBe(false);
  expect(source.steps).toHaveLength(2);
  expect(jobs.build.needs).toBe("source");
  const checkout = jobs.build.steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/checkout@")
  );
  expect(checkout.with.ref).toContain(
    "needs.source.outputs.validated_revision"
  );
  expect(jobs.build.env.LUNARIS_BUILD_SHA).toContain(
    "needs.source.outputs.validated_revision"
  );
  expect(checkout.with["persist-credentials"]).toBe(false);
});

test("stable asset jobs use workflow tooling while retaining candidate source", () => {
  for (const name of [
    "native.build",
    "desktop.build",
    "self-host.publish",
    "release.stable",
  ]) {
    const { jobs } = workflow(name);
    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = (
        job as {
          steps?: { run?: string; with?: { path?: string; ref?: string } }[];
        }
      ).steps;
      if (!steps || (name === "release.stable" && jobName === "reserve")) {
        continue;
      }
      const assetSteps = steps.filter((step) =>
        step.run?.includes("product-release.ts")
      );
      if (!assetSteps.length) {
        continue;
      }
      const tools = steps.find((step) => step.with?.path === ".delivery-tools");
      expect(tools).toBeDefined();
      expect(tools?.with?.ref).toBeUndefined();
      for (const step of assetSteps) {
        expect(step.run).toContain(
          "bun .delivery-tools/tooling/delivery/product-release.ts"
        );
      }
    }
  }
});

test("stable checks updater keys before reserving a release or building artifacts", () => {
  const steps = workflow("release.stable").jobs.reserve.steps;
  const signing = steps.findIndex((step: { run?: string }) =>
    step.run?.includes("desktop-updater-config.ts")
  );
  const reserve = steps.findIndex(
    (step: { id?: string }) => step.id === "reserve"
  );
  expect(signing).toBeGreaterThanOrEqual(0);
  expect(signing).toBeLessThan(reserve);
  expect(steps[signing].env.TAURI_UPDATER_PUBLIC_KEY).toContain(
    "vars.TAURI_UPDATER_PUBLIC_KEY"
  );
  expect(steps[signing].env.TAURI_SIGNING_PRIVATE_KEY).toContain(
    "secrets.TAURI_SIGNING_PRIVATE_KEY"
  );
});
