/** @vitest-environment happy-dom */

import type { ReactNode } from "react";
import { permission } from "@repo/auth/permissions";
import { usePermission } from "@repo/features/permissions";
import { markPendingOrganization } from "@repo/features/organization";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationScopeGate } from "./organization-scope-gate";

const {
  authClient,
  deletionGate,
  capture,
  refetchActiveOrganization,
  refetchSession,
  useOrganizationMemberRoleQuery,
  useOrganizationsQuery,
} = vi.hoisted(() => ({
  authClient: {
    organization: { setActive: vi.fn() },
    useActiveOrganization: vi.fn(),
    useSession: vi.fn(),
  },
  deletionGate: vi.fn(({ children }: { children: ReactNode }) => children),
  capture: vi.fn(),
  refetchActiveOrganization: vi.fn(),
  refetchSession: vi.fn(),
  useOrganizationMemberRoleQuery: vi.fn(),
  useOrganizationsQuery: vi.fn(),
}));

vi.mock(
  "@repo/features/organization/components/organization-deletion-gate",
  () => ({
    OrganizationDeletionGate: deletionGate,
  })
);

vi.mock("posthog-js", () => ({
  default: { capture },
}));

vi.mock("@repo/data/features/organizations", () => ({
  useOrganizationMemberRoleQuery,
  useOrganizationsQuery,
}));

vi.mock("@repo/data/http", () => ({
  getUserFacingDescription: () => "Connect and try again.",
  getUserFacingError: () => ({ titleKey: "errors.network.offline.title" }),
}));

vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div>loading</div>,
}));

vi.mock("@repo/features/region", () => ({
  useRegionClients: () => ({ authClient }),
}));

vi.mock("./organization-not-found", () => ({
  OrganizationNotFound: () => <div>not found</div>,
}));

function OrganizationContent() {
  const canWrite = usePermission(permission.content.write);
  return (
    <>
      <div>organization content</div>
      {canWrite ? <button type="button">edit content</button> : null}
    </>
  );
}

function NavigationControls() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/blue-orchid")} type="button">
      open blue orchid
    </button>
  );
}

