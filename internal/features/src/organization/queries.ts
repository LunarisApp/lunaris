"use client";

import type { AuthClient } from "@repo/auth/client";
import type { OrganizationRole } from "@repo/data/features/organizations";
import type { ApiClient } from "@repo/data/http";
import type { QueryClient } from "@tanstack/react-query";
import { log, parseError } from "evlog";

export interface Invitation {
  createdAt: Date | string;
  email: string;
  expiresAt: Date | string;
  id: string;
  role: OrganizationRole;
  status: string;
  teamId?: string | null;
}

export interface Subscription {
  amount: number;
  cancelAtPeriodEnd: boolean;
  currency: string;
  currentPeriodEnd: string;
  id: string;
  productId: string;
  recurringInterval: string;
  seats?: number | null;
  status: string;
}

export interface BillingState {
  activeSubscriptions: Subscription[];
}

export const organizationQueryKeys = {
  billingState: (regionId: string, userId: string, orgId: string) =>
    ["organization", orgId, "billing", "state", regionId, userId] as const,
  invitations: (orgId: string) =>
    ["organization", orgId, "invitations"] as const,
};

export function billingStateQueryOptions(
  api: ApiClient,
  regionId: string,
  userId: string,
  orgId: string
) {
  return {
    networkMode: "online" as const,
    queryKey: organizationQueryKeys.billingState(regionId, userId, orgId),
    queryFn: async (): Promise<BillingState> => {
      try {
        return await api.get<BillingState>("/v1/entitlements/billing");
      } catch (error) {
        log.error({
          tag: "Billing",
          msg: "failed to load organization billing state",
          error: parseError(error),
        });
        throw error;
      }
    },
  };
}

export function invitationsQueryOptions(auth: AuthClient, orgId: string) {
  return {
    networkMode: "online" as const,
    queryKey: organizationQueryKeys.invitations(orgId),
    queryFn: async (): Promise<Invitation[]> => {
      try {
        const result = await auth.organization.listInvitations({
          query: { organizationId: orgId },
        });

        if (result.error) {
          throw new Error(
            (result.error as { message?: string }).message ??
              "Failed to load invitations"
          );
        }

        return (result.data as Invitation[]) ?? [];
      } catch (error) {
        log.error({
          tag: "Organization",
          msg: "failed to load invitations",
          error: parseError(error),
        });
        throw error;
      }
    },
  };
}

export async function preloadOrganizationSettingsData({
  api,
  auth,
  billing,
  invitations = true,
  orgId,
  queryClient,
}: {
  api: ApiClient;
  auth: AuthClient;
  billing?: { regionId: string; userId: string };
  invitations?: boolean;
  orgId: string;
  queryClient: QueryClient;
}) {
  const tasks: Promise<unknown>[] = [];

  if (invitations) {
    tasks.push(queryClient.prefetchQuery(invitationsQueryOptions(auth, orgId)));
  }

  if (billing) {
    tasks.push(
      queryClient.prefetchQuery(
        billingStateQueryOptions(api, billing.regionId, billing.userId, orgId)
      )
    );
  }

  await Promise.allSettled(tasks);
}
