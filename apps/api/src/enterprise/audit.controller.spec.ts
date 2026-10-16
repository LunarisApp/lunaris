import { describe, expect, it, mock } from "bun:test";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { NoActiveOrganizationError } from "../sync/sync.errors";
import { AuditController } from "./audit.controller";
import type { AuditEventsQueryDto } from "@repo/ee-audit/server/schema";
import type { AuditService } from "./audit.service";

const query = { limit: 50 } as AuditEventsQueryDto;

function session(
  params: { anonymous?: boolean; organizationId?: string | null } = {}
): UserSession {
  return {
    session: {
      activeOrganizationId:
        params.organizationId === undefined
          ? "organization_1"
          : params.organizationId,
    },
    user: {
      id: "user_1",
      isAnonymous: params.anonymous ?? false,
    },
  } as unknown as UserSession;
}

describe("AuditController", () => {
  it("lists active-organization events after owner review authorization", async () => {
    const response = { items: [], nextCursor: null };
    const assertReviewer = mock(async () => undefined);
    const list = mock(async () => response);
    const controller = new AuditController({
      assertReviewer,
      list,
    } as unknown as AuditService);

    await expect(controller.list(session(), query)).resolves.toEqual(response);
    expect(assertReviewer).toHaveBeenCalledWith("user_1", "organization_1");
    expect(list).toHaveBeenCalledWith("organization_1", query);
  });

  it("rejects anonymous organization owners", async () => {
    const assertReviewer = mock(async () => undefined);
    const list = mock(async () => ({ items: [], nextCursor: null }));
    const controller = new AuditController({
      assertReviewer,
      list,
    } as unknown as AuditService);

    await expect(
      controller.list(session({ anonymous: true }), query)
    ).rejects.toMatchObject({ status: 403 });
    expect(assertReviewer).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects sessions without an active organization", async () => {
    const assertReviewer = mock(async () => undefined);
    const list = mock(async () => ({ items: [], nextCursor: null }));
    const controller = new AuditController({
      assertReviewer,
      list,
    } as unknown as AuditService);

    await expect(
      controller.list(session({ organizationId: null }), query)
    ).rejects.toBeInstanceOf(NoActiveOrganizationError);
    expect(assertReviewer).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
});
