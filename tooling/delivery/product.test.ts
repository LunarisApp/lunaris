import { expect, test } from "bun:test";
import {
  productVersion,
  productPlanSchema,
  assetReceiptSchema,
  assertSamePlan,
} from "./product";

test("initial product version exceeds all historical app versions, excluding SDK", () => {
  expect(
    productVersion([
      "@lunarisapp/plugin-sdk@9.0.0",
      "web@0.3.9",
      "desktop@0.12.0",
      "v0.4.0",
    ])
  ).toBe("0.12.1");
  expect(productVersion(["v0.9.0"], "1.0.0")).toBe("1.0.0");
});
test("stable versions reject prereleases, leading zeros, unsafe numbers and regressions", () => {
  for (const version of [
    "0.9.0",
    "0.1.0",
    "01.0.0",
    "1.0.0-rc.1",
    "9999999999999999999.0.0",
  ]) {
    expect(() => productVersion(["v0.9.0"], version)).toThrow();
  }
});
const plan = productPlanSchema.parse({
  schemaVersion: 1,
  version: "1.0.0",
  stagingDeploymentId: 1,
  candidate: {
    schemaVersion: 1,
    sha: "a".repeat(40),
    runId: "1",
    api: {
      sha: "a".repeat(40),
      image: `ghcr.io/example/api@sha256:${"b".repeat(64)}`,
    },
    web: {
      sha: "a".repeat(40),
      image: `ghcr.io/example/web@sha256:${"c".repeat(64)}`,
    },
    syncRevision: "d".repeat(64),
    configurationRevision: "1",
  },
});
test("reservations bind version, source and staging evidence", () => {
  expect(() => assertSamePlan(plan, structuredClone(plan))).not.toThrow();
  expect(() =>
    assertSamePlan(plan, { ...plan, stagingDeploymentId: 2 })
  ).toThrow();
  expect(() => assertSamePlan(plan, { ...plan, version: "1.0.1" })).toThrow();
});
test("asset receipts reject path traversal and invalid checksums", () => {
  expect(
    assetReceiptSchema.safeParse({
      schemaVersion: 1,
      version: "1.0.0",
      sourceCommit: "a".repeat(40),
      group: "cli",
      assets: [{ name: "../secret", sha256: "a".repeat(64) }],
    }).success
  ).toBe(false);
});

test("desktop receipts accept only their platform installer and version", () => {
  for (const [group, name] of [
    ["desktop-windows", "Lunaris-desktop-1.0.0-x86_64-pc-windows-msvc.exe"],
    ["desktop-linux", "Lunaris-desktop-1.0.0-x86_64-unknown-linux-gnu.deb"],
  ]) {
    const receipt = {
      schemaVersion: 1,
      version: "1.0.0",
      sourceCommit: "a".repeat(40),
      producerRunId: "1",
      group,
      assets: [{ name, sha256: "b".repeat(64) }],
    };
    expect(assetReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      assetReceiptSchema.safeParse({ ...receipt, version: "1.0.1" }).success
    ).toBe(false);
    expect(
      assetReceiptSchema.safeParse({ ...receipt, group: "desktop" }).success
    ).toBe(false);
  }
});
