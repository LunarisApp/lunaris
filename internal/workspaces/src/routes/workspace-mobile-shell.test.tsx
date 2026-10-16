/** @vitest-environment happy-dom */

import { useOrganizationNavigation } from "@repo/workspaces/organization-navigation";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type React from "react";
import { useMemo, useState } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cleanupPluginsMock,
  explorerSuspense,
  initializePluginsMock,
  posthogCaptureMock,
  toastErrorMock,
  pluginViewState,
} = vi.hoisted(() => ({
  cleanupPluginsMock: vi.fn(),
  explorerSuspense: {
    enabled: false,
    promise: Promise.resolve() as Promise<void>,
    resolve: () => {},
  },
  initializePluginsMock: vi.fn(),
  posthogCaptureMock: vi.fn(),
  toastErrorMock: vi.fn(),
  pluginViewState: { views: [] as Record<string, unknown>[] },
}));

vi.mock("posthog-js", () => ({
  default: { capture: posthogCaptureMock },
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock },
}));

vi.mock("@repo/workspaces/grid-layout", () => ({
  GridLayoutProvider: ({ children }: { children?: React.ReactNode }) =>
    children ?? null,
  useGridLayoutStore: (
    selector: (state: { isFocusMode: boolean }) => unknown
  ) => selector({ isFocusMode: false }),
}));

vi.mock("@repo/workspaces/editor", async () => {
  const { createElement } = await import("react");
  const { useGridLayoutStore } = await import("@repo/workspaces/grid-layout");

  return {
    ResourceViewLayout: ({ children, resource }) => {
      const isFocusMode = useGridLayoutStore((state) => state.isFocusMode);

      return createElement(
        "section",
        { "data-testid": "resource-view-layout" },
        createElement(
          "div",
          { "data-testid": "resource-view-layout-state" },
          `${resource.id}:${String(isFocusMode)}`
        ),
        children
      );
    },
  };
});

vi.mock("@repo/features/mobile", () => ({
  MobileHeader: ({ title, titleTrailing }) => (
    <header>
      <h1>{title}</h1>
      {titleTrailing}
    </header>
  ),
}));

vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: () => ({
    workspace: {
      id: "workspace_1",
      name: "Workspace One",
      slug: "workspace-one",
    },
  }),
}));

vi.mock("@repo/workspaces/workspace-explorer", () => ({
  WORKSPACE_TRASH_PLUGIN_ID: "system-workspace-trash",
  WORKSPACE_TRASH_RENDERER: "panel",
  WorkspaceExplorerTree: () => <div data-testid="workspace-tree" />,
  WorkspaceExplorerContainer: ({
    children,
  }: {
    children?: React.ReactNode;
  }) => {
    if (explorerSuspense.enabled) {
      throw explorerSuspense.promise;
    }
    return children ?? null;
  },
  WorkspaceTreeSkeleton: () => <div data-testid="workspace-tree-skeleton" />,
  WorkspaceTrashPanel: () => null,
  WorkspaceTrashButton: () => <button type="button">trash</button>,
  isFolder: (item) => item?.resource_type_id === "lunaris.folder",
  useWorkspaceResourcesMap: () =>
    new Map([
      [
        "item_board",
        {
          id: "item_board",
          name: "Roadmap",
          resource_type_id: "lunaris.kanban",
          schema_version: 1,
        },
      ],
      [
        "item_1",
        {
          id: "item_1",
          name: "Spec",
          resource_type_id: "lunaris.rich-text",
          schema_version: 1,
        },
      ],
    ]),
}));

vi.mock("@repo/workspaces/search", () => ({
  useResourceContentSearch: () => [],
  useResourceSearch: () => [],
  SearchProvider: ({
    children,
    indexingReady,
  }: {
    children?: React.ReactNode;
    indexingReady?: boolean;
  }) => (
    <div
      data-indexing-ready={String(indexingReady)}
      data-testid="search-provider"
    >
      {children}
    </div>
  ),
}));

vi.mock("@repo/features/sync-status", () => ({
  default: () => <div data-testid="sync-status" />,
}));

vi.mock("@repo/features/user-menu", () => ({
  MobileUserMenu: () => <div data-testid="mobile-user-menu" />,
}));

vi.mock("@lunarisapp/plugin-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lunarisapp/plugin-sdk")>()),
  createPluginSubviewViewInstanceId: ({ resourceId, path, subviewId }) =>
    `plugin-subview:${resourceId}:${path}:${subviewId}`,
  useResourceTypes: () => [
    {
      defaultViewId: "lunaris.rich-text",
      resourceTypeId: "lunaris.rich-text",
    },
    { defaultViewId: "lunaris.kanban", resourceTypeId: "lunaris.kanban" },
  ],
  useViews: () => pluginViewState.views,
}));

