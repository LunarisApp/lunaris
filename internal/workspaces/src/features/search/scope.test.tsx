/** @vitest-environment happy-dom */
import { cleanup, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchOrganizationContext, useSearchScope } from "./scope";

const { currentWorkspace } = vi.hoisted(() => ({ currentWorkspace: vi.fn() }));
vi.mock("../workspace", () => ({
  useOptionalCurrentWorkspace: currentWorkspace,
}));
afterEach(cleanup);

describe("search scope", () => {
  it("uses current organization on homepage without a workspace", () => {
    currentWorkspace.mockReturnValue(null);
    const wrapper = ({
      children,
      organizationId,
    }: {
      children: ReactNode;
      organizationId: string;
    }) => (
      <SearchOrganizationContext value={organizationId}>
        {children}
      </SearchOrganizationContext>
    );
    const { result } = renderHook(useSearchScope, {
      wrapper: ({ children }) =>
        wrapper({ children, organizationId: "organization-home" }),
    });
    expect(result.current).toEqual({
      organizationId: "organization-home",
      workspaceId: "",
    });
  });

  it("preserves workspace scope for existing search consumers", () => {
    currentWorkspace.mockReturnValue({
      workspaceId: "workspace-1",
      workspace: { organization_id: "organization-1" },
    });
    const { result } = renderHook(useSearchScope);
    expect(result.current).toEqual({
      organizationId: "organization-1",
      workspaceId: "workspace-1",
    });
  });

  it("does not broaden an unresolved organization to an unscoped query", () => {
    currentWorkspace.mockReturnValue(null);
    const { result } = renderHook(useSearchScope);
    expect(result.current.organizationId).toBe("");
  });
});
