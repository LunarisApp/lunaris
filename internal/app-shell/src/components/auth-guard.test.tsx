/** @vitest-environment happy-dom */

import { fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthGuard from "./auth-guard";

const {
  listOrganizations,
  logout,
  posthogGroup,
  posthogIdentify,
  posthogReset,
  refetchActiveOrganization,
  refetchSession,
  setActiveOrganization,
  useActiveOrganization,
  useSession,
} = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  logout: vi.fn(),
  posthogGroup: vi.fn(),
  posthogIdentify: vi.fn(),
  posthogReset: vi.fn(),
  refetchActiveOrganization: vi.fn(),
  refetchSession: vi.fn(),
  setActiveOrganization: vi.fn(),
  useActiveOrganization: vi.fn(),
  useSession: vi.fn(),
}));

vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  removeItem: vi.fn(),
  setItem: vi.fn(),
});

vi.mock("@repo/data/http", () => ({
  getUserFacingDescription: () => "Connect and try again.",
  getUserFacingError: () => ({ titleKey: "errors.network.offline.title" }),
}));

vi.mock("@repo/features/auth/logout", () => ({
  logout,
}));

vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div data-testid="loader" />,
}));

vi.mock("@repo/features/region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) => path,
  }),
  useRegionClients: () => ({
    authClient: {
      organization: {
        list: listOrganizations,
        setActive: setActiveOrganization,
      },
      useActiveOrganization,
      useSession,
    },
    manifest: {
      apiUrl: "https://api.example.com",
    },
  }),
}));

vi.mock("posthog-js", () => ({
  default: {
    group: posthogGroup,
    identify: posthogIdentify,
    reset: posthogReset,
  },
}));

vi.mock("./power-sync-boundary", () => ({
  PowerSyncBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="power-sync">{children}</div>
  ),
}));

function guardRoutes(
  initialEntry:
    | string
    | { pathname: string; state: Record<string, unknown> } = "/",
) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AuthGuard />}>
          <Route element={<div data-testid="outlet" />} index />
          <Route element={<div data-testid="outlet" />} path=":organizationSlug" />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function renderGuard(
  initialEntry?:
    | string
    | { pathname: string; state: Record<string, unknown> },
) {
  return render(<StrictMode>{guardRoutes(initialEntry)}</StrictMode>);
}

function createOrganization(id: string, slug = id) {
  return { id, name: slug, slug };
}

function createSession(
  userId: string,
  activeOrganizationId: string | null,
) {
  return {
    session: { activeOrganizationId },
    user: {
      email: `${userId}@example.com`,
      emailVerified: true,
      id: userId,
      isAnonymous: false,
      name: userId,
    },
  };
}

