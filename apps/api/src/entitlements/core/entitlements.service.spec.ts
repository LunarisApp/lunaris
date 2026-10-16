import { organization } from "../../auth/auth.entity";
import { describe, expect, it, mock } from "bun:test";
import { BILLING_INTERVAL, createPlans } from "@repo/auth/billing";
import { FEATURE, LIMIT, PLAN } from "@repo/auth/entitlements";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { BillingService } from "../billing/billing.service";
import { SeatService } from "../seats/seat.service";
import {
  FeatureAccessRequiredError,
  SubscriptionOwnershipMismatchError,
  SubscriptionPurchaserMismatchError,
  OrganizationBillingOwnerRequiredError,
  OrganizationBillingUnavailableError,
  OrganizationResourceLimitError,
  OrganizationMembershipRequiredError,
  OrganizationPlanMemberLimitError,
  OrganizationSubscriptionConflictError,
} from "./entitlements.errors";
import { EntitlementsService } from "./entitlements.service";

function makeService(options?: {
  db?: unknown;
  developmentPlan?: "free" | "plus" | "business" | "enterprise" | null;
  posthog?: unknown;
  rows?: unknown[][];
  polar?: unknown;
}) {
  const rows = [...(options?.rows ?? [])];
  const nextRows = () => {
    const result = rows.shift() ?? [];
    return {
      limit: () => Promise.resolve(result),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    };
  };
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: nextRows }),
        where: nextRows,
      }),
    }),
  };
  const dbService = { db: options?.db ?? db } as never;
  const plans = createPlans({
    businessMonthly: "business-monthly-product",
    businessYearly: "business-yearly-product",
    plusMonthly: "plus-monthly-product",
    plusYearly: "plus-yearly-product",
  });
  const polar = (options?.polar ?? null) as never;
  const config = {
    developmentPlan: options?.developmentPlan ?? null,
  } as never;
  const billing = new BillingService(dbService, plans, polar, {
    frontendUrl: "https://app.lunaris.test",
  } as never);
  const seats = new SeatService(dbService, polar, config, billing);
  return new EntitlementsService(
    dbService,
    (options?.posthog ?? null) as never,
    config,
    billing,
    seats
  );
}

function makeUpsertHarness(rows: unknown[][]) {
  const pendingRows = [...rows];
  const nextRows = () => {
    const result = pendingRows.shift() ?? [];
    return {
      for: () => Promise.resolve(result),
      limit: () => Promise.resolve(result),
    };
  };
  const updateWhere = mock(async () => undefined);
  const updateSet = mock((_values: Record<string, unknown>) => ({
    where: updateWhere,
  }));
  const insertValues = mock(
    async (_values: Record<string, unknown>) => undefined
  );
  const tx = {
    execute: mock(async () => undefined),
    insert: mock(() => ({ values: insertValues })),
    select: () => ({
      from: (table: unknown) => ({
        where:
          table === organization
            ? () => ({ for: async () => [{ id: "organization-1" }] })
            : nextRows,
      }),
    }),
    update: mock(() => ({ set: updateSet })),
  };
  const transaction = mock(
    async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
  );

  return {
    insertValues,
    service: makeService({ db: { transaction } }),
    updateSet,
  };
}

