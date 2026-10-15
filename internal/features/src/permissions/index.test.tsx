import { permission } from "@repo/auth/permissions";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  PermissionProvider,
  requirePermission,
  useAllPermissions,
  useAnyPermission,
  usePermission,
} from ".";

describe("permissions", () => {
  it("allows permissions by default", () => {
    const { result } = renderHook(() => usePermission(permission.workspace.read));

    expect(result.current).toBe(true);
  });

  it("uses the provided permission check", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PermissionProvider
        check={({ action, resource }) =>
          !(resource === "workspace" && action === "delete")
        }
      >
        {children}
      </PermissionProvider>
    );

    const { result } = renderHook(
      () => ({
        all: useAllPermissions([
          permission.workspace.read,
          permission.workspace.delete,
        ]),
        any: useAnyPermission([
          permission.workspace.read,
          permission.workspace.delete,
        ]),
        delete: usePermission(permission.workspace.delete),
      }),
      { wrapper },
    );

    expect(result.current).toEqual({
      all: false,
      any: true,
      delete: false,
    });
  });

  it("throws consistently at denied mutation boundaries", () => {
    expect(() =>
      requirePermission(() => false, permission.content.write),
    ).toThrow("Permission denied: content.write");
    expect(() =>
      requirePermission(() => true, permission.content.write),
    ).not.toThrow();
  });
});
