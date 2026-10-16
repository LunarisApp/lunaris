import { describe, expect, it } from "bun:test";
import { createPlans, PUBLIC_PLAN_CATALOG } from "./billing";
import {
  entitlementSnapshotSchema,
  FEATURE,
  LIMIT,
  OWNED_ORGANIZATION_FAIR_USE_LIMIT,
  PLAN,
  planHasFeature,
  resolveEntitlements,
  resolvePlanFeatures,
  resolvePlanSlug,
  UNLIMITED,
} from "./entitlements";
import { resolveSyncAccess } from "./sync-access";

describe("organization plans", () => {
  it("gives Free 25 items and 3 members", () => {
    const result = resolveEntitlements();

    expect(result.plan).toBe(PLAN.free);
    expect(result.limit(LIMIT.maxResources)).toBe(25);
    expect(result.limit(LIMIT.maxMembers)).toBe(3);
  });

  it("gives Plus unlimited items and 10 members", () => {
    const result = resolveEntitlements(PLAN.plus);

    expect(result.limit(LIMIT.maxResources)).toBe(UNLIMITED);
    expect(result.limit(LIMIT.maxMembers)).toBe(10);
  });

  it.each([PLAN.business, PLAN.enterprise])(
    "gives %s unlimited items and members",
    (plan) => {
      const result = resolveEntitlements(plan);
      expect(result.limit(LIMIT.maxResources)).toBe(UNLIMITED);
      expect(result.limit(LIMIT.maxMembers)).toBe(UNLIMITED);
    }
  );

  it("requires Agent Work approval on every plan", () => {
    for (const plan of Object.values(PLAN)) {
      expect(planHasFeature(plan, FEATURE.agentWork)).toBe(false);
      expect(resolvePlanFeatures(plan)).toEqual({ "agent-work": false });
    }
  });

  it("reads legacy snapshots without retaining Assistant access", () => {
    expect(
      entitlementSnapshotSchema.shape.features.parse({ assistant: true })
    ).toEqual({ "agent-work": false });
  });

  it("keeps the owned-organization fair-use cap explicit", () => {
    expect(OWNED_ORGANIZATION_FAIR_USE_LIMIT).toBe(10);
  });

  it("defines per-member monthly and annual pricing", () => {
    expect(
      PUBLIC_PLAN_CATALOG.map(
        ({ interval, plan, pricePerMemberMonthlyCents }) => ({
          interval,
          plan,
          pricePerMemberMonthlyCents,
        })
      )
    ).toEqual([
      { interval: "month", plan: PLAN.plus, pricePerMemberMonthlyCents: 1000 },
      { interval: "year", plan: PLAN.plus, pricePerMemberMonthlyCents: 800 },
      {
        interval: "month",
        plan: PLAN.business,
        pricePerMemberMonthlyCents: 2000,
      },
      {
        interval: "year",
        plan: PLAN.business,
        pricePerMemberMonthlyCents: 1600,
      },
    ]);
  });

  it("resolves Polar products to organization plans", () => {
    const plans = [
      { plan: PLAN.plus, productId: "plus-product" },
      { plan: PLAN.business, productId: "business-product" },
    ];
    expect(resolvePlanSlug("plus-product", plans)).toBe(PLAN.plus);
    expect(resolvePlanSlug("unknown", plans)).toBeNull();
  });

  it("rejects duplicate Polar product mappings", () => {
    expect(() =>
      createPlans({
        businessMonthly: "duplicate",
        businessYearly: "business-yearly",
        plusMonthly: "duplicate",
        plusYearly: "plus-yearly",
      })
    ).toThrow("Polar product IDs must be non-empty and unique.");
  });

  it.each(["toString", "constructor", "__proto__", "unknown"])(
    "rejects invalid product plan %s",
    (plan) => {
      expect(
        resolvePlanSlug("product", [{ plan, productId: "product" }])
      ).toBeNull();
    }
  );

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid snapshot limit %s",
    (limit) => {
      for (const limitId of Object.values(LIMIT)) {
        expect(
          entitlementSnapshotSchema.shape.limits.safeParse({
            ...resolveEntitlements().limits,
            [limitId]: limit,
          }).success
        ).toBe(false);
      }
    }
  );

  it("validates organization-scoped snapshots", () => {
    const free = resolveEntitlements();
    expect(
      entitlementSnapshotSchema.parse({
        billingManagement: "polar",
        features: { "agent-work": false },
        resourceCount: 12,
        limits: free.limits,
        offlineAccessUntil: null,
        plan: PLAN.free,
        verifiedAt: "2026-07-19T10:00:00.000Z",
        organizationId: "organization-1",
      }).organizationId
    ).toBe("organization-1");
  });
});

describe("sync capability", () => {
  it("allows every authenticated organization to cloud sync", () => {
    expect(resolveSyncAccess({ isAnonymous: false })).toBe("cloud");
  });

  it("keeps anonymous sessions local", () => {
    expect(resolveSyncAccess({ isAnonymous: true })).toBe("local-only");
  });
});
