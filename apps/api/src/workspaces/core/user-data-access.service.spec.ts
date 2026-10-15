import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { LocalOnlySyncAccessError, NoActiveOrganizationError } from "../../sync/sync.errors";
import { UserDataAccessService } from "./user-data-access.service";

function session(params?: {
  anonymous?: boolean;
  organizationId?: string | null;
}): UserSession {
  return {
    session: {
      activeOrganizationId:
        params?.organizationId === undefined ? "org_1" : params.organizationId,
    },
    user: { id: "user_1", isAnonymous: params?.anonymous },
  } as unknown as UserSession;
}

describe("UserDataAccessService", () => {
  const assertOrganizationMember = mock(() => Promise.resolve());
  const service = new UserDataAccessService({ assertOrganizationMember } as never);

  beforeEach(() => {
    assertOrganizationMember.mockReset().mockImplementation(() =>
      Promise.resolve()
    );
  });

  it("requires an active organization", async () => {
    await expect(
      service.requireOrganization(session({ organizationId: null })),
    ).rejects.toBeInstanceOf(NoActiveOrganizationError);
    expect(assertOrganizationMember).not.toHaveBeenCalled();
  });

  it("rejects anonymous sessions", async () => {
    await expect(
      service.requireOrganization(session({ anonymous: true })),
    ).rejects.toBeInstanceOf(LocalOnlySyncAccessError);
    expect(assertOrganizationMember).not.toHaveBeenCalled();
  });

  it("rejects stale organization memberships", async () => {
    assertOrganizationMember.mockRejectedValueOnce(new Error("not a member"));
    await expect(service.requireOrganization(session())).rejects.toThrow(
      "not a member",
    );
  });

  it("returns scoped organization identity for valid members", async () => {
    await expect(service.requireOrganization(session())).resolves.toEqual({
      organizationId: "org_1",
      userId: "user_1",
    });
    expect(assertOrganizationMember).toHaveBeenCalledWith("user_1", "org_1");
  });
});