function makeBillingHarness(options?: {
  billingConfigured?: boolean;
  localSubscription?: Record<string, unknown> | null;
  members?: number;
  openCheckouts?: Record<string, unknown>[];
  owner?: boolean;
  pendingInvitations?: number;
  remoteSubscriptions?: Record<string, unknown>[];
}) {
  const polarCheckoutCreate = mock(async () => ({
    url: "https://polar.test/checkout/new",
  }));
  const polarCheckoutUpdate = mock(async () => ({
    url: "https://polar.test/checkout/existing",
  }));
  const polarCheckoutList = mock(async () => ({
    result: { items: options?.openCheckouts ?? [] },
  }));
  const polarSubscriptionList = mock(async () => ({
    result: { items: options?.remoteSubscriptions ?? [] },
  }));
  const polarSubscriptionUpdate = mock(
    async (input: {
      id: string;
      subscriptionUpdate: { productId: string };
    }) => ({
      ...subscriptionParams,
      id: input.id,
      productId: input.subscriptionUpdate.productId,
    })
  );
  const polarCustomerSessionCreate = mock(async () => ({
    customerPortalUrl: "https://polar.test/portal/session-1",
  }));
  let countQuery = 0;
  const asQuery = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    return {
      for: () => promise,
      limit: () => promise,
      then: promise.then.bind(promise),
    };
  };
  const tx = {
    execute: mock(async () => undefined),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: async () => undefined }),
    select: mock((fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          if ("modifiedAt" in fields) {
            return asQuery([existingSubscription]);
          }
          if ("currentPeriodEnd" in fields) {
            return asQuery(
              options?.localSubscription ? [options.localSubscription] : []
            );
          }
          if ("value" in fields) {
            const value =
              countQuery++ === 0
                ? (options?.members ?? 3)
                : (options?.pendingInvitations ?? 0);
            return asQuery([{ value }]);
          }
          if ("slug" in fields) {
            return asQuery([{ slug: "northstar" }]);
          }
          return asQuery([{ id: "organization-1" }]);
        },
      }),
    })),
  };
  const transaction = mock(
    async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
  );
  const db = {
    select: mock((fields: Record<string, unknown>) => ({
      from: () => ({
        where: () =>
          "slug" in fields
            ? { limit: async () => [{ slug: "northstar" }] }
            : {
                limit: async () =>
                  options?.owner === false ? [] : [{ id: "membership-1" }],
              },
      }),
    })),
    transaction,
  };
  const polar = {
    checkouts: {
      create: polarCheckoutCreate,
      list: polarCheckoutList,
      update: polarCheckoutUpdate,
    },
    subscriptions: {
      list: polarSubscriptionList,
      update: polarSubscriptionUpdate,
    },
    customerSessions: { create: polarCustomerSessionCreate },
  };

  return {
    polarCheckoutCreate,
    polarCheckoutList,
    polarCheckoutUpdate,
    polarCustomerSessionCreate,
    polarSubscriptionList,
    polarSubscriptionUpdate,
    service: makeService({
      db,
      polar: options?.billingConfigured === false ? null : polar,
    }),
    transaction,
  };
}

const subscriptionParams = {
  canceledAt: null,
  currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
  modifiedAt: new Date("2026-08-01T00:00:00.000Z"),
  organizationId: "organization-1",
  polarSubscriptionId: "subscription-1",
  productId: "plus-monthly-product",
  purchasedByUserId: "owner-1",
  status: "active",
};

const existingSubscription = {
  modifiedAt: new Date("2026-07-01T00:00:00.000Z"),
  organizationId: "organization-1",
  purchasedByUserId: "owner-1",
};

const checkoutParams = {
  interval: BILLING_INTERVAL.month,
  organizationId: "organization-1",
  plan: PLAN.plus,
  user: {
    email: "owner@lunaris.test",
    id: "owner-1",
    name: "Organization Owner",
  },
} as const;

