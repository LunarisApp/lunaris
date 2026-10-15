import { describe, expect, it, mock } from "bun:test";
import { entitlementSnapshotSchema } from "@repo/auth/entitlements";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { NoActiveOrganizationError } from "../../sync/sync.errors";
import { EntitlementsController } from "./entitlements.controller";
import { OrganizationMembershipRequiredError } from "./entitlements.errors";
import type { EntitlementsService } from "./entitlements.service";

const response = {
  billingManagement: "unavailable" as const,
  features: { "agent-work": false },
  resourceCount: 12,
  limits: { max_resources: 25, max_storage_bytes: 250_000_000, max_file_bytes: 25_000_000, max_members: 3 },
  offlineAccessUntil: null,
  plan: "free" as const,
  verifiedAt: "2026-07-19T10:00:00.000Z",
  organizationId: "organization-1",
};

describe("EntitlementsController", () => {
  it("returns active organization entitlements", async () => {
    const assertOrganizationMember = mock(async () => undefined);
    const resolveSnapshotForOrganization = mock(async () => response);
    const controller = new EntitlementsController({
      assertOrganizationMember,
      resolveSnapshotForOrganization,
    } as unknown as EntitlementsService);
    const result = await controller.getCurrent({
      user: {
        email: "user@lunaris.test",
        id: "user-1",
        isAnonymous: false,
      },
      session: { activeOrganizationId: "organization-1" },
    } as unknown as UserSession);

    expect(assertOrganizationMember).toHaveBeenCalledWith(
      "user-1",
      "organization-1",
    );
    expect(resolveSnapshotForOrganization).toHaveBeenCalledWith({
      organizationId: "organization-1",
      user: {
        email: "user@lunaris.test",
        id: "user-1",
        isAnonymous: false,
      },
    });
    expect(entitlementSnapshotSchema.parse(result)).toEqual(response);
  });

  it("requires an active organization", async () => {
    const controller = new EntitlementsController({} as EntitlementsService);
    await expect(
      controller.getCurrent({ session: {} } as unknown as UserSession),
    ).rejects.toThrow(NoActiveOrganizationError);
  });

  it("rejects stale active organizations after membership removal", async () => {
    const resolveSnapshotForOrganization = mock(async () => response);
    const controller = new EntitlementsController({
      assertOrganizationMember: mock(async () => {
        throw new OrganizationMembershipRequiredError();
      }),
      resolveSnapshotForOrganization,
    } as unknown as EntitlementsService);

    await expect(
      controller.getCurrent({
        user: { id: "removed-user" },
        session: { activeOrganizationId: "organization-1" },
      } as unknown as UserSession),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
    expect(resolveSnapshotForOrganization).not.toHaveBeenCalled();
  });
});
