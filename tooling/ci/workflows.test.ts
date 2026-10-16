import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { checks } from "../ci-selection";

const workflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));

test("E2E runs only for ready main PRs, manual CI, and explicit release refs", () => {
  const { jobs, on } = workflow("ci");
  const condition = jobs.e2e.if.trim();
  expect(
    jobs.ci.steps.find(
      (step: { run?: string }) => step.run === "bun tooling/ci/gate.ts"
    ).env.E2E_REQUIRED
  ).toBe(`\u0024{{ ${condition} }}`);
  expect(on.pull_request.types).toContain("ready_for_review");
  expect(on.pull_request.types).toContain("converted_to_draft");
  const cases = [
    {
      event: "pull_request",
      base: "next",
      draft: false,
      ref: "",
      expected: false,
    },
    {
      event: "pull_request",
      base: "main",
      draft: true,
      ref: "",
      expected: false,
    },
    {
      event: "pull_request",
      base: "main",
      draft: false,
      ref: "",
      expected: true,
    },
    { event: "push", base: "", draft: false, ref: "", expected: false },
    {
      event: "workflow_dispatch",
      base: "",
      draft: false,
      ref: "",
      expected: true,
    },
    // Reusable workflows inherit the caller's event, not "workflow_call".
    {
      event: "push",
      base: "",
      draft: false,
      ref: "version-sha",
      expected: true,
    },
  ];
  for (const entry of cases) {
    // This workflow expression uses only boolean operators shared with JS.
    const result = runInNewContext(condition, {
      inputs: { ref: entry.ref },
      github: {
        event_name: entry.event,
        base_ref: entry.base,
        event: { pull_request: { draft: entry.draft } },
      },
    });
    expect(result).toBe(entry.expected);
  }
});

test("E2E avoids nightly duplicates and cancels superseded PR runs only", () => {
  const e2e = workflow("e2e");
  expect(Object.keys(e2e.on).sort()).toEqual([
    "workflow_call",
    "workflow_dispatch",
  ]);
  expect(e2e.concurrency.group).toContain("github.event.pull_request.number");
  expect(e2e.concurrency["cancel-in-progress"]).toBe(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression, not JavaScript interpolation.
    "${{ github.event_name == 'pull_request' }}"
  );
  expect(e2e.jobs.e2e.if).toBeUndefined();
});

test("every external action is pinned, including native releases and composite actions", async () => {
  const paths = [
    ...new Bun.Glob(".github/workflows/*.{yml,yaml}").scanSync("."),
    ...new Bun.Glob(".github/actions/**/action.{yml,yaml}").scanSync("."),
  ];
  expect(paths).toContain(".github/workflows/release.yml");
  expect(paths).toContain(".github/actions/setup-bun/action.yml");
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key === "uses" && typeof entry === "string") {
        if (entry.startsWith("./")) {
          continue;
        }
        expect(entry).toMatch(/@[a-f0-9]{40}$/);
      } else {
        inspect(entry);
      }
    }
  };
  for (const path of paths) {
    inspect(parse(await Bun.file(path).text()));
  }
});

test("workflows share repository Bun setup and preserve download-cache opt-ins", () => {
  const cached = new Set([
    "changes",
    "quality",
    "typecheck",
    "test",
    "editions",
    "agent-rust",
    "desktop-mcp",
    "release-policy",
    "sites",
  ]);
  for (const path of new Bun.Glob(".github/workflows/*.yml").scanSync(".")) {
    const document = parse(readFileSync(path, "utf8"));
    expect(document.env?.BUN_VERSION).toBeUndefined();
    for (const [name, job] of Object.entries(document.jobs) as [
      string,
      {
        steps?: {
          uses?: string;
          run?: string;
          with?: Record<string, unknown>;
        }[];
      },
    ][]) {
      const steps = job.steps ?? [];
      expect(
        steps.some((step) => step.uses?.startsWith("oven-sh/setup-bun@"))
      ).toBe(false);
      const setup = steps.findIndex(
        (step) => step.uses === "./.github/actions/setup-bun"
      );
      if (setup < 0) {
        continue;
      }
      expect(
        steps
          .slice(0, setup)
          .some((step) => step.uses?.startsWith("actions/checkout@"))
      ).toBe(true);
      expect(steps[setup]?.with?.cache === "true").toBe(
        path.endsWith("/ci.yml") && cached.has(name)
      );
      const install = steps.findIndex(
        (step) => step.run === "bun install --frozen-lockfile"
      );
      if (install >= 0) {
        expect(install).toBeGreaterThan(setup);
      }
    }
  }
  const setup = parse(
    readFileSync(".github/actions/setup-bun/action.yml", "utf8")
  );
  expect(setup.inputs.cache.default).toBe("false");
  expect(
    setup.runs.steps.some((step: { run?: string }) =>
      step.run?.includes("bun install")
    )
  ).toBe(false);
});

