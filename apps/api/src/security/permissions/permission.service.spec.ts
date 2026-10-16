import { describe, expect, it, mock } from "bun:test";
import type { DatabaseService } from "@app/db";
import { ForbiddenException } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { PermissionService } from "./permission.service";

const principal = {
  organizationId: "organization-1",
  userId: "user-1",
};

function makeService(role: string | null) {
  const limit = mock(() => Promise.resolve(role ? [{ role }] : []));
  const database = {
    db: {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({ limit })),
        })),
      })),
    },
  } as unknown as DatabaseService;

  return { limit, service: new PermissionService(database) };
}

describe("PermissionService", () => {
  it("allows permissions granted to the organization role", async () => {
    const { service } = makeService("owner");

    await expect(
      service.requirePermission(permission.organization.delete, principal)
    ).resolves.toBeUndefined();
    await expect(
      service.hasPermission(permission.audit.read, principal)
    ).resolves.toBe(true);
  });

  it("rejects permissions absent from the organization role", async () => {
    const { service } = makeService("viewer");

    await expect(
      service.requirePermission(permission.workspace.delete, principal)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects users without an active organization membership", async () => {
    const { limit, service } = makeService(null);

    await expect(
      service.hasPermission(permission.workspace.read, principal)
    ).resolves.toBe(false);
    expect(limit).toHaveBeenCalledWith(1);
    await expect(
      service.hasPermission(permission.workspace.read, {
        organizationId: undefined,
        userId: "user-1",
      })
    ).resolves.toBe(false);
  });

  it("reuses a resolved role for sync batches", async () => {
    const { limit, service } = makeService("editor");
    const role = await service.getOrganizationRole(principal);

    await expect(
      service.hasPermission(permission.content.write, {
        ...principal,
        role,
      })
    ).resolves.toBe(true);
    expect(limit).toHaveBeenCalledTimes(2);
  });
});
