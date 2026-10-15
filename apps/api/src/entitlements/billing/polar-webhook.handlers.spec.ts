import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Test, type TestingModule } from "@nestjs/testing";
import { SeatService } from "../seats/seat.service";
import { BillingService } from "./billing.service";
import { PolarWebhookHandlers } from "./polar-webhook.handlers";

const modifiedAt = new Date("2026-03-01T00:00:00Z");

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "subscription-1",
    productId: "plus-product",
    status: "active",
    seats: 2,
    currentPeriodEnd: new Date("2030-01-01"),
    canceledAt: null,
    customerId: "customer-1",
    customer: { externalId: "owner-1" },
    metadata: { referenceId: "organization-1" },
    createdAt: new Date("2026-02-01T00:00:00Z"),
    modifiedAt,
    ...overrides,
  };
}

describe("PolarWebhookHandlers", () => {
  let handlers: PolarWebhookHandlers;
  let syncMemberSeats: ReturnType<typeof mock>;
  let upsertSubscription: ReturnType<typeof mock>;

  beforeEach(async () => {
    syncMemberSeats = mock(async () => undefined);
    upsertSubscription = mock(async () => undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolarWebhookHandlers,
        {
          provide: BillingService,
          useValue: { upsertSubscription },
        },
        {
          provide: SeatService,
          useValue: { syncMemberSeats },
        },
      ],
    }).compile();
    handlers = module.get(PolarWebhookHandlers);
  });

  it("links subscription to organization reference and purchaser", async () => {
    const sub = makeSubscription();
    await handlers.toCallbacks().onSubscriptionCreated!({
      data: sub as never,
      type: "subscription.created",
      timestamp: new Date(),
    });

    expect(upsertSubscription).toHaveBeenCalledWith({
      canceledAt: null,
      currentPeriodEnd: sub.currentPeriodEnd,
      modifiedAt,
      organizationId: "organization-1",
      polarSubscriptionId: "subscription-1",
      productId: "plus-product",
      purchasedByUserId: "owner-1",
      status: "active",
    });
    expect(syncMemberSeats).toHaveBeenCalledWith("organization-1");
  });

  it("upserts cancellation and revocation so organization returns Free", async () => {
    const callbacks = handlers.toCallbacks();
    await callbacks.onSubscriptionCanceled!({
      data: makeSubscription({ status: "canceled" }) as never,
      type: "subscription.canceled",
      timestamp: new Date(),
    });
    await callbacks.onSubscriptionRevoked!({
      data: makeSubscription({ status: "revoked" }) as never,
      type: "subscription.revoked",
      timestamp: new Date(),
    });

    expect(upsertSubscription).toHaveBeenCalledTimes(2);
    expect(syncMemberSeats).not.toHaveBeenCalled();
  });

  it("ignores subscriptions missing trusted organization metadata", async () => {
    await handlers.toCallbacks().onSubscriptionCreated!({
      data: makeSubscription({ metadata: {} }) as never,
      type: "subscription.created",
      timestamp: new Date(),
    });
    expect(upsertSubscription).not.toHaveBeenCalled();
  });
});
