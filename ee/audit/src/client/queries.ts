import type { ApiClient } from "@repo/data/http";
import { log, parseError } from "evlog";

export type AuditActorType = "user" | "system" | "api" | "agent";
export type AuditOutcome = "success" | "failure" | "denied";

export interface AuditEventListItem {
  action: string;
  actorId: string;
  actorType: AuditActorType;
  changedFields: string[];
  id: string;
  occurredAt: string;
  outcome: AuditOutcome;
  reason: string | null;
  requestId: string | null;
  targetId: string | null;
  targetType: string | null;
  traceId: string | null;
}

export interface AuditEventsListResponse {
  items: AuditEventListItem[];
  nextCursor: string | null;
}

export interface AuditEventFilters {
  action?: string;
  actorId?: string;
  from?: string;
  outcome?: AuditOutcome;
  to?: string;
}

export const organizationQueryKeys = {
  auditEvents: (orgId: string, filters: AuditEventFilters) =>
    ["organization", orgId, "audit-events", filters] as const,
};

export function auditEventsInfiniteQueryOptions(
  api: ApiClient,
  orgId: string,
  filters: AuditEventFilters,
) {
  return {
    getNextPageParam: (lastPage: AuditEventsListResponse) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    networkMode: "online" as const,
    queryFn: async ({
      pageParam,
    }: {
      pageParam: string | undefined;
    }): Promise<AuditEventsListResponse> => {
      try {
        return await api.get<AuditEventsListResponse>("/v1/audit-events", {
          params: {
            ...filters,
            cursor: pageParam,
            limit: 50,
          },
        });
      } catch (error) {
        log.error({
          tag: "Audit",
          msg: "failed to load organization audit events",
          error: parseError(error),
        });
        throw error;
      }
    },
    queryKey: organizationQueryKeys.auditEvents(orgId, filters),
  } as const;
}
