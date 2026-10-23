import { expect, test } from "bun:test";
import {
  candidateSchema,
  assertCandidateRun,
  resultingCandidate,
  type Candidate,
} from "./candidate";
import { affectedComponents, affectedWorkspaces } from "./affected";
import { shardSpecs } from "./e2e-specs";

const image = (name: string, digit = "a") => ({
  sha: digit.repeat(40),
  image: `ghcr.io/lunarisapp/hosted-${name}@sha256:${digit.repeat(64)}`,
});
const candidate: Candidate = {
  schemaVersion: 1,
  sha: "a".repeat(40),
  runId: "123",
  api: image("api"),
  web: image("web"),
  syncRevision: "a".repeat(64),
  configurationRevision: "v1",
};

test("initial deployment and untested partial compositions require full core promotion", () => {
  expect(resultingCandidate(candidate, undefined, "core")).toEqual(candidate);
  expect(() => resultingCandidate(candidate, undefined, "api")).toThrow(
    "Initial"
  );
  expect(() =>
    resultingCandidate(
      candidate,
      { ...candidate, api: image("api", "b") },
      "web"
    )
  ).toThrow("different API/sync");
  expect(() =>
    resultingCandidate(
      candidate,
      { ...candidate, syncRevision: "b".repeat(64) },
      "web"
    )
  ).toThrow("different API/sync");
  expect(() =>
    resultingCandidate(
      candidate,
      { ...candidate, web: image("web", "b") },
      "api"
    )
  ).toThrow("different web");
  expect(() =>
    resultingCandidate(
      candidate,
      { ...candidate, configurationRevision: "v2" },
      "web"
    )
  ).toThrow("Configuration");
});
test("compatible api-only and web-only releases preserve tested counterparts", () => {
  const current = { ...candidate, api: image("api", "b") };
  expect(resultingCandidate(candidate, current, "api")).toEqual(candidate);
  expect(
    resultingCandidate(
      candidate,
      { ...candidate, web: image("web", "b") },
      "web"
    )
  ).toEqual(candidate);
});
test("mutable tags, unexpected fields and untrusted workflow producers are rejected", () => {
  expect(() =>
    candidateSchema.parse({
      ...candidate,
      api: { ...candidate.api, image: "ghcr.io/lunarisapp/api:latest" },
    })
  ).toThrow();
  expect(() =>
    candidateSchema.parse({ ...candidate, token: "secret" })
  ).toThrow();
  const run = {
    id: 123,
    head_sha: candidate.sha,
    head_branch: "main",
    event: "push",
    conclusion: "success",
    path: ".github/workflows/core.candidate.yml",
  };
  expect(() => assertCandidateRun(candidate, run)).not.toThrow();
  for (const override of [
    { id: 124 },
    { head_sha: "b".repeat(40) },
    { head_branch: "feature" },
    { event: "pull_request" },
    { conclusion: "failure" },
    { path: ".github/workflows/ci.yml" },
  ]) {
    expect(() =>
      assertCandidateRun(candidate, { ...run, ...override })
    ).toThrow();
  }
});
test("one workspace closure drives deployment and CI selection", () => {
  const workspaces = [
    { name: "@repo/utils", path: "internal/utils", dependencies: [] },
    { name: "landing", path: "apps/landing", dependencies: ["@repo/utils"] },
    { name: "web", path: "apps/web", dependencies: ["@repo/utils"] },
  ];
  expect(
    affectedWorkspaces(["internal/utils/src/index.ts"], workspaces).sort()
  ).toEqual(["@repo/utils", "landing", "web"]);
  expect(affectedComponents(["apps/landing/src/page.tsx"], workspaces)).toEqual(
    ["landing"]
  );
  expect(
    affectedComponents(["internal/utils/src/index.ts"], workspaces)
  ).toEqual(["web", "landing", "self-hosted"]);
  expect(affectedComponents(["tooling/unknown.ts"], workspaces)).toContain(
    "api"
  );
  for (const path of [
    "infra/new-provider/config.json",
    "apps/new-app/build.ts",
  ]) {
    expect(affectedComponents([path], workspaces)).toContain("api");
  }
  expect(affectedComponents(["README.md"], workspaces)).toEqual([]);
});
test("three Cypress shards cover every spec exactly once and reject invalid indices", () => {
  const specs = ["z", "a", "b", "c", "d", "e", "f"];
  const shards = [0, 1, 2].flatMap((shard) => shardSpecs(specs, shard, 3));
  expect(shards.sort()).toEqual([...specs].sort());
  expect(new Set(shards).size).toBe(specs.length);
  expect(() => shardSpecs(specs, 3, 3)).toThrow();
});

test("shared branding and hosted image inputs select their deployment targets", () => {
  expect(affectedComponents(["assets/brand/logo.svg"], [])).toEqual([
    "api",
    "web",
    "landing",
    "docs",
    "desktop",
    "self-hosted",
  ]);
  for (const path of [
    "infra/hosted/migrate.ts",
    "infra/self-host/Dockerfile",
  ]) {
    expect(affectedComponents([path], [])).toEqual([
      "api",
      "web",
      "self-hosted",
    ]);
  }
  expect(affectedComponents(["infra/self-host/Caddyfile"], [])).toEqual([
    "self-hosted",
  ]);
});
