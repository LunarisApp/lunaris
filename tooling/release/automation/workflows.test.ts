import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
