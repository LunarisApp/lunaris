import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { checks, optionalJobs } from "../ci-selection";
import { evaluateCI } from "./gate";

function fixture() {
  const needs: Record<
    string,
    { result: string; outputs?: Record<string, string> }
  > = {
    changes: {
      result: "success",
      outputs: Object.fromEntries(checks.map((name) => [name, "false"])),
    },
    quality: { result: "success" },
    typecheck: { result: "success" },
    test: { result: "success" },
    "release-policy": { result: "skipped" },
    e2e: { result: "skipped" },
  };
  for (const name of optionalJobs) {
    needs[name] = { result: "skipped" };
  }
  return needs;
}

test("mandatory jobs must succeed and must exist", () => {
  expect(evaluateCI(fixture(), "push", false)).toEqual([]);
  for (const name of ["changes", "quality", "typecheck", "test"]) {
    for (const result of ["skipped", "failure", "cancelled", "", undefined]) {
      const needs = fixture();
      if (result === undefined) {
        delete needs[name];
      } else {
        needs[name] = { ...needs[name], result };
      }
      expect(evaluateCI(needs, "push", false).length).toBeGreaterThan(0);
    }
  }
});

test("optional jobs require valid selection and reject failures even when unselected", () => {
  for (const name of optionalJobs) {
    for (const selected of ["true", "false", "invalid", undefined]) {
      for (const result of [
        "success",
        "skipped",
        "failure",
        "cancelled",
        undefined,
      ]) {
        const needs = fixture();
        const outputs = needs.changes?.outputs;
        if (!outputs) {
          throw new Error("Fixture outputs missing");
        }
        if (selected === undefined) {
          delete outputs[name];
        } else {
          outputs[name] = selected;
        }
        if (result === undefined) {
          delete needs[name];
        } else {
          needs[name] = { result };
        }
        const allowed =
          (selected === "true" && result === "success") ||
          (selected === "false" &&
            ["success", "skipped", undefined].includes(result));
        expect(evaluateCI(needs, "push", false).length === 0).toBe(allowed);
      }
    }
  }
});

test("release policy and E2E obey event requirements", () => {
  for (const event of ["push", "pull_request", "workflow_dispatch"]) {
    for (const required of [true, false]) {
      for (const result of [
        "success",
        "skipped",
        "failure",
        "cancelled",
        undefined,
      ]) {
        const needs = fixture();
        needs["release-policy"] = { result: "success" };
        if (result === undefined) {
          delete needs.e2e;
        } else {
          needs.e2e = { result };
        }
        expect(evaluateCI(needs, event, required).length === 0).toBe(
          result === "success" ||
            (!required && (result === "skipped" || result === undefined))
        );
        needs.e2e = { result: "success" };
        if (result === undefined) {
          delete needs["release-policy"];
        } else {
          needs["release-policy"] = { result };
        }
        expect(evaluateCI(needs, event, required).length === 0).toBe(
          result === "success" ||
            (event !== "pull_request" &&
              (result === "skipped" || result === undefined))
        );
      }
    }
  }
});

test("malformed needs and unexpected failed jobs fail closed", () => {
  for (const needs of [
    null,
    [],
    "",
    1,
    {},
    { ...fixture(), changes: null },
    { ...fixture(), extra: { result: "failure" } },
    { ...fixture(), extra: { result: ["success"] } },
  ]) {
    expect(evaluateCI(needs, "push", false).length).toBeGreaterThan(0);
  }
});

test("CLI validates inputs and returns failure to Actions", () => {
  for (const overrides of [
    {},
    { NEEDS_JSON: "{" },
    { NEEDS_JSON: "null" },
    { EVENT: "" },
    { E2E_REQUIRED: "" },
    { E2E_REQUIRED: "true" },
  ]) {
    const result = Bun.spawnSync(
      [process.execPath, resolve(import.meta.dir, "gate.ts")],
      {
        env: {
          ...process.env,
          NEEDS_JSON: JSON.stringify(fixture()),
          EVENT: "push",
          E2E_REQUIRED: "false",
          ...overrides,
        },
      }
    );
    expect(result.exitCode === 0).toBe(Object.keys(overrides).length === 0);
  }
});

test("every selection flag must be present and boolean, including checks inside jobs", () => {
  for (const name of checks) {
    for (const invalid of [undefined, "", "TRUE", "1"]) {
      const needs = fixture();
      const outputs = needs.changes?.outputs;
      if (!outputs) {
        throw new Error("Fixture outputs missing");
      }
      if (invalid === undefined) {
        delete outputs[name];
      } else {
        outputs[name] = invalid;
      }
      expect(evaluateCI(needs, "push", false)).toContain(
        `Missing or invalid selection: ${name}`
      );
    }
  }
});

test("selected in-job checks rely on their successful parent jobs", () => {
  for (const [check, job] of [
    ["brand", "quality"],
    ["powersync", "quality"],
    ["release", "test"],
  ] as const) {
    const needs = fixture();
    const outputs = needs.changes?.outputs;
    if (!outputs) {
      throw new Error("Fixture outputs missing");
    }
    outputs[check] = "true";
    expect(evaluateCI(needs, "push", false)).toEqual([]);
    needs[job] = { result: "failure" };
    expect(evaluateCI(needs, "push", false)).toContain(
      `Required job ${job} did not succeed`
    );
  }
});
