import { describe, expect, it, mock } from "bun:test";
import { BILLING_INTERVAL } from "@repo/auth/billing";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { NoActiveOrganizationError } from "../../sync/sync.errors";
import { BillingController } from "./billing.controller";
import {
  type BillingPlanRequestDto,
  billingPlanRequestSchema,
} from "./billing.schema";
import type { BillingService } from "./billing.service";

const ownerSession = {
  session: { activeOrganizationId: "organization-1" },
  user: {
    email: "owner@lunaris.test",
    id: "owner-1",
    name: "Organization Owner",
  },
} as unknown as UserSession;

const planRequest = {
  interval: BILLING_INTERVAL.year,
  plan: "business",
} as BillingPlanRequestDto;

describe("BillingController", () => {
  it("preserves legacy OpenAPI identifiers and grouping", () => {
    expect(
      Reflect.getMetadata("swagger/apiUseTags", BillingController)
    ).toEqual(["Entitlements"]);

    for (const [method, operationId] of [
      ["createCheckout", "EntitlementsController_createCheckout_v1"],
      ["createPortal", "EntitlementsController_createPortal_v1"],
      ["changePlan", "EntitlementsController_changePlan_v1"],
      ["getBillingState", "EntitlementsController_getBillingState_v1"],
    ] as const) {
      expect(
        Reflect.getMetadata(
          "swagger/apiOperation",
          BillingController.prototype[method]
        )
      ).toMatchObject({ operationId });
    }
  });

  it("forwards checkout requests with active organization and owner identity", async () => {
    const createCheckout = mock(async () => ({
      url: "https://polar.test/checkout/checkout-1",
    }));
    const controller = new BillingController({
      createCheckout,
    } as unknown as BillingService);

    await expect(
      controller.createCheckout(ownerSession, planRequest)
    ).resolves.toEqual({ url: "https://polar.test/checkout/checkout-1" });
    expect(createCheckout).toHaveBeenCalledWith({
      ...planRequest,
      organizationId: "organization-1",
      user: {
        email: "owner@lunaris.test",
        id: "owner-1",
        name: "Organization Owner",
      },
    });
  });

  it("forwards plan changes with active organization and user ID", async () => {
    const changePlan = mock(async () => undefined);
    const controller = new BillingController({
      changePlan,
    } as unknown as BillingService);

    await expect(
      controller.changePlan(ownerSession, planRequest)
    ).resolves.toEqual({ success: true });
    expect(changePlan).toHaveBeenCalledWith({
      ...planRequest,
      organizationId: "organization-1",
      userId: "owner-1",
    });
  });

  it("forwards portal requests with active organization and user ID", async () => {
    const createPortal = mock(async () => ({
      url: "https://polar.test/portal/session-1",
    }));
    const controller = new BillingController({
      createPortal,
    } as unknown as BillingService);

    await expect(controller.createPortal(ownerSession)).resolves.toEqual({
      url: "https://polar.test/portal/session-1",
    });
    expect(createPortal).toHaveBeenCalledWith({
      organizationId: "organization-1",
      userId: "owner-1",
    });
  });

  it("forwards billing-state requests with active organization and user ID", async () => {
    const getBillingState = mock(async () => ({ activeSubscriptions: [] }));
    const controller = new BillingController({
      getBillingState,
    } as unknown as BillingService);

    await expect(controller.getBillingState(ownerSession)).resolves.toEqual({
      activeSubscriptions: [],
    });
    expect(getBillingState).toHaveBeenCalledWith({
      organizationId: "organization-1",
      userId: "owner-1",
    });
  });

  it("accepts only purchasable plans and known billing intervals", () => {
    expect(billingPlanRequestSchema.safeParse(planRequest).success).toBe(true);
    expect(
      billingPlanRequestSchema.safeParse({
        interval: "month",
        plan: "free",
      }).success
    ).toBe(false);
    expect(
      billingPlanRequestSchema.safeParse({
        ...planRequest,
        unexpected: true,
      }).success
    ).toBe(false);
  });

  it("does not forward requests without an active organization", async () => {
    const createCheckout = mock(async () => ({ url: "unreachable" }));
    const createPortal = mock(async () => ({ url: "unreachable" }));
    const changePlan = mock(async () => undefined);
    const getBillingState = mock(async () => ({ activeSubscriptions: [] }));
    const controller = new BillingController({
      changePlan,
      createCheckout,
      createPortal,
      getBillingState,
    } as unknown as BillingService);
    const noOrganization = {
      session: {},
      user: ownerSession.user,
    } as unknown as UserSession;

    expect(() =>
      controller.createCheckout(noOrganization, planRequest)
    ).toThrow(NoActiveOrganizationError);
    expect(() => controller.createPortal(noOrganization)).toThrow(
      NoActiveOrganizationError
    );
    expect(() => controller.getBillingState(noOrganization)).toThrow(
      NoActiveOrganizationError
    );
    await expect(
      controller.changePlan(noOrganization, planRequest)
    ).rejects.toBeInstanceOf(NoActiveOrganizationError);
    expect(createCheckout).not.toHaveBeenCalled();
    expect(createPortal).not.toHaveBeenCalled();
    expect(getBillingState).not.toHaveBeenCalled();
    expect(changePlan).not.toHaveBeenCalled();
  });
});
