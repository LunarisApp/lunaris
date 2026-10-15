import { describe, expect, it, mock } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { permission } from "@repo/auth/permissions";
import {
  DEFER_PERMISSION_METADATA,
  PERMISSION_METADATA,
} from "./permission.decorator";
import { PermissionGuard } from "./permission.guard";
import type { PermissionService } from "./permission.service";

function context(): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        session: {
          session: { activeOrganizationId: "organization-1" },
          user: { id: "user-1" },
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("PermissionGuard", () => {
  it("allows routes without permission metadata", () => {
    const reflector = {
      getAllAndOverride: mock(() => undefined),
    };
    const permissions = {
      hasPermission: mock(() => Promise.resolve(false)),
    };
    const guard = new PermissionGuard(
      reflector as unknown as Reflector,
      permissions as unknown as PermissionService,
    );

    expect(guard.canActivate(context())).toBe(true);
    expect(permissions.hasPermission).not.toHaveBeenCalled();
  });

  it("delegates tagged routes to the permission service", async () => {
    const reflector = {
      getAllAndOverride: mock((key: string) =>
        key === PERMISSION_METADATA ? permission.workspace.delete : undefined,
      ),
    };
    const permissions = {
      hasPermission: mock(() => Promise.resolve(true)),
    };
    const guard = new PermissionGuard(
      reflector as unknown as Reflector,
      permissions as unknown as PermissionService,
    );

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PERMISSION_METADATA,
      expect.any(Array),
    );
    expect(permissions.hasPermission).toHaveBeenCalledWith(
      permission.workspace.delete,
      {
        organizationId: "organization-1",
        userId: "user-1",
      },
    );
  });

  it("skips routes whose local guard establishes the principal", () => {
    const reflector = {
      getAllAndOverride: mock((key: string) =>
        key === DEFER_PERMISSION_METADATA ? true : undefined,
      ),
    };
    const permissions = {
      hasPermission: mock(() => Promise.resolve(false)),
    };
    const guard = new PermissionGuard(
      reflector as unknown as Reflector,
      permissions as unknown as PermissionService,
    );

    expect(guard.canActivate(context())).toBe(true);
    expect(permissions.hasPermission).not.toHaveBeenCalled();
  });
});
