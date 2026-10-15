import {
  type EntitlementSnapshot,
  PLAN,
  type PlanSlug,
  resolveEntitlements,
} from "@repo/auth/entitlements";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearEntitlementSnapshots,
  parseEntitlementSnapshot,
  readEntitlementSnapshot,
  writeEntitlementSnapshot,
} from "./snapshot";

function makeSnapshot(plan: PlanSlug, organizationId: string): EntitlementSnapshot {
  const resolved = resolveEntitlements(plan);
  return {
    billingManagement: "unavailable",
    features: { "agent-work": false },
    resourceCount: 0,
    limits: { ...resolved.limits },
    offlineAccessUntil: null,
    plan,
    verifiedAt: "2026-07-19T10:00:00.000Z",
    organizationId,
  };
}

describe("entitlement snapshots", () => {
  afterEach(clearEntitlementSnapshots);

  it("does not replace malformed canonical values with legacy values", () => {
    const snapshot = makeSnapshot(PLAN.free, "organization-1");
    expect(() => parseEntitlementSnapshot({
      ...snapshot,
      resourceCount: null,
      itemCount: 0,
    })).toThrow();
    expect(() => parseEntitlementSnapshot({
      ...snapshot,
      limits: { ...snapshot.limits, max_resources: null, max_items: 25 },
    })).toThrow();
  });

  it("rejects legacy snapshots instead of converting resource counts and limits", () => {
    const { resourceCount, limits, ...snapshot } = makeSnapshot(PLAN.plus, "organization-1");
    const legacySnapshot = {
      ...snapshot,
      itemCount: resourceCount,
      limits: { max_items: limits.max_resources, max_members: limits.max_members },
    };
    expect(() => parseEntitlementSnapshot(legacySnapshot)).toThrow();
    localStorage.setItem("lunaris.entitlements.v3", JSON.stringify({
      version: 3,
      records: { "eu:user-1:organization-1": legacySnapshot },
    }));
    expect(readEntitlementSnapshot("eu", "user-1", "organization-1")).toBeNull();
  });

  it("persists state by region, user, and organization", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus, "organization-1"),
    );

    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-1"),
    ).toMatchObject({ plan: PLAN.plus, organizationId: "organization-1" });
    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-2"),
    ).toBeNull();
  });

  it("rejects records whose embedded organization does not match their key", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus, "organization-2"),
    );
    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-1"),
    ).toBeNull();

    localStorage.setItem(
      "lunaris.entitlements.v3",
      JSON.stringify({
        records: {
          "eu:user-1:organization-1": makeSnapshot(PLAN.plus, "organization-2"),
        },
        version: 3,
      }),
    );
    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-1"),
    ).toBeNull();
  });

  it("clears all organization snapshots on logout", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus, "organization-1"),
    );
    clearEntitlementSnapshots();
    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-1"),
    ).toBeNull();
  });
});
