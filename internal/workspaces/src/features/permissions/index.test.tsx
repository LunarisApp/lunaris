import { PermissionProvider } from "@repo/features/permissions";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useCanCreateWorkspace, useCanDeleteWorkspace } from ".";

describe("workspace permissions", () => {
  it("requires both workspace and content capabilities", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PermissionProvider check={({ resource }) => resource !== "content"}>
        {children}
      </PermissionProvider>
    );

    const { result } = renderHook(
      () => ({
        create: useCanCreateWorkspace(),
        delete: useCanDeleteWorkspace(),
      }),
      { wrapper },
    );

    expect(result.current).toEqual({
      create: false,
      delete: false,
    });
  });
});