vi.mock("../extensions/host/provider", () => ({
  usePluginHostLifecycle: () => ({
    cleanupPlugins: cleanupPluginsMock,
    disablePlugin: vi.fn(),
    initializePlugins: initializePluginsMock,
    reloadPlugin: vi.fn(),
  }),
}));

vi.mock("../extensions/host", async () => ({
  usePluginRuntimeHost: (await import("../extensions/host/plugin-runtime-host"))
    .usePluginRuntimeHost,
}));

vi.mock("../extensions/organization-runtime", () => ({
  useOrganizationPluginRuntime: () => ({
    enabledExtensionIds: ["lunaris.rich-text"],
    extensionAvailability: { "lunaris.rich-text": "available" },
    registerRuntimeReconciler: () => () => undefined,
    runtimeRevisions: { "lunaris.rich-text": "current" },
  }),
}));

vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div data-testid="loader" />,
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@lunarisapp/ui/components/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@lunarisapp/ui/icons", async () => {
  const actual = await vi.importActual<typeof import("@lunarisapp/ui/icons")>(
    "@lunarisapp/ui/icons"
  );

  return {
    ...actual,
    HugeiconsIcon: () => null,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}));

vi.mock("@repo/features/app-update", () => ({
  AppUpdateButton: () => <div data-testid="app-update" />,
}));

vi.mock("@repo/features/auth/use-logout", () => ({
  useLogout: () => vi.fn(),
}));

import MobileExplorerPage from "./mobile-explorer-page";
import MobileViewPage from "./mobile-view-page";
import { MobileWorkspaceShell } from "./workspace-mobile-shell";

function createController(overrides = {}) {
  const manifest = {
    description: "Rich text",
    developer: "Lunaris",
    id: "lunaris.rich-text",
    contributions: [],
    name: "Rich text",
    api: "^0.9.0",
    permissions: [],
    version: "1.0.0",
  };
  return {
    bootError: null,
    bootState: "loading" as const,

    createDataStorageService: vi.fn(),

    createWorkspaceDataService: vi.fn(),

    enabledPluginIds: ["lunaris.rich-text"],
    extensionManifests: { "lunaris.rich-text": manifest },
    extensionMetadata: {
      "lunaris.rich-text": {
        icon: {},
        id: "lunaris.rich-text",
        version: "1.0.0",
      },
    },
    loadPlugin: vi.fn(async (id: string) => ({
      plugin: {
        activate: () => undefined,
        manifest: {
          ...manifest,
          id,
          name: id,
        },
      },
    })),
    markReady: vi.fn(),
    workspaceId: "workspace_1",
    reportBootError: vi.fn(),
    retryBoot: vi.fn(),
    retryKey: 0,
    yjsStorageService: { create: vi.fn(), delete: vi.fn(), exists: vi.fn() },
    ...overrides,
  };
}

function MobileShellHarness() {
  const [bootState, setBootState] = useState("loading");
  const controller = useMemo(
    () =>
      createController({
        bootState,
        markReady: () => setBootState("ready"),
      }),
    [bootState]
  );

  return (
    <Routes>
      <Route
        element={<MobileWorkspaceShell controller={controller} />}
        path="/:organizationSlug/:workspaceSlug"
      >
        <Route element={<MobileExplorerPage />} index />
        <Route
          element={<MobileViewPage />}
          path=":viewId/:subviewPath/:subviewId"
        />
        <Route element={<MobileViewPage />} path=":viewId" />
      </Route>
    </Routes>
  );
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function MobileWindowProbe() {
  const { openResourceInNewWindow, openViewInNewWindow } =
    useOrganizationNavigation();
  const [itemSupported, setItemSupported] = useState<boolean | null>(null);
  const [panelSupported, setPanelSupported] = useState<boolean | null>(null);

  return (
    <div>
      <button
        onClick={() => {
          void openViewInNewWindow({
            extensionId: "lunaris.kanban",
            title: "Task",
            viewId: "task-detail",
          }).then(setPanelSupported);
        }}
        type="button"
      >
        Open panel window
      </button>
      <button
        onClick={() => {
          void openResourceInNewWindow({
            parentId: null,
            resourceId: "task-1",
            resourceTypeId: "lunaris.kanban.task",
            schemaVersion: 1,
            title: "Task",
          }).then(setItemSupported);
        }}
        type="button"
      >
        Open item window
      </button>
      <output data-testid="panel-window-supported">
        {String(panelSupported)}
      </output>
      <output data-testid="item-window-supported">
        {String(itemSupported)}
      </output>
    </div>
  );
}

function MobileReplaceProbe() {
  const { openResource } = useOrganizationNavigation();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div>
      <button
        onClick={() =>
          openResource({
            parentId: null,
            resourceId: "item_board",
            resourceTypeId: "lunaris.kanban",
            schemaVersion: 1,
            replaceCurrent: true,
            title: "Roadmap",
          })
        }
        type="button"
      >
        Replace with board
      </button>
      <button onClick={() => navigate(-1)} type="button">
        Back
      </button>
      <output data-testid="replace-location">{location.pathname}</output>
    </div>
  );
}

