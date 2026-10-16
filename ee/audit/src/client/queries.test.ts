import type { ApiClient } from "@repo/data/http";
import { describe, expect, it, vi } from "vitest";
import {
  auditEventsInfiniteQueryOptions,
  organizationQueryKeys,
} from "./queries";
const ORG_ID = "organization-1";
describe("audit queries", () => {
  it("loads cursor-paginated audit events from network only", async () => {
    const response = {
      items: [],
      nextCursor: "next-cursor",
    };
    const get = vi.fn().mockResolvedValue(response);
    const api = { get } as unknown as ApiClient;
    const filters = {
      action: "workspace.updated",
      actorId: "user-1",
      from: "2026-08-01T00:00:00.000Z",
      outcome: "success" as const,
      to: "2026-08-11T23:59:59.000Z",
    };
    const options = auditEventsInfiniteQueryOptions(api, ORG_ID, filters);

    await expect(
      options.queryFn?.({ pageParam: "cursor-1" } as never)
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/v1/audit-events", {
      params: {
        ...filters,
        cursor: "cursor-1",
        limit: 50,
      },
    });
    expect(options.networkMode).toBe("online");
    expect(options.queryKey).toEqual(
      organizationQueryKeys.auditEvents(ORG_ID, filters)
    );
    expect(options.getNextPageParam(response)).toBe("next-cursor");
  });

  it("isolates audit query caches by organization and filters", () => {
    expect(
      organizationQueryKeys.auditEvents("organization-1", { outcome: "denied" })
    ).not.toEqual(
      organizationQueryKeys.auditEvents("organization-2", { outcome: "denied" })
    );
    expect(
      organizationQueryKeys.auditEvents("organization-1", { outcome: "denied" })
    ).not.toEqual(
      organizationQueryKeys.auditEvents("organization-1", {
        outcome: "success",
      })
    );
  });
});