test("CI gate and tooling tests stay unconditional; checkout keeps explicit release ref", () => {
  const { jobs } = workflow("ci");
  expect(jobs.ci.if).toBe("always()");
  expect(jobs.ci.name).toBe("CI");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
  expect(jobs.ci.steps[0].with.ref).toBe("${{ inputs.ref || github.sha }}");
  expect(
    jobs.ci.steps.some((step: { run?: string }) =>
      step.run?.includes("bun install")
    )
  ).toBe(false);
  const tests = jobs.test.steps.find((step: { run?: string }) =>
    step.run?.includes("bun test tooling/ci ")
  );
  expect(tests).toBeDefined();
  expect(tests.if).toBeUndefined();
  const e2e = workflow("e2e");
  expect(e2e.env?.CYPRESS_INSTALL_BINARY).toBeUndefined();
  expect(
    e2e.jobs.e2e.steps.some(
      (step: { run?: string }) => step.run === "bun pm cache rm"
    )
  ).toBe(true);
  expect(workflow("ci").env.CYPRESS_INSTALL_BINARY).toBe(0);
});

test("shared setup uses the resolved version for installation and download-cache keys", () => {
  const setup = parse(
    readFileSync(".github/actions/setup-bun/action.yml", "utf8")
  );
  const steps = setup.runs.steps;
  const version = steps.find((step: { id?: string }) => step.id === "version");
  expect(version.shell).toBe("bash");
  expect(version.run).toBe('node "$GITHUB_ACTION_PATH/version.cjs"');
  const install = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("oven-sh/setup-bun@")
  );
  expect(install.with["bun-version"]).toBe(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
    "${{ steps.version.outputs.version }}"
  );
  const cache = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/cache@")
  );
  expect(cache.if).toBe("inputs.cache == 'true'");
  expect(cache.with.path).toBe("~/.bun/install/cache");
  for (const key of [cache.with.key, cache.with["restore-keys"]]) {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
    expect(key).toContain("${{ steps.version.outputs.version }}");
  }
});

test("workflow exports every selection flag validated by the gate", () => {
  expect(Object.keys(workflow("ci").jobs.changes.outputs).sort()).toEqual(
    [...checks].sort()
  );
});

test("AIO publishes tested native architectures only after exact-source CI", () => {
  const aio = workflow("aio.publish");
  expect(aio.on.push.tags).toEqual(["aio-v*"]);
  expect(aio.concurrency["cancel-in-progress"]).toBe(false);
  expect(aio.jobs.validate.uses).toBe("./.github/workflows/ci.yml");
  expect(aio.jobs.build.needs).toEqual(["prepare", "validate"]);
  expect(aio.jobs.publish.needs).toEqual(["prepare", "build"]);
  expect(
    aio.jobs.build.strategy.matrix.include.map(
      (entry: { arch: string }) => entry.arch
    )
  ).toEqual(["amd64", "arm64"]);
  const steps = aio.jobs.build.steps;
  const testIndex = steps.findIndex((step: { run?: string }) =>
    step.run?.includes("network-smoke.sh")
  );
  const pushIndex = steps.findIndex((step: { run?: string }) =>
    step.run?.includes("docker push")
  );
  expect(testIndex).toBeGreaterThan(0);
  expect(pushIndex).toBeGreaterThan(testIndex);
  expect(
    steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("docker/build-push-action@")
    ).with["build-args"]
  ).toBe("LUNARIS_EDITION=community");
  expect(
    workflow("ci").jobs.test.steps.some((step: { run?: string }) =>
      step.run?.includes("tooling/aio")
    )
  ).toBe(true);
});

test("app images use release tags and smoke test both native builds before upload", () => {
  const images = workflow("images.publish");
  expect(images.on.push.tags).toEqual(["api@*", "web@*"]);
  expect(images.jobs.validate.uses).toBe("./.github/workflows/ci.yml");
  expect(images.jobs.build.needs).toEqual(["prepare", "validate"]);
  expect(images.jobs.publish.needs).toEqual(["prepare", "build"]);
  expect(
    images.jobs.build.strategy.matrix.include.map(
      (entry: { arch: string }) => entry.arch
    )
  ).toEqual(["amd64", "arm64"]);
  const steps = images.jobs.build.steps;
  const smoke = steps.findIndex((step: { run?: string }) =>
    step.run?.includes("infra/images/smoke.sh")
  );
  expect(smoke).toBeGreaterThan(0);
  expect(
    steps.findIndex((step: { run?: string }) =>
      step.run?.includes("docker push")
    )
  ).toBeGreaterThan(smoke);
});

test("reusable CI isolates app release tags pointing at the same commit", () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
  expect(workflow("ci").concurrency.group).toContain("${{ github.ref }}");
  expect(workflow("ci").concurrency.group).toContain(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
    "${{ inputs.concurrency-scope }}"
  );
  expect(
    workflow("images.publish").jobs.validate.with["concurrency-scope"]
  ).toBe(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
    "${{ needs.prepare.outputs.app }}"
  );
});