function renderGate(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationControls />
      <Routes>
        <Route element={<OrganizationScopeGate />} path=":organizationSlug">
          <Route element={<OrganizationContent />} index />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("OrganizationScopeGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    authClient.organization.setActive.mockResolvedValue({
      data: null,
      error: null,
    });
    authClient.useActiveOrganization.mockReturnValue({
      data: { id: "organization-1", slug: "northstar" },
      refetch: refetchActiveOrganization,
    });
    authClient.useSession.mockReturnValue({
      data: { user: { id: "user-1", isAnonymous: false } },
      refetch: refetchSession,
    });
    useOrganizationMemberRoleQuery.mockReturnValue({ data: "owner" });
    useOrganizationsQuery.mockReturnValue({
      data: [
        { id: "organization-1", slug: "northstar" },
        { id: "organization-2", slug: "paper-lantern" },
        { id: "organization-3", slug: "blue-orchid" },
      ],
      error: null,
      isFetching: false,
      isLoading: false,
    });
  });

  it("renders matching active organization", () => {
    renderGate("/northstar");

    expect(screen.getByText("organization content")).toBeTruthy();
    expect(screen.getByText("edit content")).toBeTruthy();
  });

  it("passes both synced deletion signals to the recovery gate", () => {
    useOrganizationsQuery.mockReturnValue({
      data: [
        {
          id: "organization-1",
          slug: "northstar",
          deletion_requested_at: "2026-09-09",
          deletion_purge_after: "2026-10-09",
        },
      ],
      isLoading: false,
      isFetching: false,
    });
    renderGate("/northstar");
    expect(deletionGate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedAt: "2026-09-09",
        purgeAfter: "2026-10-09",
        organizationId: "organization-1",
      }),
      undefined
    );
  });

  it("applies the synced role to organization UX", () => {
    useOrganizationMemberRoleQuery.mockReturnValue({ data: "viewer" });

    renderGate("/northstar");

    expect(screen.getByText("organization content")).toBeTruthy();
    expect(screen.queryByText("edit content")).toBeNull();
  });

  it("switches to an organization resolved from PowerSync", async () => {
    renderGate("/paper-lantern");

    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledWith({
        organizationId: "organization-2",
      });
      expect(refetchSession).toHaveBeenCalledOnce();
      expect(refetchActiveOrganization).toHaveBeenCalledOnce();
      expect(capture).toHaveBeenCalledWith("organization_switched");
    });
  });

  it("serializes activation when the route changes mid-switch", async () => {
    let resolveFirstSwitch: (value: { data: null; error: null }) => void = () =>
      undefined;
    authClient.organization.setActive
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstSwitch = resolve;
        })
      )
      .mockResolvedValue({ data: null, error: null });
    renderGate("/paper-lantern");

    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "open blue orchid" }));
    expect(authClient.organization.setActive).toHaveBeenCalledTimes(1);

    resolveFirstSwitch({ data: null, error: null });

    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledTimes(2);
      expect(authClient.organization.setActive).toHaveBeenLastCalledWith({
        organizationId: "organization-3",
      });
      expect(capture).toHaveBeenCalledOnce();
    });
  });

  it("waits while an absent organization may still be syncing", () => {
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: true,
      isLoading: false,
    });

    renderGate("/paper-lantern");

    expect(screen.getByText("loading")).toBeTruthy();
    expect(screen.queryByText("not found")).toBeNull();
    expect(authClient.organization.setActive).not.toHaveBeenCalled();
  });

  it("shows not found after authoritative directory sync", async () => {
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: false,
    });

    renderGate("/paper-lantern");

    expect(await screen.findByText("not found")).toBeTruthy();
  });

  it("rejects a cached active organization removed by directory sync", async () => {
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: false,
    });

    renderGate("/northstar");

    expect(await screen.findByText("not found")).toBeTruthy();
  });

  it("keeps the active organization fallback for anonymous sessions", () => {
    authClient.useSession.mockReturnValue({
      data: { user: { id: "user-1", isAnonymous: true } },
      refetch: refetchSession,
    });
    useOrganizationMemberRoleQuery.mockReturnValue({ data: undefined });
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: false,
    });

    renderGate("/northstar");

    expect(screen.getByText("organization content")).toBeTruthy();
    expect(screen.getByText("edit content")).toBeTruthy();
  });

  it("rejects foreign slugs immediately for local-only anonymous sessions", () => {
    authClient.useSession.mockReturnValue({
      data: { user: { id: "user-1", isAnonymous: true } },
      refetch: refetchSession,
    });
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: true,
    });

    renderGate("/does-not-exist");

    expect(screen.getByText("not found")).toBeTruthy();
  });

  it("trusts a newly created active organization until its directory row syncs", () => {
    useOrganizationMemberRoleQuery.mockReturnValue({ data: undefined });
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: false,
    });
    markPendingOrganization({ id: "organization-1", slug: "northstar" });

    renderGate("/northstar");

    expect(screen.getByText("organization content")).toBeTruthy();
    expect(screen.getByText("edit content")).toBeTruthy();
  });

  it("waits for an authenticated member role before rendering", () => {
    useOrganizationMemberRoleQuery.mockReturnValue({ data: undefined });

    renderGate("/northstar");

    expect(screen.getByText("loading")).toBeTruthy();
    expect(screen.queryByText("organization content")).toBeNull();
    expect(authClient.organization.setActive).not.toHaveBeenCalled();
  });

  it("activates a pending organization missing from the directory", async () => {
    authClient.useActiveOrganization.mockReturnValue({
      data: { id: "organization-2", slug: "paper-lantern" },
      refetch: refetchActiveOrganization,
    });
    markPendingOrganization({ id: "organization-1", slug: "northstar" });

    renderGate("/northstar");

    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledWith({
        organizationId: "organization-1",
      });
      expect(refetchSession).toHaveBeenCalledOnce();
      expect(refetchActiveOrganization).toHaveBeenCalledOnce();
    });
  });

  it("trusts a pending slug rename for the same active organization", () => {
    useOrganizationsQuery.mockReturnValue({
      data: [{ id: "organization-1", slug: "northstar" }],
      error: null,
      isFetching: false,
      isLoading: false,
    });
    markPendingOrganization({ id: "organization-1", slug: "renamed" });

    renderGate("/renamed");

    expect(screen.getByText("organization content")).toBeTruthy();
    expect(screen.queryByText("not found")).toBeNull();
  });

  it("renders a scoped retry when organization activation fails", async () => {
    authClient.organization.setActive
      .mockResolvedValueOnce({
        data: null,
        error: new TypeError("offline"),
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });

    renderGate("/paper-lantern");

    const retry = await screen.findByRole("button");
    expect(screen.queryByText("not found")).toBeNull();
    expect(refetchSession).not.toHaveBeenCalled();

    fireEvent.click(retry);

    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledTimes(2);
      expect(refetchSession).toHaveBeenCalledOnce();
      expect(refetchActiveOrganization).toHaveBeenCalledOnce();
    });
  });
});