describe("EntitlementsService organization resolution", () => {
  it("defaults organizations without an active subscription to Free", async () => {
    const entitlements =
      await makeService().resolveForOrganization("organization-1");
    expect(entitlements.plan).toBe(PLAN.free);
    expect(entitlements.limit(LIMIT.maxResources)).toBe(25);
    expect(entitlements.limit(LIMIT.maxMembers)).toBe(3);
  });

  it("resolves each organization from its own active subscription", async () => {
    const service = makeService({
      rows: [
        [
          {
            currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
            id: "subscription-1",
            planSlug: PLAN.plus,
          },
        ],
      ],
    });
    expect((await service.resolveForOrganization("organization-1")).plan).toBe(
      PLAN.plus
    );
  });

  it("queries both active and trialing subscriptions", async () => {
    const conditions: SQL[] = [];
    const row = {
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      id: "subscription-1",
      planSlug: PLAN.business,
    };
    const service = makeService({
      db: {
        select: () => ({
          from: () => ({
            where: (condition: SQL) => {
              conditions.push(condition);
              return Object.assign(Promise.resolve([]), {
                limit: () => Promise.resolve([row]),
              });
            },
          }),
        }),
      },
    });

    expect((await service.resolveForOrganization("organization-1")).plan).toBe(
      PLAN.business
    );
    expect(new PgDialect().sqlToQuery(conditions[0]).params).toEqual([
      "organization-1",
      "active",
      "trialing",
    ]);
  });

  it("returns Free after cancellation without mutating organization data", async () => {
    expect(
      (
        await makeService({ rows: [[]] }).resolveForOrganization(
          "organization-1"
        )
      ).plan
    ).toBe(PLAN.free);
  });

  it.each(["unknown-plan", "toString", "__proto__"])(
    "fails closed for invalid stored plan %s",
    async (planSlug) => {
      const service = makeService({ rows: [[{ planSlug }]] });
      expect(
        (await service.resolveForOrganization("organization-1")).plan
      ).toBe(PLAN.free);
    }
  );

  it("does not advertise Agent Work to anonymous users", async () => {
    const snapshot = await makeService({
      developmentPlan: PLAN.business,
      rows: [[], [{ value: 0 }]],
    }).resolveSnapshotForOrganization({
      organizationId: "organization-1",
      user: { email: "", id: "anonymous-1", isAnonymous: true },
    });
    expect(snapshot.features).toMatchObject({
      assistant: false,
      "agent-work": false,
    });
  });

  it.each([0, 1, 2, 20])(
    "keeps organization storage fixed with %s members in offline snapshots",
    async (members) => {
      const snapshot = await makeService({
        developmentPlan: PLAN.business,
        rows: [
          [],
          [{ value: 17 }],
          [],
          [],
          [],
          [],
          [{ value: members }],
          [{ value: 1 }],
        ],
      }).resolveSnapshotForOrganization({
        organizationId: "organization-1",
        user: {
          email: "user@lunaris.test",
          id: "user-1",
          isAnonymous: false,
        },
      });
      expect(snapshot).toMatchObject({
        features: { assistant: false, "agent-work": false },
        resourceCount: 17,
        memberCount: members,
        limits: { max_storage_bytes: 100_000_000_000 },
        pendingInvitationCount: 1,
        plan: PLAN.business,
        organizationId: "organization-1",
      });
    }
  );

  it("counts pending invitations against Free member capacity", async () => {
    const service = makeService({
      rows: [[], [{ value: 2 }], [{ value: 1 }]],
    });
    expect(
      await service.hasMemberCapacity("organization-1", {
        includePendingInvitations: true,
      })
    ).toBe(false);
  });

  it("lets a reserved invitation fill the final accepted-member spot", async () => {
    const service = makeService({ rows: [[], [{ value: 2 }]] });
    expect(
      await service.hasMemberCapacity("organization-1", {
        includePendingInvitations: false,
      })
    ).toBe(true);
  });

  it("applies hidden fair-use cap only to owned organizations", async () => {
    const service = makeService({ rows: [[{ value: 10 }]] });
    expect(await service.canCreateOwnedOrganization("owner-1")).toBe(false);
  });

  it("allows only organization owners to manage billing", async () => {
    const ownerService = makeService({ rows: [[{ id: "membership-1" }]] });
    const memberService = makeService({ rows: [[]] });
    expect(
      await ownerService.canManageBilling("owner-1", "organization-1")
    ).toBe(true);
    expect(
      await memberService.canManageBilling("member-1", "organization-1")
    ).toBe(false);
  });

  it("accepts current organization members", async () => {
    const service = makeService({ rows: [[{ id: "membership-1" }]] });
    await expect(
      service.assertOrganizationMember("user-1", "organization-1")
    ).resolves.toBeUndefined();
  });

  it("rejects removed organization members", async () => {
    const service = makeService({ rows: [[]] });
    await expect(
      service.assertOrganizationMember("user-1", "organization-1")
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });

  it.each(Object.values(PLAN))(
    "gates Agent Work on %s with only the shared flag",
    async (plan) => {
      for (const enabled of [false, true]) {
        const evaluateFlags = mock(async () => ({
          isEnabled: (flag: string) => flag === "agent-work" && enabled,
        }));
        const service = makeService({
          developmentPlan: plan,
          posthog: { evaluateFlags },
        });
        await expect(
          service.hasFeatureAccess({
            feature: FEATURE.agentWork,
            organizationId: "organization-1",
            user: {
              email: "user@lunaris.test",
              id: "user-1",
              isAnonymous: false,
            },
          })
        ).resolves.toBe(enabled);
        expect(evaluateFlags).toHaveBeenCalledTimes(1);
        expect(evaluateFlags).toHaveBeenCalledWith("user-1", {
          flagKeys: ["agent-work"],
          personProperties: { email: "user@lunaris.test", plan },
        });
      }
    }
  );

  it("fails Agent Work closed without flag evaluation", async () => {
    const params = {
      feature: FEATURE.agentWork,
      organizationId: "organization-1",
      user: { email: "user@lunaris.test", id: "user-1", isAnonymous: false },
    };
    await expect(
      makeService({ developmentPlan: PLAN.plus }).hasFeatureAccess(params)
    ).resolves.toBe(false);
    await expect(
      makeService({
        developmentPlan: PLAN.plus,
        posthog: {
          evaluateFlags: mock(async () => {
            throw new Error("Unavailable");
          }),
        },
      }).hasFeatureAccess(params)
    ).resolves.toBe(false);
  });

  it("denies anonymous users before PostHog evaluation", async () => {
    const evaluateFlags = mock(async () => ({ isEnabled: () => true }));

    await expect(
      makeService({
        developmentPlan: PLAN.business,
        posthog: { evaluateFlags },
      }).hasFeatureAccess({
        feature: FEATURE.agentWork,
        organizationId: "organization-1",
        user: {
          email: "guest@lunaris.test",
          id: "guest-1",
          isAnonymous: true,
        },
      })
    ).resolves.toBe(false);
    expect(evaluateFlags).not.toHaveBeenCalled();
  });

  it("checks membership before rejecting feature access", async () => {
    const service = makeService({
      developmentPlan: PLAN.plus,
      rows: [[]],
    });

    await expect(
      service.assertFeatureAccess({
        feature: FEATURE.agentWork,
        organizationId: "organization-1",
        user: {
          email: "removed@lunaris.test",
          id: "removed-user",
          isAnonymous: false,
        },
      })
    ).rejects.toBeInstanceOf(FeatureAccessRequiredError);

    const member = makeService({
      developmentPlan: PLAN.plus,
      rows: [[{ id: "membership-1" }]],
    });
    await expect(
      member.assertFeatureAccess({
        feature: FEATURE.agentWork,
        organizationId: "organization-1",
        user: {
          email: "member@lunaris.test",
          id: "member-1",
          isAnonymous: false,
        },
      })
    ).rejects.toBeInstanceOf(FeatureAccessRequiredError);
  });

  it("does not query organizations when Polar is unavailable", async () => {
    const select = mock(() => {
      throw new Error("unexpected query");
    });
    const service = makeService({ db: { select } });

    await expect(service.reconcileAllMemberSeats()).resolves.toEqual({
      checked: 0,
      failed: 0,
      updated: 0,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("allows item 25 and blocks item 26 on Free", async () => {
    const makeTx = (resourceCount: number) => {
      const rows = [[{ id: "organization-1" }], [], [{ value: resourceCount }]];
      return {
        select: () => ({
          from: () => {
            const where = () => {
              const result = rows.shift() ?? [];
              return {
                for: () => Promise.resolve(result),
                then: (
                  resolve: (value: unknown[]) => unknown,
                  reject?: (reason: unknown) => unknown
                ) => Promise.resolve(result).then(resolve, reject),
              };
            };
            return { innerJoin: () => ({ where }), where };
          },
        }),
      };
    };
    const service = makeService({ developmentPlan: PLAN.free });

    await expect(
      service.assertCanCreateResource(makeTx(24) as never, "organization-1")
    ).resolves.toBeUndefined();
    await expect(
      service.assertCanCreateResource(makeTx(25) as never, "organization-1")
    ).rejects.toBeInstanceOf(OrganizationResourceLimitError);
  });
});

describe("EntitlementsService organization billing", () => {
  it("returns owner-authorized total and seats from the full subscription", async () => {
    const currentPeriodEnd = new Date("2026-09-01T00:00:00.000Z");
    const { polarSubscriptionList, service } = makeBillingHarness({
      remoteSubscriptions: [
        {
          amount: 4800,
          cancelAtPeriodEnd: false,
          currency: "usd",
          currentPeriodEnd,
          id: "subscription-1",
          productId: "business-monthly-product",
          recurringInterval: "month",
          seats: 3,
          status: "active",
        },
      ],
    });

    await expect(
      service.getBillingState({
        organizationId: "organization-1",
        userId: "owner-1",
      })
    ).resolves.toEqual({
      activeSubscriptions: [
        {
          amount: 4800,
          cancelAtPeriodEnd: false,
          currency: "usd",
          currentPeriodEnd: currentPeriodEnd.toISOString(),
          id: "subscription-1",
          productId: "business-monthly-product",
          recurringInterval: "month",
          seats: 3,
          status: "active",
        },
      ],
    });
    expect(polarSubscriptionList).toHaveBeenCalledWith({
      active: true,
      limit: 2,
      metadata: { referenceId: "organization-1" },
    });
  });

  it("authorizes billing-state owners before querying Polar", async () => {
    const { polarSubscriptionList, service } = makeBillingHarness({
      owner: false,
    });

    await expect(
      service.getBillingState({
        organizationId: "organization-1",
        userId: "member-1",
      })
    ).rejects.toBeInstanceOf(OrganizationBillingOwnerRequiredError);
    expect(polarSubscriptionList).not.toHaveBeenCalled();
  });

  it("authorizes owners before revealing billing availability", async () => {
    const { service, transaction } = makeBillingHarness({
      billingConfigured: false,
      owner: false,
    });

    await expect(service.createCheckout(checkoutParams)).rejects.toBeInstanceOf(
      OrganizationBillingOwnerRequiredError
    );
    await expect(
      service.changePlan({
        interval: BILLING_INTERVAL.year,
        organizationId: "organization-1",
        plan: PLAN.business,
        userId: "member-1",
      })
    ).rejects.toBeInstanceOf(OrganizationBillingOwnerRequiredError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("fails closed when an owner has no configured billing provider", async () => {
    const { service, transaction } = makeBillingHarness({
      billingConfigured: false,
    });

    await expect(service.createCheckout(checkoutParams)).rejects.toBeInstanceOf(
      OrganizationBillingUnavailableError
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("bills accepted members while pending invitations only reserve capacity", async () => {
    const { polarCheckoutCreate, service } = makeBillingHarness({
      members: 7,
      pendingInvitations: 3,
    });

    await expect(service.createCheckout(checkoutParams)).resolves.toEqual({
      url: "https://polar.test/checkout/new",
    });
    expect(polarCheckoutCreate).toHaveBeenCalledWith({
      allowTrial: false,
      customerEmail: "owner@lunaris.test",
      customerName: "Organization Owner",
      externalCustomerId: "owner-1",
      maxSeats: 7,
      metadata: { referenceId: "organization-1" },
      minSeats: 7,
      products: [
        "plus-monthly-product",
        "plus-yearly-product",
        "business-monthly-product",
        "business-yearly-product",
      ],
      returnUrl: "https://app.lunaris.test/northstar/settings?tab=billing",
      seats: 7,
      successUrl: "https://app.lunaris.test/northstar/settings?tab=billing",
    });
  });

  it("opens an owner portal with an organization-aware return URL", async () => {
    const { polarCustomerSessionCreate, service } = makeBillingHarness();

    await expect(
      service.createPortal({
        organizationId: "organization-1",
        userId: "owner-1",
      })
    ).resolves.toEqual({ url: "https://polar.test/portal/session-1" });
    expect(polarCustomerSessionCreate).toHaveBeenCalledWith({
      externalCustomerId: "owner-1",
      externalMemberId: "owner-1",
      returnUrl: "https://app.lunaris.test/northstar/settings?tab=billing",
    });
  });

  it("authorizes portal owners before revealing billing availability", async () => {
    const { polarCustomerSessionCreate, service } = makeBillingHarness({
      owner: false,
    });

    await expect(
      service.createPortal({
        organizationId: "organization-1",
        userId: "member-1",
      })
    ).rejects.toBeInstanceOf(OrganizationBillingOwnerRequiredError);
    expect(polarCustomerSessionCreate).not.toHaveBeenCalled();
  });

  it("rejects Plus when accepted and pending members exceed ten", async () => {
    const { polarCheckoutCreate, polarCheckoutList, service } =
      makeBillingHarness({ members: 9, pendingInvitations: 2 });

    await expect(service.createCheckout(checkoutParams)).rejects.toBeInstanceOf(
      OrganizationPlanMemberLimitError
    );
    expect(polarCheckoutList).not.toHaveBeenCalled();
    expect(polarCheckoutCreate).not.toHaveBeenCalled();
  });

  it("offers only Business products to organizations above Plus capacity", async () => {
    const { polarCheckoutCreate, service } = makeBillingHarness({
      members: 11,
      pendingInvitations: 2,
    });

    await service.createCheckout({
      ...checkoutParams,
      interval: BILLING_INTERVAL.year,
      plan: PLAN.business,
    });

    expect(polarCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSeats: 11,
        minSeats: 11,
        products: ["business-yearly-product", "business-monthly-product"],
        seats: 11,
      })
    );
  });

  it("blocks duplicate checkout when local or remote subscription is active", async () => {
    const local = makeBillingHarness({
      localSubscription: {
        currentPeriodEnd: null,
        id: "subscription-local",
        planSlug: PLAN.plus,
        productId: "plus-monthly-product",
      },
    });
    await expect(
      local.service.createCheckout(checkoutParams)
    ).rejects.toBeInstanceOf(OrganizationSubscriptionConflictError);
    expect(local.polarSubscriptionList).not.toHaveBeenCalled();
    expect(local.polarCheckoutCreate).not.toHaveBeenCalled();

    const remote = makeBillingHarness({
      remoteSubscriptions: [
        {
          currentPeriodEnd: null,
          id: "subscription-remote",
          productId: "plus-monthly-product",
        },
      ],
    });
    await expect(
      remote.service.createCheckout(checkoutParams)
    ).rejects.toBeInstanceOf(OrganizationSubscriptionConflictError);
    expect(remote.polarCheckoutCreate).not.toHaveBeenCalled();
  });

  it("reuses an unchanged open checkout without another provider write", async () => {
    const openCheckout = {
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      id: "checkout-1",
      metadata: { referenceId: "organization-1" },
      product: { id: "plus-monthly-product" },
      products: [
        { id: "plus-monthly-product" },
        { id: "plus-yearly-product" },
        { id: "business-monthly-product" },
        { id: "business-yearly-product" },
      ],
      seats: 3,
      url: "https://polar.test/checkout/checkout-1",
    };
    const { polarCheckoutCreate, polarCheckoutUpdate, service } =
      makeBillingHarness({ openCheckouts: [openCheckout] });

    await expect(service.createCheckout(checkoutParams)).resolves.toEqual({
      url: openCheckout.url,
    });
    expect(polarCheckoutUpdate).not.toHaveBeenCalled();
    expect(polarCheckoutCreate).not.toHaveBeenCalled();
  });

  it("creates a current checkout when locked seat bounds are stale", async () => {
    const { polarCheckoutCreate, polarCheckoutUpdate, service } =
      makeBillingHarness({
        members: 4,
        openCheckouts: [
          {
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            id: "checkout-1",
            metadata: { referenceId: "organization-1" },
            product: { id: "plus-yearly-product" },
            products: [
              { id: "plus-monthly-product" },
              { id: "plus-yearly-product" },
            ],
            seats: 3,
            url: "https://polar.test/checkout/checkout-1",
          },
        ],
      });

    await expect(service.createCheckout(checkoutParams)).resolves.toEqual({
      url: "https://polar.test/checkout/new",
    });

    expect(polarCheckoutUpdate).not.toHaveBeenCalled();
    expect(polarCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ maxSeats: 4, minSeats: 4, seats: 4 })
    );
  });

  it("reuses the current checkout while an older seat quantity remains open", async () => {
    const checkout = (id: string, seats: number) => ({
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      id,
      metadata: { referenceId: "organization-1" },
      product: { id: "plus-monthly-product" },
      products: [{ id: "plus-monthly-product" }],
      seats,
      url: `https://polar.test/checkout/${id}`,
    });
    const { polarCheckoutCreate, service } = makeBillingHarness({
      members: 4,
      openCheckouts: [checkout("stale", 3), checkout("current", 4)],
    });

    await expect(service.createCheckout(checkoutParams)).resolves.toEqual({
      url: "https://polar.test/checkout/current",
    });
    expect(polarCheckoutCreate).not.toHaveBeenCalled();
  });

  it("changes selection on a reusable checkout without duplicating it", async () => {
    const { polarCheckoutCreate, polarCheckoutUpdate, service } =
      makeBillingHarness({
        openCheckouts: [
          {
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            id: "checkout-1",
            metadata: { referenceId: "organization-1" },
            product: { id: "plus-yearly-product" },
            products: [
              { id: "plus-monthly-product" },
              { id: "plus-yearly-product" },
            ],
            seats: 3,
            url: "https://polar.test/checkout/checkout-1",
          },
        ],
      });

    await service.createCheckout(checkoutParams);

    expect(polarCheckoutUpdate).toHaveBeenCalledWith({
      checkoutUpdate: {
        productId: "plus-monthly-product",
        seats: 3,
      },
      id: "checkout-1",
    });
    expect(polarCheckoutCreate).not.toHaveBeenCalled();
  });

  it("refuses to choose arbitrarily between duplicate open checkouts", async () => {
    const openCheckout = {
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      metadata: { referenceId: "organization-1" },
      product: { id: "plus-monthly-product" },
      products: [{ id: "plus-monthly-product" }],
      seats: 3,
      url: "https://polar.test/checkout",
    };
    const { polarCheckoutCreate, polarCheckoutUpdate, service } =
      makeBillingHarness({
        openCheckouts: [
          { ...openCheckout, id: "checkout-1" },
          { ...openCheckout, id: "checkout-2" },
        ],
      });

    await expect(service.createCheckout(checkoutParams)).rejects.toBeInstanceOf(
      OrganizationSubscriptionConflictError
    );
    expect(polarCheckoutUpdate).not.toHaveBeenCalled();
    expect(polarCheckoutCreate).not.toHaveBeenCalled();
  });

  it("uses remote state to make repeated plan changes idempotent", async () => {
    const { polarSubscriptionUpdate, service } = makeBillingHarness({
      localSubscription: {
        currentPeriodEnd: null,
        id: "subscription-1",
        planSlug: PLAN.plus,
        productId: "plus-monthly-product",
      },
      remoteSubscriptions: [
        {
          currentPeriodEnd: null,
          id: "subscription-1",
          productId: "business-yearly-product",
        },
      ],
    });

    await service.changePlan({
      interval: BILLING_INTERVAL.year,
      organizationId: "organization-1",
      plan: PLAN.business,
      userId: "owner-1",
    });

    expect(polarSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("updates one active subscription with proration after capacity checks", async () => {
    const { polarSubscriptionUpdate, service } = makeBillingHarness({
      members: 11,
      remoteSubscriptions: [
        {
          currentPeriodEnd: null,
          id: "subscription-1",
          productId: "plus-monthly-product",
        },
      ],
    });

    await service.changePlan({
      interval: BILLING_INTERVAL.year,
      organizationId: "organization-1",
      plan: PLAN.business,
      userId: "owner-1",
    });

    expect(polarSubscriptionUpdate).toHaveBeenCalledWith({
      id: "subscription-1",
      subscriptionUpdate: {
        productId: "business-yearly-product",
        prorationBehavior: "prorate",
      },
    });
  });

  it("blocks a change to Plus above its reserved member capacity", async () => {
    const { polarSubscriptionUpdate, service } = makeBillingHarness({
      members: 10,
      pendingInvitations: 1,
      remoteSubscriptions: [
        {
          currentPeriodEnd: null,
          id: "subscription-1",
          productId: "business-monthly-product",
        },
      ],
    });

    await expect(
      service.changePlan({
        interval: BILLING_INTERVAL.month,
        organizationId: "organization-1",
        plan: PLAN.plus,
        userId: "owner-1",
      })
    ).rejects.toBeInstanceOf(OrganizationPlanMemberLimitError);
    expect(polarSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("fails closed for subscriptions outside the self-service catalog", async () => {
    const { polarSubscriptionUpdate, service } = makeBillingHarness({
      remoteSubscriptions: [
        {
          currentPeriodEnd: null,
          id: "subscription-enterprise",
          productId: "enterprise-custom-product",
        },
      ],
    });

    await expect(
      service.changePlan({
        interval: BILLING_INTERVAL.month,
        organizationId: "organization-1",
        plan: PLAN.business,
        userId: "owner-1",
      })
    ).rejects.toBeInstanceOf(OrganizationSubscriptionConflictError);
    expect(polarSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("refuses to mutate an ambiguous remote subscription set", async () => {
    const { polarSubscriptionUpdate, service } = makeBillingHarness({
      remoteSubscriptions: [
        {
          currentPeriodEnd: null,
          id: "subscription-1",
          productId: "plus-monthly-product",
        },
        {
          currentPeriodEnd: null,
          id: "subscription-2",
          productId: "plus-yearly-product",
        },
      ],
    });

    await expect(
      service.changePlan({
        interval: BILLING_INTERVAL.year,
        organizationId: "organization-1",
        plan: PLAN.business,
        userId: "owner-1",
      })
    ).rejects.toBeInstanceOf(OrganizationSubscriptionConflictError);
    expect(polarSubscriptionUpdate).not.toHaveBeenCalled();
  });
});

describe("EntitlementsService active subscription lookup", () => {
  it("uses local state without querying Polar", async () => {
    const list = mock(async () => ({ result: { items: [] } }));
    const service = makeService({
      polar: { subscriptions: { list } },
      rows: [
        [
          {
            currentPeriodEnd: null,
            id: "subscription-1",
            planSlug: PLAN.plus,
          },
        ],
      ],
    });

    expect(await service.hasActiveSubscription("organization-1")).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });

  it("falls back to Polar when local state is missing", async () => {
    const list = mock(async () => ({
      result: { items: [{ id: "subscription-1" }] },
    }));
    const service = makeService({
      polar: { subscriptions: { list } },
      rows: [[]],
    });

    expect(await service.hasActiveSubscription("organization-1")).toBe(true);
    expect(list).toHaveBeenCalledWith({
      active: true,
      limit: 1,
      metadata: { referenceId: "organization-1" },
    });
  });

  it("returns false when neither local nor Polar state is active", async () => {
    const list = mock(async () => ({ result: { items: [] } }));
    const service = makeService({
      polar: { subscriptions: { list } },
      rows: [[]],
    });

    expect(await service.hasActiveSubscription("organization-1")).toBe(false);
  });
});

describe("EntitlementsService subscription upsert", () => {
  it("maps product to plan and inserts a new owner purchase", async () => {
    const { insertValues, service, updateSet } = makeUpsertHarness([
      [],
      [{ id: "membership-1" }],
    ]);

    await service.upsertSubscription(subscriptionParams);

    expect(insertValues).toHaveBeenCalledWith({
      ...subscriptionParams,
      planSlug: PLAN.plus,
    });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("updates an existing subscription instead of inserting", async () => {
    const { insertValues, service, updateSet } = makeUpsertHarness([
      [existingSubscription],
      [{ id: "membership-1" }],
    ]);

    await service.upsertSubscription(subscriptionParams);

    expect(updateSet).toHaveBeenCalledWith({
      canceledAt: subscriptionParams.canceledAt,
      currentPeriodEnd: subscriptionParams.currentPeriodEnd,
      modifiedAt: subscriptionParams.modifiedAt,
      organizationId: subscriptionParams.organizationId,
      planSlug: PLAN.plus,
      productId: subscriptionParams.productId,
      purchasedByUserId: subscriptionParams.purchasedByUserId,
      status: subscriptionParams.status,
    });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("requires a new purchaser to be the organization owner", async () => {
    const { insertValues, service, updateSet } = makeUpsertHarness([[], []]);
    await service.upsertSubscription(subscriptionParams);
    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("applies revocation to an existing purchase after its owner is removed", async () => {
    const { service, updateSet } = makeUpsertHarness([
      [existingSubscription],
      [],
    ]);
    await service.upsertSubscription({
      ...subscriptionParams,
      status: "canceled",
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    );
  });

  it("ignores webhook events older than local state or missing a timestamp", async () => {
    const newerLocal = {
      ...existingSubscription,
      modifiedAt: new Date("2026-08-02T00:00:00.000Z"),
    };

    for (const modifiedAt of [null, new Date("2026-08-01T00:00:00.000Z")]) {
      const { insertValues, service, updateSet } = makeUpsertHarness([
        [newerLocal],
      ]);

      await service.upsertSubscription({
        ...subscriptionParams,
        modifiedAt,
      });

      expect(insertValues).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
    }
  });

  it("rejects moving a subscription to another organization", async () => {
    const { service } = makeUpsertHarness([
      [{ ...existingSubscription, organizationId: "organization-2" }],
    ]);

    await expect(
      service.upsertSubscription(subscriptionParams)
    ).rejects.toBeInstanceOf(SubscriptionOwnershipMismatchError);
  });

  it("rejects replacing the original purchaser", async () => {
    const { service } = makeUpsertHarness([
      [{ ...existingSubscription, purchasedByUserId: "owner-2" }],
    ]);

    await expect(
      service.upsertSubscription(subscriptionParams)
    ).rejects.toBeInstanceOf(SubscriptionPurchaserMismatchError);
  });

  it("deactivates unsupported active products already stored locally", async () => {
    const { insertValues, service, updateSet } = makeUpsertHarness([
      [existingSubscription],
      [{ id: "membership-1" }],
    ]);

    await service.upsertSubscription({
      ...subscriptionParams,
      productId: "unknown-product",
    });

    expect(updateSet).toHaveBeenCalledWith({
      modifiedAt: subscriptionParams.modifiedAt,
      productId: "unknown-product",
      status: "unsupported",
    });
    expect(insertValues).not.toHaveBeenCalled();
  });
});
