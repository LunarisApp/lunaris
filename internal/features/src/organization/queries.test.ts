import type { AuthClient } from "@repo/auth/client";
import type { ApiClient } from "@repo/data/http";
import { describe, expect, it, vi } from "vitest";
import {
  billingStateQueryOptions,
  invitationsQueryOptions,
  preloadOrganizationSettingsData,
  organizationQueryKeys,
} from "./queries";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("evlog", () => ({
  log: { error: logError },
  parseError: (error: unknown) => error,
}));

const ORG_ID = "organization-1";

describe("billingStateQueryOptions", () => {
  it("loads owner-authorized organization billing state", async () => {
    const get = vi.fn().mockResolvedValue({
      activeSubscriptions: [
        {
          amount: 1200,
          cancelAtPeriodEnd: false,
          currency: "USD",
          currentPeriodEnd: "2026-09-01T00:00:00.000Z",
          id: "subscription-1",
          productId: "plus-yearly",
          recurringInterval: "year",
          seats: 3,
          status: "active",
        },
      ],
    });
    const api = { get } as unknown as ApiClient;
    const options = billingStateQueryOptions(api, "eu", "user-1", ORG_ID);

    await expect(options.queryFn()).resolves.toEqual({
      activeSubscriptions: [expect.objectContaining({ id: "subscription-1" })],
    });
    expect(get).toHaveBeenCalledWith("/v1/entitlements/billing");
    expect(options.queryKey).toEqual(
      organizationQueryKeys.billingState("eu", "user-1", ORG_ID)
    );
  });

  it("keeps invitation reads network-only", () => {
    const auth = {} as AuthClient;

    expect(invitationsQueryOptions(auth, ORG_ID).networkMode).toBe("online");
  });

  it("skips preload when no organization data is readable", async () => {
    const prefetchQuery = vi.fn();

    await preloadOrganizationSettingsData({
      api: {} as ApiClient,
      auth: {} as AuthClient,
      invitations: false,
      orgId: ORG_ID,
      queryClient: { prefetchQuery } as never,
    });

    expect(prefetchQuery).not.toHaveBeenCalled();
  });
});
