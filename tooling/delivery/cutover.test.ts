import { expect, test } from "bun:test";
import {
  assertSettings,
  assertWritableRules,
  desiredRules,
  trunkSettings,
} from "./repository-settings";

test("trunk settings select main, squash only, and retain automatic branch cleanup", () => {
  expect(trunkSettings.default_branch).toBe("main");
  expect(trunkSettings.allow_merge_commit).toBe(false);
  expect(trunkSettings.allow_squash_merge).toBe(true);
  expect(() =>
    assertSettings({ ...trunkSettings, unrelated: true })
  ).not.toThrow();
  expect(() =>
    assertSettings({ ...trunkSettings, default_branch: "next" })
  ).toThrow("default_branch");
});
test("main required checks have no release app or maintainer bypass", () => {
  const rules = desiredRules(123, 456);
  const checks = rules.find(
    (rule) => rule.name === "Release branches - checks"
  )!;
  expect(checks.bypass_actors).toEqual([]);
  expect(JSON.stringify(checks)).toContain('"CI"');
  expect(JSON.stringify(checks)).toContain('"CodeQL"');
  const prs = rules.find((rule) => rule.name === "Release main - PRs")!;
  expect(prs.bypass_actors).toEqual([
    { actor_id: 456, actor_type: "Team", bypass_mode: "pull_request" },
  ]);
  expect(JSON.stringify(prs)).toContain('"allowed_merge_methods":["squash"]');
});
test("new and legacy tags remain immutable without bypass; product tags restrict creation", () => {
  const rules = desiredRules(123, 456);
  const immutable = rules.find(
    (rule) => rule.name === "Release tags - immutable"
  )!;
  expect(immutable.bypass_actors).toEqual([]);
  for (const pattern of [
    "refs/tags/v*",
    "refs/tags/cli@*",
    "refs/tags/desktop@*",
    "refs/tags/self-hosted@*",
    "refs/tags/@lunarisapp/ui@*",
  ]) {
    expect(immutable.conditions.ref_name.include).toContain(pattern);
  }
  const creation = rules.find(
    (rule) => rule.name === "Release tags - creation"
  )!;
  expect(creation.bypass_actors).toEqual([
    { actor_id: 123, actor_type: "Integration", bypass_mode: "always" },
  ]);
});
test("retired next cannot change and inherited active rules block automatic migration", () => {
  const freeze = desiredRules(123, 456).find(
    (rule) => rule.name === "Retired next - frozen"
  )!;
  expect(freeze.bypass_actors).toEqual([]);
  expect(freeze.rules.map((rule) => rule.type)).toEqual([
    "update",
    "deletion",
    "non_fast_forward",
  ]);
  expect(() =>
    assertWritableRules(
      [{ id: 1, name: "Org policy", enforcement: "active", source: "other" }],
      "fixture/repo"
    )
  ).toThrow("Inherited rules");
  expect(() =>
    assertWritableRules(
      [{ id: 1, name: "Local", enforcement: "active", source: "fixture/repo" }],
      "fixture/repo"
    )
  ).not.toThrow();
});

test("solo maintainer bypass is PR-only and cannot bypass CI or immutable history", () => {
  const rules = desiredRules(123, 456, "User");
  expect(
    rules.find((rule) => rule.name === "Release main - PRs")!.bypass_actors
  ).toEqual([
    { actor_id: 456, actor_type: "User", bypass_mode: "pull_request" },
  ]);
  for (const name of [
    "Release branches - checks",
    "Release branches - immutable history",
    "Release tags - immutable",
  ]) {
    expect(rules.find((rule) => rule.name === name)!.bypass_actors).toEqual([]);
  }
});