describe("AuthGuard routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refetchActiveOrganization.mockResolvedValue({});
    refetchSession.mockResolvedValue({});
    setActiveOrganization.mockResolvedValue({});
    logout.mockResolvedValue(undefined);
    listOrganizations.mockResolvedValue({
      data: [createOrganization("org-1", "organization")],
    });
    useActiveOrganization.mockReturnValue({
      data: createOrganization("org-1", "organization"),
      isPending: false,
      refetch: refetchActiveOrganization,
    });
    useSession.mockReturnValue({
      data: createSession("user-1", "org-1"),
      error: null,
      isPending: false,
      refetch: refetchSession,
    });
  });

  it("identifies users and organizations without profile PII", async () => {
    renderGuard();

    await waitFor(() => {
      expect(posthogIdentify).toHaveBeenCalledWith("user-1", {
        is_anonymous: false,
      });
      expect(posthogGroup).toHaveBeenCalledWith("organization", "org-1");
    });
  });

  it("resolves a fresh account organization once under StrictMode", async () => {
    useActiveOrganization.mockReturnValue({
      data: null,
      isPending: false,
      refetch: refetchActiveOrganization,
    });
    useSession.mockReturnValue({
      data: createSession("new-user", null),
      error: null,
      isPending: false,
      refetch: refetchSession,
    });

    renderGuard();

    await waitFor(() =>
      expect(refetchActiveOrganization).toHaveBeenCalledTimes(1),
    );
    expect(listOrganizations).toHaveBeenCalledTimes(1);
    expect(setActiveOrganization).toHaveBeenCalledTimes(1);
    expect(refetchSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
  });

  it("does not activate an organization from the previous account", async () => {
    let currentUserId = "user-1";
    let finishFirstList:
      | ((value: { data: ReturnType<typeof createOrganization>[] }) => void)
      | undefined;
    listOrganizations
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstList = resolve;
          }),
      )
      .mockResolvedValue({
        data: [createOrganization("org-2", "second")],
      });
    useActiveOrganization.mockReturnValue({
      data: null,
      isPending: false,
      refetch: refetchActiveOrganization,
    });
    useSession.mockImplementation(() => ({
      data: createSession(currentUserId, null),
      error: null,
      isPending: false,
      refetch: refetchSession,
    }));

    const rendered = renderGuard();
    await waitFor(() => expect(listOrganizations).toHaveBeenCalledTimes(1));

    currentUserId = "user-2";
    rendered.rerender(<StrictMode>{guardRoutes()}</StrictMode>);

    await waitFor(() =>
      expect(setActiveOrganization).toHaveBeenCalledWith({
        organizationId: "org-2",
      }),
    );
    finishFirstList?.({
      data: [createOrganization("org-1", "first")],
    });
    await Promise.resolve();

    expect(setActiveOrganization).not.toHaveBeenCalledWith({
      organizationId: "org-1",
    });
  });

  it("keeps loading while the switched account organization catches up", () => {
    useActiveOrganization.mockReturnValue({
      data: createOrganization("org-1", "first"),
      error: null,
      isPending: false,
      refetch: refetchActiveOrganization,
    });
    useSession.mockReturnValue({
      data: createSession("user-2", "org-2"),
      error: null,
      isPending: false,
      refetch: refetchSession,
    });

    const rendered = renderGuard({
      pathname: "/",
      state: { accountSwitchTargetUserId: "user-2" },
    });

    expect(rendered.getByTestId("loader")).toBeTruthy();
    expect(rendered.queryByRole("button")).toBeNull();
    expect(rendered.queryByTestId("power-sync")).toBeNull();
  });

  it("reports an active organization mismatch outside account switching", () => {
    useActiveOrganization.mockReturnValue({
      data: createOrganization("org-1", "first"),
      error: null,
      isPending: false,
      refetch: refetchActiveOrganization,
    });
    useSession.mockReturnValue({
      data: createSession("user-2", "org-2"),
      error: null,
      isPending: false,
      refetch: refetchSession,
    });

    const rendered = renderGuard();

    expect(
      rendered.getByRole("button", { name: "common.retry" }),
    ).toBeTruthy();
    expect(rendered.queryByTestId("loader")).toBeNull();
  });

  it("renders a scoped retry without logging out on session transport failure", async () => {
    useSession.mockReturnValue({
      data: null,
      error: new TypeError("offline"),
      isPending: false,
      refetch: refetchSession,
    });

    const rendered = renderGuard();

    expect(
      await rendered.findByRole("button", { name: "common.retry" }),
    ).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
    expect(rendered.queryByTestId("power-sync")).toBeNull();
  });

  it("retries organization resolution after a transport failure", async () => {
    useActiveOrganization.mockReturnValue({
      data: null,
      error: null,
      isPending: false,
      refetch: refetchActiveOrganization,
    });
    useSession.mockReturnValue({
      data: createSession("new-user", null),
      error: null,
      isPending: false,
      refetch: refetchSession,
    });
    listOrganizations
      .mockResolvedValueOnce({
        data: null,
        error: new TypeError("offline"),
      })
      .mockResolvedValueOnce({
        data: [createOrganization("org-1", "organization")],
        error: null,
      });

    const rendered = renderGuard();
    const retry = await rendered.findByRole("button", {
      name: "common.retry",
    });

    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(retry);

    await waitFor(() => {
      expect(listOrganizations).toHaveBeenCalledTimes(2);
      expect(setActiveOrganization).toHaveBeenCalledWith({
        organizationId: "org-1",
      });
    });
    expect(logout).not.toHaveBeenCalled();
  });
});
