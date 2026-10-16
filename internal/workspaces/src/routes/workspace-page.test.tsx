/** @vitest-environment happy-dom */

import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock("@repo/workspaces/editor", () => ({
  WorkspaceNotFound: () => <div>workspace-not-found</div>,
  WorkspaceUnavailableOffline: ({ backTo }: { backTo: string }) => (
    <div data-testid="workspace-unavailable-offline">{backTo}</div>
  ),
}));

vi.mock("@repo/workspaces/extensions", () => ({
  ExtensionRegistryProvider: ({ children }: { children?: React.ReactNode }) =>
    children ?? null,
  subscribeToWorkspaceExtensionChanges: () => () => undefined,
}));

const {
  currentWorkspaceMock,
  preloadWorkspacePluginsMock,
  workspaceRoleMock,
  sessionMock,
  organizationControllerMock,
} = vi.hoisted(() => ({
  currentWorkspaceMock: vi.fn(),
  preloadWorkspacePluginsMock: vi.fn(),
  workspaceRoleMock: vi.fn(),
  sessionMock: vi.fn(),
  organizationControllerMock: vi.fn(),
}));

vi.mock("@repo/data/features/workspace-members", () => ({
  useWorkspaceMemberRole: () => workspaceRoleMock(),
}));

vi.mock("@repo/features/auth/context", () => ({
  useAuth: () => ({
    useSession: () => sessionMock(),
  }),
}));

vi.mock("@repo/workspaces/workspace", () => ({
  WorkspaceProvider: ({ children }: { children?: React.ReactNode }) =>
    children ?? null,
  useCurrentWorkspace: () => currentWorkspaceMock(),
}));

vi.mock("@repo/features/region", () => ({
  useRegionClients: vi.fn(),
}));

vi.mock("../extensions/host", () => ({
  ExtensionHostProvider: ({ children }: { children?: React.ReactNode }) =>
    children ?? null,
}));

vi.mock("../extensions/registry", () => ({
  ALL_PLUGIN_IDS: [],
  PLUGIN_METADATA: {},
}));

vi.mock("../extensions/organization-runtime", () => ({
  WorkspacePluginRuntimeProvider: ({
    children,
  }: {
    children?: React.ReactNode;
  }) => children ?? null,
  useOrganizationPluginRuntime: () => ({
    allExtensionIds: [],
    defaultExtensionIds: [],
    extensionManifests: {},
    key: "",
    loadPlugin: vi.fn(),
    unloadPlugin: vi.fn(),
    extensionMetadata: {},
  }),
}));

vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div data-testid="generic-loader" />,
}));

vi.mock("./workspace-desktop-shell", () => ({
  DesktopWorkspaceShell: () => <div>desktop-shell</div>,
}));

vi.mock("./workspace-mobile-shell", () => ({
  MobileWorkspaceShell: () => <div>mobile-shell</div>,
}));

vi.mock("./workspace-runtime", () => ({
  useWorkspaceRuntimeController: () => organizationControllerMock(),
}));

vi.mock("./workspace-plugin-preload", () => ({
  useWorkspacePluginPreload: () => preloadWorkspacePluginsMock,
}));

import { PermissionProvider } from "@repo/features/permissions";
import { useRegionClients } from "@repo/features/region";
import { MemoryRouter, Route, Routes } from "react-router";
import WorkspacePage from "./workspace";
import { readLastWorkspace } from "./last-workspace";