function MobilePanelProbe() {
  const { openView } = useOrganizationNavigation();
  const location = useLocation();
  const [supported, setSupported] = useState<boolean | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          setSupported(
            openView({
              extensionId: "acme.assistant-plugin",
              title: "Assistant",
              viewId: "acme.assistant",
            })
          )
        }
        type="button"
      >
        Open view
      </button>
      <button
        onClick={() =>
          setSupported(
            openView({
              extensionId: "acme.unknown",
              title: "Unknown",
              viewId: "unknown",
            })
          )
        }
        type="button"
      >
        Open unknown panel
      </button>
      <output data-testid="panel-location">{location.pathname}</output>
      <output data-testid="panel-supported">{String(supported)}</output>
    </div>
  );
}

function suspendExplorer() {
  explorerSuspense.enabled = true;
  explorerSuspense.promise = new Promise<void>((resolve) => {
    explorerSuspense.resolve = resolve;
  });
}

async function resolveExplorer() {
  explorerSuspense.enabled = false;
  explorerSuspense.resolve();
  await explorerSuspense.promise;
}

describe("MobileWorkspaceShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupPluginsMock.mockResolvedValue(undefined);
    initializePluginsMock.mockResolvedValue([]);
    explorerSuspense.enabled = false;
    explorerSuspense.promise = Promise.resolve();
    explorerSuspense.resolve = () => {};
    pluginViewState.views = [
      {
        definition: { viewId: "lunaris.rich-text" },
        extensionId: "lunaris.rich-text",
      },
      {
        definition: { viewId: "lunaris.kanban" },
        extensionId: "lunaris.kanban",
      },
    ];
  });

  afterEach(() => {
    explorerSuspense.enabled = false;
  });

  it("shows explorer shell and tree skeleton immediately", () => {
    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({ enabledPluginIds: null })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("mobile-workspace-loading-shell")).not.toBeNull();
    expect(screen.getByTestId("workspace-tree-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("loader")).toBeNull();
    expect(screen.getByTestId("search-provider").dataset.indexingReady).toBe(
      "false"
    );
  });

  it("keeps generic loader for document organization boot", () => {
    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one/item_1"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({ enabledPluginIds: null })}
              />
            }
            path="/:organizationSlug/:workspaceSlug/:viewId"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("loader")).not.toBeNull();
    expect(screen.queryByTestId("workspace-tree-skeleton")).toBeNull();
  });

  it("catches explorer provider suspension with workspace tree skeleton", () => {
    suspendExplorer();

    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({ bootState: "ready" })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("mobile-workspace-loading-shell")).not.toBeNull();
    expect(screen.getByTestId("search-provider").dataset.indexingReady).toBe(
      "true"
    );
    expect(screen.getByTestId("workspace-tree-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("loader")).toBeNull();
  });

  it("keeps skeleton visible when explorer resolves before boot", async () => {
    suspendExplorer();

    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({ enabledPluginIds: null })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("workspace-tree-skeleton")).not.toBeNull();

    await act(resolveExplorer);

    expect(screen.getByTestId("mobile-workspace-loading-shell")).not.toBeNull();
    expect(screen.getByTestId("workspace-tree-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("loader")).toBeNull();
  });

  it("initializes plugins while explorer provider is suspended", async () => {
    suspendExplorer();

    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={<MobileWorkspaceShell controller={createController()} />}
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledOnce();
    });
  });

  it("replaces explorer skeleton when boot resolves", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({ enabledPluginIds: null })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("mobile-workspace-loading-shell")).not.toBeNull();
    expect(screen.getByTestId("workspace-tree-skeleton")).not.toBeNull();

    rerender(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({
                  bootState: "ready",
                  enabledPluginIds: null,
                })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByTestId("workspace-tree-skeleton")).toBeNull();
    expect(screen.queryByTestId("loader")).toBeNull();
  });

  it("shows organization boot error immediately", () => {
    suspendExplorer();

    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({
                  bootError: "boom",
                  bootState: "error",
                  enabledPluginIds: null,
                })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("boom")).not.toBeNull();
    expect(screen.queryByTestId("loader")).toBeNull();
    expect(screen.queryByTestId("workspace-tree-skeleton")).toBeNull();
  });

  it("renders resource views inside grid layout provider on mobile", async () => {
    initializePluginsMock.mockImplementation(async (_plugins, deps) => {
      deps.gridLayoutRegister("lunaris.rich-text", "lunaris.rich-text", () =>
        deps.resourceViewLayoutWrapper({
          children: <div data-testid="document-body">Document body</div>,
          resource: {
            id: "item_1",
            parentId: null,
            resourceTypeId: "lunaris.rich-text",
            schemaVersion: 1,
            title: "Spec",
          },
        })
      );
      return [];
    });

    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one/item_1"]}>
        <MobileShellHarness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("resource-view-layout")).not.toBeNull();
    });

    expect(screen.getByRole("heading", { name: "Spec" })).not.toBeNull();
    expect(screen.getByTestId("resource-view-layout-state").textContent).toBe(
      "item_1:false"
    );
    expect(screen.getByTestId("document-body").textContent).toBe(
      "Document body"
    );
    await waitFor(() => {
      expect(document.title).toBe("Spec");
    });
  });

  it("reports detached panel windows as unsupported on mobile", async () => {
    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({
                  bootState: "ready",
                  enabledPluginIds: null,
                })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          >
            <Route element={<MobileWindowProbe />} index />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open panel window" }));

    await waitFor(() => {
      expect(screen.getByTestId("panel-window-supported").textContent).toBe(
        "false"
      );
    });
    expect(toastErrorMock).toHaveBeenCalledWith(
      "gridLayout.tab.openInNewWindowError"
    );
    expect(posthogCaptureMock).toHaveBeenCalledWith(
      "panel_open_in_new_window_failed",
      { failure_reason: "unsupported", platform: "mobile" }
    );

    fireEvent.click(screen.getByRole("button", { name: "Open item window" }));
    await waitFor(() => {
      expect(screen.getByTestId("item-window-supported").textContent).toBe(
        "false"
      );
    });
    expect(toastErrorMock).toHaveBeenCalledTimes(2);
    expect(posthogCaptureMock).toHaveBeenCalledTimes(2);
  });

  it("opens only registered views on mobile", () => {
    pluginViewState.views = [
      {
        definition: { viewId: "acme.assistant" },
        extensionId: "acme.assistant-plugin",
      },
    ];

    render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({
                  bootState: "ready",
                  enabledPluginIds: null,
                })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          >
            <Route element={<MobilePanelProbe />} index />
            <Route element={<MobilePanelProbe />} path="*" />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open unknown panel" }));
    expect(screen.getByTestId("panel-supported").textContent).toBe("false");
    expect(screen.getByTestId("panel-location").textContent).toBe(
      "/organization-a/workspace-one"
    );

    fireEvent.click(screen.getByRole("button", { name: "Open view" }));
    expect(screen.getByTestId("panel-supported").textContent).toBe("true");
    expect(screen.getByTestId("panel-location").textContent).toBe(
      "/organization-a/workspace-one/view:acme.assistant"
    );
  });

  it("replaces mobile item history without visiting workspace root", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/organization-a/workspace-one",
          "/organization-a/workspace-one/task-1",
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route
            element={
              <MobileWorkspaceShell
                controller={createController({
                  bootState: "ready",
                  enabledPluginIds: null,
                })}
              />
            }
            path="/:organizationSlug/:workspaceSlug"
          >
            <Route element={<MobileReplaceProbe />} index />
            <Route element={<MobileReplaceProbe />} path="*" />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace with board" }));
    expect(screen.getByTestId("replace-location").textContent).toBe(
      "/organization-a/workspace-one/item_board"
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => {
      expect(screen.getByTestId("replace-location").textContent).toBe(
        "/organization-a/workspace-one"
      );
    });
  });

  it("redirects unsupported legacy task subview URLs to the board", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/organization-a/workspace-one/item_board/task/task_1",
        ]}
      >
        <LocationProbe />
        <MobileShellHarness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/organization-a/workspace-one/item_board"
      );
    });
  });

  it("keeps browser title on Lunaris for explorer route", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/organization-a/workspace-one"]}>
        <MobileShellHarness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("workspace-tree")).not.toBeNull();
    });

    await waitFor(() => {
      expect(document.title).toBe("Lunaris");
    });

    unmount();

    expect(document.title).toBe("Lunaris");
  });
});
