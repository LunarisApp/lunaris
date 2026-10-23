import { expect, test } from "bun:test";
import {
  assertRollbackSafe,
  needsSyncRecovery,
  readCoreState,
} from "./core-state";
import type { Candidate } from "./candidate";
import { afterEach, spyOn } from "bun:test";

const candidate: Candidate = {
  schemaVersion: 1,
  sha: "a".repeat(40),
  runId: "1",
  configurationRevision: "v1",
  syncRevision: "a".repeat(64),
  api: {
    sha: "a".repeat(40),
    image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}`,
  },
  web: {
    sha: "a".repeat(40),
    image: `ghcr.io/fixture/web@sha256:${"a".repeat(64)}`,
  },
};
let restore: (() => void) | undefined;
afterEach(() => restore?.());

test("rollback rejects sync changes hidden behind newer failed attempts", () => {
  const changed = { ...candidate, syncRevision: "b".repeat(64) };
  const state = { current: candidate, pending: [candidate, changed] };
  expect(() => assertRollbackSafe(state, candidate)).toThrow("unresolved");
  expect(needsSyncRecovery(state, candidate)).toBe(true);
  expect(() =>
    assertRollbackSafe({ current: candidate, pending: [candidate] }, candidate)
  ).not.toThrow();
  expect(
    needsSyncRecovery({ current: candidate, pending: [] }, candidate)
  ).toBe(false);
  expect(() =>
    assertRollbackSafe(
      {
        current: candidate,
        pending: [{ ...candidate, configurationRevision: "v2" }],
      },
      candidate
    )
  ).toThrow("configuration");
});

test("state retains all attempts until the newest confirmed composition", async () => {
  const original = {
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
  };
  process.env.GITHUB_REPOSITORY = "fixture/repo";
  process.env.GH_TOKEN = "fixture";
  const changed = { ...candidate, syncRevision: "b".repeat(64) };
  const fetch = spyOn(globalThis, "fetch").mockImplementation((async (
    input: Parameters<typeof globalThis.fetch>[0]
  ) => {
    const url = String(input);
    if (url.includes("/statuses")) {
      return Response.json([
        { state: url.includes("/2/") ? "success" : "failure" },
      ]);
    }
    return Response.json([
      { id: 5, payload: candidate },
      { id: 4, payload: changed },
      { id: 3, payload: candidate },
      { id: 2, payload: candidate },
      { id: 1, payload: changed },
    ]);
  }) as typeof globalThis.fetch);
  restore = () => {
    fetch.mockRestore();
    if (original.repository === undefined) {
      delete process.env.GITHUB_REPOSITORY;
    } else {
      process.env.GITHUB_REPOSITORY = original.repository;
    }
    if (original.token === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = original.token;
    }
  };
  const state = await readCoreState("production");
  expect(state.current).toEqual(candidate);
  expect(state.pending).toEqual([candidate, changed, candidate]);
  expect(needsSyncRecovery(state, candidate)).toBe(true);
});