describe("WorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    currentWorkspaceMock.mockReturnValue({
      isLoading: false,
      isUnavailableOffline: false,
      workspace: { id: "workspace_1" },
    });
    workspaceRoleMock.mockReturnValue({ data: undefined, isLoading: false });
    sessionMock.mockReturnValue({ data: { user: { id: "user_1" } } });
    organizationControllerMock.mockReturnValue({});
  });

  it("shows dockview loading shell on desktop while auth client is missing", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: null,
    } as ReturnType<typeof useRegionClients>);

    render(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(
      screen.getByTestId("desktop-workspace-loading-shell")
    ).not.toBeNull();
    expect(
      screen.getAllByTestId("desktop-workspace-loading-group")
    ).toHaveLength(2);
    expect(screen.getByTestId("workspace-tree-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("generic-loader")).toBeNull();
  });

  it("keeps generic loader on mobile while auth client is missing", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: null,
    } as ReturnType<typeof useRegionClients>);

    render(
      <MemoryRouter>
        <WorkspacePage shell="mobile" />
      </MemoryRouter>
    );

    expect(screen.getByTestId("generic-loader")).not.toBeNull();
    expect(screen.queryByTestId("desktop-workspace-loading-shell")).toBeNull();
  });

  it("shows desktop loading shell while workspace context is loading", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({ isLoading: true, workspace: null });

    render(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(
      screen.getByTestId("desktop-workspace-loading-shell")
    ).not.toBeNull();
    expect(screen.queryByText("workspace-not-found")).toBeNull();
    expect(organizationControllerMock).not.toHaveBeenCalled();
  });

  it("shows mobile loader while workspace context is loading", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({ isLoading: true, workspace: null });

    render(
      <MemoryRouter>
        <WorkspacePage shell="mobile" />
      </MemoryRouter>
    );

    expect(screen.getByTestId("generic-loader")).not.toBeNull();
    expect(screen.queryByText("workspace-not-found")).toBeNull();
    expect(organizationControllerMock).not.toHaveBeenCalled();
  });

  it("waits for workspace streams before preloading workspace plugins", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({
      isLoading: true,
      isUnavailableOffline: false,
      workspace: { id: "workspace_1" },
      workspaceContentHasSynced: false,
    });

    const { rerender } = render(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(preloadWorkspacePluginsMock).not.toHaveBeenCalled();

    currentWorkspaceMock.mockReturnValue({
      isLoading: true,
      isUnavailableOffline: false,
      workspace: { id: "workspace_1" },
      workspaceContentHasSynced: true,
    });
    rerender(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(preloadWorkspacePluginsMock).toHaveBeenCalledWith("workspace_1");
    expect(organizationControllerMock).not.toHaveBeenCalled();
  });

  it("replaces loading shell when workspace resolves", async () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({ isLoading: true, workspace: null });

    const { rerender } = render(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(
      screen.getByTestId("desktop-workspace-loading-shell")
    ).not.toBeNull();

    currentWorkspaceMock.mockReturnValue({
      isLoading: false,
      isUnavailableOffline: false,
      workspace: { id: "workspace_1" },
    });
    await act(async () =>
      rerender(
        <MemoryRouter>
          <WorkspacePage shell="desktop" />
        </MemoryRouter>
      )
    );
    await vi.dynamicImportSettled();

    expect(screen.queryByTestId("desktop-workspace-loading-shell")).toBeNull();
    expect(screen.getByText("desktop-shell")).not.toBeNull();
  });

  it("shows not-found only after workspace context settles empty", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({ isLoading: false, workspace: null });

    render(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(screen.getByText("workspace-not-found")).not.toBeNull();
    expect(organizationControllerMock).not.toHaveBeenCalled();
  });

  it("does not mount workspace content without read access", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);

    render(
      <MemoryRouter initialEntries={["/lunar/atlas"]}>
        <PermissionProvider
          check={({ action, resource }) =>
            !(resource === "content" && action === "read")
          }
        >
          <Routes>
            <Route
              element={<WorkspacePage shell="desktop" />}
              path="/:organizationSlug/:workspaceSlug"
            />
          </Routes>
        </PermissionProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("permission-denied")).not.toBeNull();
    expect(organizationControllerMock).not.toHaveBeenCalled();
  });

  it("denies stale private workspaces after membership removal", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({
      isLoading: false,
      isUnavailableOffline: false,
      workspace: {
        id: "workspace_1",
        owner_id: "owner_1",
        visibility: "private",
      },
      workspaceContentHasSynced: true,
    });

    render(
      <MemoryRouter initialEntries={["/lunar/atlas"]}>
        <Routes>
          <Route
            element={<WorkspacePage shell="desktop" />}
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("permission-denied")).not.toBeNull();
    expect(organizationControllerMock).not.toHaveBeenCalled();
    expect(preloadWorkspacePluginsMock).not.toHaveBeenCalled();
  });

  it.each(["desktop", "mobile"] as const)(
    "shows offline-unavailable state on %s with organization workspaces link",
    (shell) => {
      vi.mocked(useRegionClients).mockReturnValue({
        authClient: {
          useActiveOrganization: () => ({ data: { id: "org_1" } }),
        },
      } as ReturnType<typeof useRegionClients>);
      currentWorkspaceMock.mockReturnValue({
        isLoading: false,
        isUnavailableOffline: true,
        workspace: { id: "workspace_1" },
      });

      render(
        <MemoryRouter initialEntries={["/lunar/atlas"]}>
          <Routes>
            <Route
              element={<WorkspacePage shell={shell} />}
              path="/:organizationSlug/:workspaceSlug"
            />
          </Routes>
        </MemoryRouter>
      );

      expect(
        screen.getByTestId("workspace-unavailable-offline").textContent
      ).toBe("/lunar");
      expect(
        screen.queryByTestId("desktop-workspace-loading-shell")
      ).toBeNull();
      expect(screen.queryByTestId("generic-loader")).toBeNull();
      expect(organizationControllerMock).not.toHaveBeenCalled();
    }
  );

  it("remembers opened resource for current account and organization", async () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: { useActiveOrganization: () => ({ data: { id: "org_1" } }) },
    } as ReturnType<typeof useRegionClients>);
    currentWorkspaceMock.mockReturnValue({
      isLoading: false,
      workspace: { id: "workspace_1", organization_id: "org_1" },
    });
    render(
      <MemoryRouter initialEntries={["/lunar/atlas/res_123"]}>
        <Routes>
          <Route
            path="/:organizationSlug/:workspaceSlug"
            element={<WorkspacePage shell="desktop" />}
          >
            <Route path=":viewId" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(readLastWorkspace("user_1", "org_1")).toEqual({
      workspaceId: "workspace_1",
      viewPath: "/res_123",
    });
  });

  it.each(["missing", "offline", "denied"])(
    "falls back to workspace list when restored workspace is %s",
    async (reason) => {
      vi.mocked(useRegionClients).mockReturnValue({
        authClient: {
          useActiveOrganization: () => ({ data: { id: "org_1" } }),
        },
      } as ReturnType<typeof useRegionClients>);
      currentWorkspaceMock.mockReturnValue({
        isLoading: false,
        isUnavailableOffline: reason === "offline",
        workspace:
          reason === "missing"
            ? null
            : { id: "workspace_1", visibility: "private", owner_id: "other" },
      });
      render(
        <MemoryRouter
          initialEntries={[
            { pathname: "/lunar/atlas", state: { restoredWorkspace: true } },
          ]}
        >
          <Routes>
            <Route
              path="/:organizationSlug/:workspaceSlug"
              element={<WorkspacePage shell="desktop" />}
            />
            <Route
              path="/:organizationSlug"
              element={<div>workspace-list-fallback</div>}
            />
          </Routes>
        </MemoryRouter>
      );
      expect(await screen.findByText("workspace-list-fallback")).toBeTruthy();
    }
  );

  it("mounts shell controller only after workspace resolves", () => {
    vi.mocked(useRegionClients).mockReturnValue({
      authClient: {
        useActiveOrganization: () => ({ data: { id: "org_1" } }),
      },
    } as ReturnType<typeof useRegionClients>);

    render(
      <MemoryRouter>
        <WorkspacePage shell="desktop" />
      </MemoryRouter>
    );

    expect(screen.getByText("desktop-shell")).not.toBeNull();
    expect(organizationControllerMock).toHaveBeenCalledTimes(1);
  });
});
