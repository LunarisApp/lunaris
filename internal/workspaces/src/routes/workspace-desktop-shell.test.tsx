vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: () => ({ allowed: false, pending: false }),
}));

/** @vitest-environment happy-dom */

import React, { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const {
  cleanupPluginsMock,
  completePanelWindowTransferMock,
  disablePluginMock,
  extensionsPanelMock,
  initializePluginsMock,
  jsonObjectsEqualMock,
  loadPluginMock,
  logErrorMock,
  logWarnMock,
  panelWindowDescriptorFromPanelMock,
  openWorkspacePanelInNewWindowMock,
  panelWindowSearchMock,
  persistPanelWindowDescriptorMock,
  readPanelWindowSessionMock,
  reloadPluginMock,
} = vi.hoisted(() => ({
  cleanupPluginsMock: vi.fn(),
  completePanelWindowTransferMock: vi.fn(),
  disablePluginMock: vi.fn(),
  extensionsPanelMock: vi.fn(() => null),
  initializePluginsMock: vi.fn(),
  jsonObjectsEqualMock: vi.fn(() => true),
  loadPluginMock: vi.fn(),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
  panelWindowDescriptorFromPanelMock: vi.fn(),
  openWorkspacePanelInNewWindowMock: vi.fn(async () => true),
  panelWindowSearchMock: vi.fn((windowId) => `?panelWindow=${windowId}`),
  persistPanelWindowDescriptorMock: vi.fn(),
  readPanelWindowSessionMock: vi.fn(() => null),
  reloadPluginMock: vi.fn(),
}));

vi.mock("evlog", () => ({
  log: {
    error: logErrorMock,
    warn: logWarnMock,
  },
  parseError: (error: unknown) => error,
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock("@repo/features/app-update", () => ({
  AppUpdateButton: () => (
    <button data-testid="app-update-trigger" type="button" />
  ),
}));

vi.mock("@repo/features/appbar", () => ({
  Appbar: Object.assign(({ children }) => children ?? null, {
    Leading: ({ children }) => (
      <div data-testid="appbar-leading">{children}</div>
    ),
    Middle: ({ children }) => <div data-testid="appbar-middle">{children}</div>,
    Trailing: ({ children }) => (
      <div data-testid="appbar-trailing">{children}</div>
    ),
  }),
}));

vi.mock("@repo/workspaces/debugger", () => ({
  DEBUGGER_PLUGIN_ID: "system-debugger",
  DEBUGGER_RENDERER: "panel",
  DebuggerPanel: () => null,
  useDebuggerHotkey: vi.fn(),
}));

vi.mock("@repo/workspaces/editor", () => ({
  ResourceViewLayout: ({ children }) => children ?? null,
}));

vi.mock("@repo/workspaces/extensions", () => ({
  EXTENSIONS_PLUGIN_ID: "extensions",
  EXTENSIONS_RENDERER: "panel",
  ExtensionsButton: () => (
    <button data-testid="extensions-trigger" type="button" />
  ),
  ExtensionsPanel: extensionsPanelMock,
}));

vi.mock("@repo/workspaces/grid-layout", () => ({
  completePanelWindowTransfer: completePanelWindowTransferMock,
  createEmptyPanelDefinition: ({
    allowDuplicate,
    groupId,
    initial,
    title,
  }) => ({
    ...(allowDuplicate ? { allowDuplicate: true } : {}),
    params: initial ? { __lunarisInitialEmptyPanel: true } : {},
    pluginId: "grid-layout",
    position: { direction: "within", referenceGroup: groupId },
    renderer: "empty-panel",
    title,
  }),
  FocusModeOverlay: () => null,
  getRendererComponent: (pluginId: string, renderer: string) =>
    `${pluginId}.${renderer}`,
  GridLayoutProvider: ({ children }) => children ?? null,
  GridLayoutView: () => <div data-testid="grid-layout-view" />,
  jsonObjectsEqual: jsonObjectsEqualMock,
  LEFT_GROUP_ID: "left",
  MAIN_GROUP_ID: "main",
  panelWindowDescriptorFromPanel: panelWindowDescriptorFromPanelMock,
  panelWindowSearch: panelWindowSearchMock,
  persistPanelWindowDescriptor: persistPanelWindowDescriptorMock,
  readPanelWindowSession: readPanelWindowSessionMock,
  useFocusMode: vi.fn(),
  useGridLayoutStore: vi.fn(),
  useRenameActiveResource: vi.fn(),
}));

vi.mock("@repo/features/help-center", () => ({
  HelpCenterPopover: ({ variant }) => (
    <button data-testid="help-trigger" data-variant={variant} type="button" />
  ),
}));

vi.mock("@repo/workspaces/layouts", () => ({
  WorkspaceLayout: Object.assign(({ children }) => children ?? null, {
    Content: ({ children }) => children ?? null,
  }),
}));

vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: vi.fn(),
}));

vi.mock("@repo/workspaces/workspace-settings", () => ({
  WORKSPACE_SETTINGS_PLUGIN_ID: "system-workspace-settings",
  WORKSPACE_SETTINGS_RENDERER: "panel",
  WorkspaceSettingsButton: () => (
    <button data-testid="workspace-settings-trigger" type="button" />
  ),
  WorkspaceSettingsPanel: () => null,
}));

vi.mock("@repo/workspaces/workspace-explorer", () => ({
  WORKSPACE_EXPLORER_PLUGIN_ID: "workspace-explorer",
  WORKSPACE_EXPLORER_RENDERER: "tree",
  WORKSPACE_TRASH_PLUGIN_ID: "system-workspace-trash",
  WORKSPACE_TRASH_RENDERER: "panel",
  WorkspaceExplorerButton: () => (
    <button data-testid="workspace-explorer-button" type="button" />
  ),
  WorkspaceExplorerContainer: ({ children }) => (
    <div data-testid="workspace-explorer-provider">{children}</div>
  ),
  WorkspaceExplorerTree: ({ footerActions }) => (
    <div data-testid="workspace-explorer-tree">{footerActions}</div>
  ),
  WorkspaceTrashPanel: () => null,
  WorkspaceTreeSkeleton: () => <div data-testid="workspace-tree-skeleton" />,
  isFolder: (item) => item?.resource_type_id === "lunaris.folder",
  useNavigateToResource: () => vi.fn(),
  useWorkspaceResourcesMap: vi.fn(),
}));

vi.mock("@repo/workspaces/search", () => ({
  SearchButton: ({ workspaceName }) => (
    <button
      data-workspace-name={workspaceName}
      data-testid="search-trigger"
      type="button"
    />
  ),
  SearchDialog: () => null,
  SearchProvider: ({ children, indexingReady }) => (
    <div
      data-indexing-ready={String(indexingReady)}
      data-testid="search-provider"
    >
      {children}
    </div>
  ),
}));

vi.mock("@repo/workspaces/statusbar", () => ({
  ActiveResourceStatusBar: () => (
    <span data-testid="active-content-statusbar" />
  ),
  Statusbar: Object.assign(({ children }) => children ?? null, {
    Leading: ({ children }) => (
      <div data-testid="statusbar-leading">{children}</div>
    ),
    Middle: ({ children }) => children ?? null,
    Trailing: ({ children }) => children ?? null,
  }),
}));

vi.mock("@repo/features/sync-status", () => ({
  default: () => <span data-testid="sync-status" />,
}));

vi.mock("@repo/features/user-menu", () => ({
  UserMenu: () => <button data-testid="user-menu-trigger" type="button" />,
}));

vi.mock("@repo/workspaces/organization-navigation", () => ({
  OrganizationNavigationProvider: vi.fn(({ children }) => children ?? null),
  useOrganizationNavigation: vi.fn(),
  useOrganizationViewState: () => ({ activeViewInstanceId: null }),
  getTool: vi.fn(),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  createPluginSubviewViewInstanceId: ({
    resourceId,
    path,
    subviewId,
  }: {
    resourceId: string;
    path: string;
    subviewId: string;
  }) => `plugin-subview:${resourceId}:${path}:${subviewId}`,
  useResourceTypes: () => [
    {
      defaultViewId: "lunaris.rich-text",
      resourceTypeId: "lunaris.rich-text",
    },
    { defaultViewId: "lunaris.kanban", resourceTypeId: "lunaris.kanban" },
    {
      defaultViewId: "lunaris.kanban.task",
      resourceTypeId: "lunaris.kanban.task",
    },
  ],
  useViews: () => [
    {
      definition: {
        target: { kind: "resource" },
        viewId: "lunaris.rich-text",
      },
      extensionId: "lunaris.rich-text",
    },
    {
      definition: {
        target: { kind: "resource" },
        viewId: "lunaris.kanban",
      },
      extensionId: "lunaris.kanban",
    },
    {
      definition: {
        target: { kind: "resource" },
        viewId: "lunaris.kanban.task",
      },
      extensionId: "lunaris.kanban",
    },
  ],
}));

vi.mock("../extensions/host/provider", () => ({
  usePluginHostLifecycle: () => ({
    cleanupPlugins: cleanupPluginsMock,
    disablePlugin: disablePluginMock,
    initializePlugins: initializePluginsMock,
    reloadPlugin: reloadPluginMock,
  }),
}));

vi.mock("../extensions/host", async () => ({
  hasPendingResourceOpen: vi.fn(() => false),
  reportResourceOpenFailure: vi.fn(),
  reportResourceOpenReady: vi.fn(),
  startResourceOpenStage: () => vi.fn(),
  startResourceOpen: vi.fn(),
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

vi.mock("../extensions/registry", () => ({
  ALL_PLUGIN_IDS: ["lunaris.rich-text"],
  loadPlugin: loadPluginMock,
}));

vi.mock("@repo/features/build-version", () => ({
  BuildVersion: () => null,
}));

vi.mock("@repo/features/loading", () => ({
  LoaderView: () => null,
}));

vi.mock("../components/skip-link", () => ({
  SkipLink: () => null,
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: () => null,
}));

vi.mock("@lunarisapp/ui/components/tooltip", () => ({
  Tooltip: ({ children }) => children ?? null,
  TooltipContent: ({ children }) => children ?? null,
  TooltipTrigger: ({ children }) => children ?? null,
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  AiChat02Icon: {},
  Home07Icon: {},
  HugeiconsIcon: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) => key,
  }),
}));

vi.mock("react-router", () => ({
  Link: ({ children }) => children ?? null,
  useLocation: vi.fn(),
  useNavigate: vi.fn(),
  useParams: vi.fn(),
}));

vi.mock("@repo/features/auth/use-logout", () => ({
  useLogout: () => vi.fn(),
}));

vi.mock("./workspace-deep-link", () => ({
  getWorkspacePath: (organizationSlug, workspaceSlug, viewId) =>
    viewId
      ? `/${organizationSlug}/${workspaceSlug}/${viewId}`
      : `/${organizationSlug}/${workspaceSlug}`,
  getWorkspaceSubviewPath: (
    organizationSlug,
    workspaceSlug,
    resourceId,
    subviewPath,
    subviewId
  ) =>
    `/${organizationSlug}/${workspaceSlug}/${resourceId}/${subviewPath}/${subviewId}`,
  resolveWorkspaceView: vi.fn(),
}));

vi.mock("./workspace-runtime", () => ({
  useWorkspaceRuntimeController: vi.fn(),
}));

vi.mock("./workspace-panel-window", () => ({
  moveWorkspacePanelToWindow: vi.fn(),
  openWorkspacePanelInNewWindow: openWorkspacePanelInNewWindowMock,
}));

import { type Panel, useGridLayoutStore } from "@repo/workspaces/grid-layout";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import { useWorkspaceResourcesMap } from "@repo/workspaces/workspace-explorer";
import {
  useOrganizationNavigation,
  OrganizationNavigationProvider,
} from "@repo/workspaces/organization-navigation";
import { useLocation, useNavigate, useParams } from "react-router";
import { resolveWorkspaceView } from "./workspace-deep-link";
import { startResourceOpen } from "../extensions/host";
import {
  DesktopWorkspaceShell,
  filterPanelWindowSession,
  useDesktopWorkspaceBoot,
} from "./workspace-desktop-shell";
import {
  getPathForActiveDesktopPanel,
  resolvePendingDesktopRoute,
} from "./workspace-desktop-shell-utils";

function createBootOptions(overrides = {}) {
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
  const options = {
    addGroup: vi.fn(),
    addPanel: vi.fn(),
    allExtensionIds: ["lunaris.rich-text"],

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
    i18n: { language: "en" },
    loadPlugin: loadPluginMock,
    markReady: vi.fn(),
    panelWindowSession: null,
    workspaceId: "workspace_1",
    registerRenderers: vi.fn(),
    registerRuntimeReconciler: vi.fn(() => () => undefined),
    unregisterRenderer: vi.fn(),
    reportBootError: vi.fn(),
    setKnownPluginIds: vi.fn(),
    shouldOpenInitialEmptyPanel: true,
    t: (key) => key,
    unloadPlugin: vi.fn(),
    yjsStorageService: { create: vi.fn(), delete: vi.fn(), exists: vi.fn() },
    ...overrides,
  };
  return {
    ...options,
    runtimeTarget:
      "runtimeTarget" in overrides
        ? overrides.runtimeTarget
        : {
            enabledExtensionIds: options.enabledPluginIds,
            extensionAvailability: Object.fromEntries(
              options.enabledPluginIds.map((id) => [id, "available"])
            ),
            runtimeRevisions: Object.fromEntries(
              options.enabledPluginIds.map((id) => [id, "current"])
            ),
          },
  };
}

function BootRerenderHarness({ options, onReady }) {
  const [, setBootState] = useState("loading");
  const markReady = useCallback(() => {
    onReady?.();
    setBootState("ready");
  }, [onReady]);

  useDesktopWorkspaceBoot({
    ...options,
    markReady,
  });

  return null;
}

function BootHarness({ options }) {
  useDesktopWorkspaceBoot(options);
  return null;
}

describe("filterPanelWindowSession", () => {
  const pluginSession = {
    descriptor: {
      extensionId: "lunaris.restricted",
      title: "Restricted plugin",
      viewId: "lunaris.restricted",
    },
    windowId: "plugin-window",
  };

  it("removes a persisted plugin panel when its plugin is unavailable", () => {
    expect(
      filterPanelWindowSession(pluginSession, ["lunaris.rich-text"])
    ).toEqual({
      descriptor: null,
      windowId: "plugin-window",
    });
  });

  it("restores legacy Agent Work windows without an installed extension", () => {
    const session = {
      windowId: "agent-window",
      descriptor: {
        extensionId: "lunaris.ai-chat",
        viewId: "lunaris.ai-chat",
        title: "Assistant",
      },
    };
    expect(filterPanelWindowSession(session, [])).toMatchObject({
      windowId: "agent-window",
      descriptor: {
        extensionId: "system-agent-work",
        viewId: "agent-work",
        title: "Agent Work",
      },
    });
  });

  it("keeps a persisted plugin panel when its plugin remains available", () => {
    expect(
      filterPanelWindowSession(pluginSession, [
        "lunaris.rich-text",
        "lunaris.restricted",
      ])
    ).toBe(pluginSession);
  });
});

describe("getPathForActiveDesktopPanel", () => {
  it("tracks queued path replacements before React location catches up", () => {
    const taskLocation = {
      pathname: "/ws-abc/novel/item_board/task/task_1",
      search: "",
    };
    const boardLocation = resolvePendingDesktopRoute(
      taskLocation,
      "/ws-abc/novel/item_board",
      ""
    );

    expect(boardLocation).not.toBeNull();
    expect(
      resolvePendingDesktopRoute(
        boardLocation!,
        "/ws-abc/novel/item_board/task/task_1",
        ""
      )
    ).toEqual(taskLocation);
  });

  it("maps an item-panel viewId to the canonical workspace view path", () => {
    expect(
      getPathForActiveDesktopPanel("ws-abc", "novel", {
        params: { viewId: "item_abc", resourceId: "item_abc" },
      })
    ).toBe("/ws-abc/novel/item_abc");
  });

  it("maps a tool-panel viewId to the canonical workspace view path", () => {
    expect(
      getPathForActiveDesktopPanel("ws-abc", "novel", {
        params: { viewId: "debugger", toolId: "debugger" },
      })
    ).toBe("/ws-abc/novel/debugger");
  });

  it("maps a routed plugin subview to its nested canonical path", () => {
    expect(
      getPathForActiveDesktopPanel("ws-abc", "novel", {
        params: {
          routeItemId: "item_board",
          routePath: "task",
          routeSubviewId: "task_1",
          viewId: "plugin-subview:item_board:task:task_1",
        },
      })
    ).toBe("/ws-abc/novel/item_board/task/task_1");
  });

  it("falls back to the workspace root when no active panel is present", () => {
    expect(getPathForActiveDesktopPanel("ws-abc", "novel", null)).toBe(
      "/ws-abc/novel"
    );
  });

  it("falls back to the workspace root when the active panel has no viewId (chrome)", () => {
    expect(
      getPathForActiveDesktopPanel("ws-abc", "novel", { params: {} })
    ).toBe("/ws-abc/novel");
  });

  it("uses routeViewId for contextual right dock panels", () => {
    expect(
      getPathForActiveDesktopPanel("ws-abc", "novel", {
        params: { routeViewId: "item_abc" },
      })
    ).toBe("/ws-abc/novel/item_abc");
  });

  it("uses the fallback main panel when the active panel is non-routable chrome", () => {
    expect(
      getPathForActiveDesktopPanel(
        "ws-abc",
        "novel",
        { params: {} },
        { params: { viewId: "item_abc", resourceId: "item_abc" } }
      )
    ).toBe("/ws-abc/novel/item_abc");
  });

  it("uses a routed plugin subview from the fallback main panel", () => {
    expect(
      getPathForActiveDesktopPanel(
        "ws-abc",
        "novel",
        { params: {} },
        {
          params: {
            routeItemId: "item_board",
            routePath: "task",
            routeSubviewId: "task_1",
          },
        }
      )
    ).toBe("/ws-abc/novel/item_board/task/task_1");
  });

  it("falls back to workspace root when neither active nor fallback panel is routable", () => {
    expect(
      getPathForActiveDesktopPanel(
        "ws-abc",
        "novel",
        { params: {} },
        { params: {} }
      )
    ).toBe("/ws-abc/novel");
  });
});

describe("useDesktopWorkspaceBoot", () => {
  it("loads and activates multiple extensions", async () => {
    const base = createBootOptions();
    const options = createBootOptions({
      enabledPluginIds: ["lunaris.rich-text", "lunaris.sheet"],
      extensionManifests: {
        ...base.extensionManifests,
        "lunaris.sheet": {
          ...base.extensionManifests["lunaris.rich-text"],
          id: "lunaris.sheet",
          name: "Sheet",
        },
      },
      extensionMetadata: {
        ...base.extensionMetadata,
        "lunaris.sheet": { icon: {}, id: "lunaris.sheet", version: "1.0.0" },
      },
    });

    render(React.createElement(BootHarness, { options }));

    await waitFor(() => expect(initializePluginsMock).toHaveBeenCalledOnce());
    expect(initializePluginsMock.mock.calls[0]?.[0]).toHaveLength(2);
    expect(loadPluginMock).toHaveBeenCalledTimes(2);
    expect(reloadPluginMock).not.toHaveBeenCalled();
  });

  it("seeds the default main group with an empty launcher panel", async () => {
    const options = createBootOptions();

    render(React.createElement(BootHarness, { options }));

    await waitFor(() => expect(initializePluginsMock).toHaveBeenCalledOnce());
    expect(options.addPanel).toHaveBeenCalledWith({
      params: { __lunarisInitialEmptyPanel: true },
      pluginId: "grid-layout",
      position: { direction: "within", referenceGroup: "main" },
      renderer: "empty-panel",
      title: "gridLayout.emptyPanel.title",
    });
    expect(options.registerRenderers).toHaveBeenCalledWith(
      "system-agent-work",
      "agent-work",
      expect.any(Function)
    );
    expect(options.registerRenderers).toHaveBeenCalledWith(
      "system-workspace-settings",
      "panel",
      expect.any(Function)
    );
  });

  it("adds extensions and settings to the explorer footer", () => {
    const options = createBootOptions();

    render(React.createElement(BootHarness, { options }));

    const renderExplorer = options.registerRenderers.mock.calls.find(
      ([pluginId]) => pluginId === "workspace-explorer"
    )?.[2];
    expect(renderExplorer).toBeTypeOf("function");

    render(renderExplorer?.());

    const explorer = screen.getByTestId("workspace-explorer-tree");
    expect(
      Array.from(explorer.children).map((element) =>
        element.getAttribute("data-testid")
      )
    ).toEqual(["extensions-trigger", "workspace-settings-trigger"]);
  });

  it("does not seed an empty launcher for a routed plugin subview", async () => {
    const options = createBootOptions({
      shouldOpenInitialEmptyPanel: false,
    });

    render(React.createElement(BootHarness, { options }));

    await waitFor(() => expect(initializePluginsMock).toHaveBeenCalledOnce());
    expect(options.addPanel).not.toHaveBeenCalledWith(
      expect.objectContaining({ renderer: "empty-panel" })
    );
  });

  it("does not tear down and reinitialize plugins after markReady rerenders the shell", async () => {
    const onReady = vi.fn();
    const options = createBootOptions();

    const view = render(
      React.createElement(BootRerenderHarness, { onReady, options })
    );

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledTimes(1);
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    expect(cleanupPluginsMock).not.toHaveBeenCalled();

    view.unmount();

    expect(cleanupPluginsMock).toHaveBeenCalledTimes(1);
    expect(cleanupPluginsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        manifest: expect.objectContaining({ id: "lunaris.rich-text" }),
      }),
    ]);
  });

  it("boots known workspace extensions without a registry readiness gate", async () => {
    const options = createBootOptions();
    render(React.createElement(BootHarness, { options }));

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledTimes(1);
    });
  });

  it("reconciles enabled IDs without tearing down active plugins", async () => {
    const firstOptions = createBootOptions({
      enabledPluginIds: ["lunaris.rich-text"],
    });
    const secondOptions = createBootOptions({
      ...firstOptions,
      enabledPluginIds: ["lunaris.sheet"],
      extensionManifests: {
        ...firstOptions.extensionManifests,
        "lunaris.sheet": {
          ...firstOptions.extensionManifests["lunaris.rich-text"],
          id: "lunaris.sheet",
          name: "Sheet",
        },
      },
      extensionMetadata: {
        ...firstOptions.extensionMetadata,
        "lunaris.sheet": { icon: {}, id: "lunaris.sheet", version: "1.0.0" },
      },
      runtimeTarget: {
        enabledExtensionIds: ["lunaris.sheet"],
        extensionAvailability: { "lunaris.sheet": "available" },
        runtimeRevisions: { "lunaris.sheet": "current" },
      },
    });

    render(React.createElement(BootHarness, { options: firstOptions }));

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledTimes(1);
    });

    const reconcile = firstOptions.registerRuntimeReconciler.mock.calls[0]?.[0];
    await reconcile(secondOptions.runtimeTarget);

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledTimes(2);
    });

    expect(disablePluginMock).toHaveBeenCalledWith(
      "lunaris.rich-text",
      expect.any(Function)
    );
    expect(cleanupPluginsMock).not.toHaveBeenCalled();
    expect(
      firstOptions.addPanel.mock.calls.filter(
        ([panel]) => panel.renderer === "empty-panel"
      )
    ).toHaveLength(1);
  });

  it("loads and enables a plugin", async () => {
    const runtimePlugin = {
      manifest: { id: "lunaris.sheet" },
      contributions: [],
    };
    reloadPluginMock.mockResolvedValue({
      pluginId: runtimePlugin.manifest.id,
      success: true,
    });
    const options = createBootOptions({
      extensionManifests: {
        "lunaris.rich-text":
          createBootOptions().extensionManifests["lunaris.rich-text"],
        "lunaris.sheet": {
          description: "Sheet",
          developer: "Lunaris",
          id: "lunaris.sheet",
          contributions: [],
          name: "Sheet",
          api: "^0.9.0",
          permissions: [],
          version: "1.0.0",
        },
      },
      extensionMetadata: {
        "lunaris.rich-text":
          createBootOptions().extensionMetadata["lunaris.rich-text"],
        "lunaris.sheet": { icon: {}, id: "lunaris.sheet", version: "1.0.0" },
      },
    });

    const view = render(React.createElement(BootHarness, { options }));

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledTimes(1);
    });
    loadPluginMock.mockResolvedValue({
      id: runtimePlugin.manifest.id,
      plugin: runtimePlugin,
    });
    initializePluginsMock.mockResolvedValue([
      { pluginId: runtimePlugin.manifest.id, success: true },
    ]);

    const reconcile = options.registerRuntimeReconciler.mock.calls[0]?.[0];
    await reconcile({
      enabledExtensionIds: ["lunaris.rich-text", "lunaris.sheet"],
      extensionAvailability: {
        "lunaris.rich-text": "available",
        "lunaris.sheet": "available",
      },
      runtimeRevisions: {
        "lunaris.rich-text": "current",
        "lunaris.sheet": "sheet-v1",
      },
    });

    expect(loadPluginMock).toHaveBeenCalledWith("lunaris.sheet");
    expect(reloadPluginMock).not.toHaveBeenCalled();
    expect(cleanupPluginsMock).not.toHaveBeenCalled();

    view.unmount();

    expect(cleanupPluginsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        manifest: expect.objectContaining({ id: "lunaris.rich-text" }),
      }),
      expect.objectContaining({
        manifest: expect.objectContaining({ id: "lunaris.sheet" }),
      }),
    ]);
  });

  it("throws when dormant plugin initialization fails", async () => {
    const runtimePlugin = {
      manifest: { id: "lunaris.sheet" },
      contributions: [],
    };
    const initError = new Error("init failed");
    loadPluginMock.mockResolvedValue({
      id: runtimePlugin.manifest.id,
      plugin: runtimePlugin,
    });
    const base = createBootOptions();
    const options = createBootOptions({
      extensionManifests: {
        ...base.extensionManifests,
        "lunaris.sheet": {
          ...base.extensionManifests["lunaris.rich-text"],
          id: "lunaris.sheet",
          name: "Sheet",
        },
      },
      extensionMetadata: {
        ...base.extensionMetadata,
        "lunaris.sheet": { icon: {}, id: "lunaris.sheet", version: "1.0.0" },
      },
    });
    initializePluginsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        error: initError,
        pluginId: runtimePlugin.manifest.id,
        success: false,
      },
    ]);

    render(React.createElement(BootHarness, { options }));

    await waitFor(() => {
      expect(initializePluginsMock).toHaveBeenCalledTimes(1);
    });

    const reconcile = options.registerRuntimeReconciler.mock.calls[0]?.[0];
    const errors = await reconcile({
      enabledExtensionIds: ["lunaris.rich-text", "lunaris.sheet"],
      extensionAvailability: {
        "lunaris.rich-text": "available",
        "lunaris.sheet": "available",
      },
      runtimeRevisions: {
        "lunaris.rich-text": "current",
        "lunaris.sheet": "sheet-v1",
      },
    });
    expect(errors["lunaris.sheet"]).toBe(initError);
  });
});

function mockDesktopShellEnv() {
  vi.mocked(useCurrentWorkspace).mockReturnValue({
    workspace: {
      id: "workspace_1",
      name: "Workspace One",
      organization_id: "org_1",
      slug: "novel",
    },
    workspaceId: "workspace_1",
    workspaceVisibility: "private",
  });
  vi.mocked(useWorkspaceResourcesMap).mockReturnValue(new Map());
  vi.mocked(useOrganizationNavigation).mockReturnValue({
    openResource: vi.fn(),
    openView: vi.fn(),
    openViewInNewWindow: vi.fn(async () => true),
    openTool: vi.fn(),
  });
  vi.mocked(useLocation).mockReturnValue({
    pathname: "/ws-abc/novel",
    search: "",
  });
  vi.mocked(useNavigate).mockReturnValue(vi.fn());
  vi.mocked(useParams).mockReturnValue({
    organizationSlug: "ws-abc",
    workspaceSlug: "novel",
    viewId: undefined,
  });
  vi.mocked(resolveWorkspaceView).mockReturnValue({ kind: "none" });

  const gridState = {
    activePanelId: null as string | null,
    addGroup: vi.fn(),
    addPanel: vi.fn(),
    clearRenamingResource: vi.fn(),
    componentRenderers: {
      "lunaris.kanban.lunaris.kanban.task": vi.fn(),
    },
    dockviewApi: null,
    isFocusMode: false,
    openResourcePanel: vi.fn(),
    openPluginPanel: vi.fn(),
    openToolPanel: vi.fn(),
    panels: [] as Panel[],
    register: vi.fn(),
    removeGroup: vi.fn(),
    removePanel: vi.fn(),
    removePanelsByResourceIds: vi.fn(),
    removePanelsByViewIds: vi.fn(),
    renamingResourceId: null,
    requestRenameActiveResource: vi.fn(),
    resolvePanelRenderer: vi.fn(),
    setDockviewApi: vi.fn(),
    setKnownPluginIds: vi.fn(),
    unregisterByPlugin: vi.fn(),
    updatePanelTitleByResourceId: vi.fn(),
    updatePanelTitleByViewId: vi.fn(),
  };

  vi.mocked(useGridLayoutStore).mockImplementation((selector) =>
    selector(gridState)
  );

  return gridState;
}

function createDesktopController() {
  return {
    bootError: null,
    bootState: "ready" as const,

    createDataStorageService: vi.fn(),

    createWorkspaceDataService: vi.fn(),

    markReady: vi.fn(),
    enabledPluginIds: null,
    workspaceId: "workspace_1",
    reportBootError: vi.fn(),
    retryBoot: vi.fn(),
    retryKey: 0,
    yjsStorageService: {
      create: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
    },
  };
}

describe("DesktopWorkspaceShell", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows dockview while extension boot is loading", () => {
    const gridState = mockDesktopShellEnv();

    render(
      <DesktopWorkspaceShell
        controller={{
          bootError: null,
          bootState: "loading",

          createDataStorageService: vi.fn(),

          createWorkspaceDataService: vi.fn(),

          markReady: vi.fn(),
          enabledPluginIds: null,
          workspaceId: "workspace_1",
          reportBootError: vi.fn(),
          retryBoot: vi.fn(),
          retryKey: 0,
          yjsStorageService: {
            create: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn(),
          },
        }}
      />
    );

    expect(screen.getByTestId("grid-layout-view")).not.toBeNull();
    expect(gridState.register).toHaveBeenCalledWith(
      "workspace-explorer",
      "tree",
      expect.any(Function)
    );
    expect(gridState.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "workspace-explorer",
        renderer: "tree",
      })
    );
    expect(screen.queryByTestId("desktop-workspace-loading-shell")).toBeNull();
    expect(screen.queryByTestId("workspace-explorer-button")).toBeNull();
    expect(screen.getByTestId("search-provider").dataset.indexingReady).toBe(
      "false"
    );
  });

  it("opens routed resources before extension boot completes", async () => {
    mockDesktopShellEnv();
    const openResource = vi.fn();
    vi.mocked(useOrganizationNavigation).mockReturnValue({
      openResource,
      openView: vi.fn(),
      openViewInNewWindow: vi.fn(async () => true),
      openTool: vi.fn(),
    });
    vi.mocked(useParams).mockReturnValue({
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "res_1",
    });
    vi.mocked(resolveWorkspaceView).mockReturnValue({
      kind: "resource",
      resourceId: "res_1",
      resourceTypeId: "lunaris.rich-text",
      parentId: null,
      schemaVersion: 1,
      title: "Spec",
    });

    render(
      <DesktopWorkspaceShell
        controller={{
          ...createDesktopController(),
          bootState: "loading",
        }}
      />
    );

    await waitFor(() => {
      expect(openResource).toHaveBeenCalledWith({
        openKind: "deep_link",
        parentId: null,
        resourceId: "res_1",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        title: "Spec",
      });
    });
  });

  it("starts document timing from native Dockview activation", () => {
    const gridState = mockDesktopShellEnv();
    const onDidActivePanelChange = vi.fn(
      (
        _listener: (event: {
          panel: { id: string; params: Record<string, string> };
        }) => void
      ) => ({ dispose: vi.fn() })
    );
    const panel = {
      id: "doc-panel",
      params: {
        resourceId: "native-document",
        resourceTypeId: "lunaris.rich-text",
        viewId: "native-document",
      },
    };
    Object.assign(gridState, {
      dockviewApi: {
        activePanel: panel,
        getGroup: () => ({ activePanel: panel }),
        onDidActivePanelChange,
        onDidRemovePanel: vi.fn(() => ({ dispose: vi.fn() })),
      },
    });
    render(<DesktopWorkspaceShell controller={createDesktopController()} />);
    vi.mocked(startResourceOpen).mockClear();
    const onActivate = onDidActivePanelChange.mock.calls[0]?.[0];
    expect(onActivate).toBeDefined();
    act(() => onActivate!({ panel }));
    expect(startResourceOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "native-document",
        openKind: "unloaded",
      })
    );
  });

  it.each(["res_1", "res_1::subview"])(
    "suppresses route echoes only for the resource view (%s)",
    (activeViewId) => {
      const gridState = mockDesktopShellEnv();
      const openResource = vi.fn();
      vi.mocked(useOrganizationNavigation).mockReturnValue({
        openResource,
        openView: vi.fn(),
        openViewInNewWindow: vi.fn(async () => true),
        openTool: vi.fn(),
      });
      vi.mocked(useParams).mockReturnValue({
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "res_1",
      });
      vi.mocked(resolveWorkspaceView).mockReturnValue({
        kind: "resource",
        resourceId: "res_1",
        resourceTypeId: "lunaris.rich-text",
        parentId: null,
        schemaVersion: 1,
        title: "Spec",
      });
      Object.assign(gridState, {
        dockviewApi: {
          activePanel: {
            params: { resourceId: "res_1", viewId: activeViewId },
          },
          onDidActivePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
          onDidRemovePanel: vi.fn(() => ({ dispose: vi.fn() })),
        },
      });
      render(<DesktopWorkspaceShell controller={createDesktopController()} />);
      if (activeViewId === "res_1") {
        expect(openResource).not.toHaveBeenCalled();
      } else {
        expect(openResource).toHaveBeenCalledWith(
          expect.objectContaining({ resourceId: "res_1" })
        );
      }
    }
  );

  it("shows editor navigation without a workspace picker once boot is ready", () => {
    mockDesktopShellEnv();

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    expect(screen.getByTestId("workspace-explorer-button")).not.toBeNull();
    expect(screen.queryByTestId("workspace-selector")).toBeNull();
    expect(screen.getByTestId("search-provider").dataset.indexingReady).toBe(
      "true"
    );
  });

  it("places app controls in the app bar and workspace status in the status bar", () => {
    mockDesktopShellEnv();

    const AppBarLeading = () => (
      <>
        <span data-testid="app-logo" />
        <nav data-testid="app-navigation" />
      </>
    );
    const AppBarTrailing = () => (
      <>
        <button data-testid="help-trigger" type="button" />
        <button data-testid="user-menu-trigger" type="button" />
      </>
    );
    render(
      <DesktopWorkspaceShell
        AppBarLeading={AppBarLeading}
        AppBarTrailing={AppBarTrailing}
        controller={createDesktopController()}
      />
    );

    const middle = screen.getByTestId("appbar-middle");
    const searchTrigger = screen.getByTestId("search-trigger");
    const updateTrigger = screen.getByTestId("app-update-trigger");
    const searchAnchor = searchTrigger.parentElement;
    expect(middle.contains(searchAnchor)).toBe(true);
    expect(searchAnchor?.className).toContain("relative");
    expect(searchAnchor?.contains(updateTrigger)).toBe(true);
    expect(updateTrigger.parentElement?.className).toContain("start-full");
    expect(searchTrigger.dataset.workspaceName).toBe("Workspace One");
    const leading = screen.getByTestId("appbar-leading");
    expect(
      Array.from(leading.children).map((element) =>
        element.getAttribute("data-testid")
      )
    ).toEqual(["app-logo", "app-navigation"]);

    const statusbarLeading = screen.getByTestId("statusbar-leading");
    expect(
      Array.from(statusbarLeading.children).map((element) =>
        element.getAttribute("data-testid")
      )
    ).toEqual(["workspace-explorer-button", "sync-status"]);

    const trailing = screen.getByTestId("appbar-trailing");
    expect(
      Array.from(trailing.children).map((element) =>
        element.getAttribute("data-testid")
      )
    ).toEqual(["help-trigger", "user-menu-trigger"]);
  });

  it("provides workspace explorer data to content status bars", () => {
    mockDesktopShellEnv();

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    expect(
      screen
        .getByTestId("workspace-explorer-provider")
        .contains(screen.getByTestId("active-content-statusbar"))
    ).toBe(true);
  });

  it("resolves a resource panel opened before its extension finished loading", async () => {
    const gridState = mockDesktopShellEnv();
    gridState.panels = [
      {
        id: "pending-task-panel",
        isUnloaded: false,
        lastActiveAt: 1,
        params: {
          pluginId: "lunaris.kanban.task",
          resourceTypeId: "lunaris.kanban.task",
          viewId: "task-1",
        },
        pluginId: "lunaris.kanban.task",
        renderer: "resource",
        title: "Draft release notes",
      },
    ];

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() =>
      expect(gridState.resolvePanelRenderer).toHaveBeenCalledWith(
        "pending-task-panel",
        "lunaris.kanban",
        "lunaris.kanban.task"
      )
    );
  });

  it("opens a plugin panel in a new window without changing this organization", async () => {
    const gridState = mockDesktopShellEnv();

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() =>
      expect(vi.mocked(OrganizationNavigationProvider)).toHaveBeenCalled()
    );
    const navigation = vi.mocked(OrganizationNavigationProvider).mock
      .lastCall?.[0].navigation;
    const input = {
      params: {
        resourceId: "board-1",
        taskId: "task-1",
      },
      extensionId: "lunaris.kanban",
      viewInstanceId: "plugin-subview:board-1:task:task-1",
      route: {
        resourceId: "board-1",
        path: "task",
        subviewId: "task-1",
      },
      sourceResourceId: "board-1",
      title: "Draft release notes",
      viewId: "task-detail",
    };
    const addPanelCallCount = gridState.addPanel.mock.calls.length;

    await expect(navigation?.openViewInNewWindow(input)).resolves.toBe(true);

    expect(openWorkspacePanelInNewWindowMock).toHaveBeenCalledWith({
      descriptor: {
        extensionId: "lunaris.kanban",
        params: {
          resourceId: "board-1",
          extensionId: "lunaris.kanban",
          routeItemId: "board-1",
          routePath: "task",
          routeSubviewId: "task-1",
          taskId: "task-1",
          viewId: "plugin-subview:board-1:task:task-1",
        },
        title: "Draft release notes",
        viewId: "task-detail",
      },
      errorMessage: "gridLayout.tab.openInNewWindowError",
      manager: undefined,
      workspacePath: "/ws-abc/novel",
    });
    expect(gridState.addPanel).toHaveBeenCalledTimes(addPanelCallCount);
  });

  it("opens a normal content item in a new window without opening a tab", async () => {
    const gridState = mockDesktopShellEnv();

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() =>
      expect(vi.mocked(OrganizationNavigationProvider)).toHaveBeenCalled()
    );
    const navigation = vi.mocked(OrganizationNavigationProvider).mock
      .lastCall?.[0].navigation;
    const addPanelCallCount = gridState.addPanel.mock.calls.length;

    await expect(
      navigation?.openResourceInNewWindow({
        parentId: null,
        resourceId: "task-1",
        resourceTypeId: "lunaris.kanban.task",
        schemaVersion: 1,
        title: "Draft release notes",
      })
    ).resolves.toBe(true);

    expect(openWorkspacePanelInNewWindowMock).toHaveBeenCalledWith({
      descriptor: {
        extensionId: "lunaris.kanban",
        params: {
          parentId: null,
          resourceId: "task-1",
          resourceTypeId: "lunaris.kanban.task",
          schemaVersion: 1,
          viewId: "task-1",
        },
        title: "Draft release notes",
        viewId: "lunaris.kanban.task",
      },
      errorMessage: "gridLayout.tab.openInNewWindowError",
      manager: undefined,
      workspacePath: "/ws-abc/novel/task-1",
    });
    expect(gridState.addPanel).toHaveBeenCalledTimes(addPanelCallCount);
  });

  it("replaces the active content item when requested", async () => {
    const gridState = mockDesktopShellEnv();
    gridState.activePanelId = "task-panel";
    gridState.panels = [
      {
        id: "task-panel",
        isUnloaded: false,
        lastActiveAt: 1,
        params: { resourceId: "task-1", viewId: "task-1" },
        pluginId: "lunaris.kanban.task",
        renderer: "content",
        title: "Draft release notes",
      },
    ];

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() =>
      expect(vi.mocked(OrganizationNavigationProvider)).toHaveBeenCalled()
    );
    const navigation = vi.mocked(OrganizationNavigationProvider).mock
      .lastCall?.[0].navigation;
    gridState.addPanel.mockClear();

    navigation?.openResource({
      parentId: null,
      resourceId: "board-1",
      resourceTypeId: "lunaris.kanban",
      schemaVersion: 1,
      replaceCurrent: true,
      title: "Roadmap",
    });

    expect(gridState.openResourcePanel).toHaveBeenCalledWith({
      extensionId: "lunaris.kanban",
      parentId: null,
      resourceId: "board-1",
      resourceTypeId: "lunaris.kanban",
      schemaVersion: 1,
      target: undefined,
      title: "Roadmap",
      viewId: "lunaris.kanban",
    });
    expect(gridState.removePanelsByViewIds).toHaveBeenCalledWith(["task-1"]);
    expect(gridState.addPanel).not.toHaveBeenCalled();
  });

  it("keeps error state instead of loading shell when boot fails", () => {
    mockDesktopShellEnv();

    render(
      <DesktopWorkspaceShell
        controller={{
          bootError: "boom",
          bootState: "error",

          createDataStorageService: vi.fn(),

          createWorkspaceDataService: vi.fn(),

          markReady: vi.fn(),
          enabledPluginIds: null,
          workspaceId: "workspace_1",
          reportBootError: vi.fn(),
          retryBoot: vi.fn(),
          retryKey: 0,
          yjsStorageService: {
            create: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn(),
          },
        }}
      />
    );

    expect(document.body.textContent).toContain("Workspace failed to load");
    expect(document.body.textContent).toContain("boom");
    expect(
      document.querySelector('[data-testid="desktop-workspace-loading-shell"]')
    ).toBeNull();
  });

  it("persists null when active panel descriptor is invalid", async () => {
    const session = {
      descriptor: null,
      windowId: "panel-1",
    };
    readPanelWindowSessionMock.mockReturnValue(session);
    const gridState = mockDesktopShellEnv();
    gridState.activePanelId = "active-panel";
    gridState.panels = [
      {
        id: "active-panel",
        isUnloaded: false,
        lastActiveAt: 1,
        params: { invalid: undefined } as unknown as Panel["params"],
        pluginId: "plugin",
        renderer: "content",
        title: "Private title",
      },
    ];
    const serializationError = new Error("invalid panel params");
    panelWindowDescriptorFromPanelMock.mockImplementation(() => {
      throw serializationError;
    });

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() => {
      expect(persistPanelWindowDescriptorMock).toHaveBeenCalledWith(
        session,
        null
      );
    });
    expect(logWarnMock).toHaveBeenCalledWith({
      action: "panel_window.descriptor.serialize",
      outcome: "failure",
      error: serializationError,
      panel: {
        pluginId: "plugin",
        renderer: "content",
      },
    });
  });

  it("contains session storage failures in descriptor persistence", async () => {
    const session = {
      descriptor: null,
      windowId: "panel-1",
    };
    readPanelWindowSessionMock.mockReturnValue(session);
    const gridState = mockDesktopShellEnv();
    gridState.activePanelId = "active-panel";
    gridState.panels = [
      {
        id: "active-panel",
        isUnloaded: false,
        lastActiveAt: 1,
        params: {},
        pluginId: "plugin",
        renderer: "content",
        title: "Document",
      },
    ];
    const storageError = new Error("storage unavailable");
    persistPanelWindowDescriptorMock.mockImplementation(() => {
      throw storageError;
    });

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() => {
      expect(logErrorMock).toHaveBeenCalledWith({
        action: "panel_window.descriptor.persist",
        outcome: "failure",
        error: storageError,
      });
    });
  });

  it("keeps browser title on Lunaris for workspace root route", async () => {
    mockDesktopShellEnv();

    const { unmount } = render(
      <DesktopWorkspaceShell
        controller={{
          bootError: null,
          bootState: "ready",

          createDataStorageService: vi.fn(),

          createWorkspaceDataService: vi.fn(),

          markReady: vi.fn(),
          enabledPluginIds: null,
          workspaceId: "workspace_1",
          reportBootError: vi.fn(),
          retryBoot: vi.fn(),
          retryKey: 0,
          yjsStorageService: {
            create: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn(),
          },
        }}
      />
    );

    await waitFor(() => {
      expect(document.title).toBe("Lunaris");
    });

    unmount();

    expect(document.title).toBe("Lunaris");
  });

  it("sets browser title to item title for routed item views", async () => {
    mockDesktopShellEnv();
    vi.mocked(useParams).mockReturnValue({
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "item_1",
    });
    vi.mocked(resolveWorkspaceView).mockReturnValue({
      kind: "resource",
      resourceId: "item_1",
      pluginId: "lunaris.rich-text",
      title: "Spec",
    });

    render(
      <DesktopWorkspaceShell
        controller={{
          bootError: null,
          bootState: "ready",

          createDataStorageService: vi.fn(),

          createWorkspaceDataService: vi.fn(),

          markReady: vi.fn(),
          enabledPluginIds: null,
          workspaceId: "workspace_1",
          reportBootError: vi.fn(),
          retryBoot: vi.fn(),
          retryKey: 0,
          yjsStorageService: {
            create: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn(),
          },
        }}
      />
    );

    await waitFor(() => {
      expect(document.title).toBe("Spec");
    });
  });

  it("restores a routed plugin subview without opening its board", async () => {
    mockDesktopShellEnv();
    const openResource = vi.fn();
    const openView = vi.fn(() => true);
    vi.mocked(useOrganizationNavigation).mockReturnValue({
      openResource,
      openView,
      openViewInNewWindow: vi.fn(async () => true),
      openTool: vi.fn(),
    });
    vi.mocked(useParams).mockReturnValue({
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "item_board",
      subviewPath: "task",
      subviewId: "task_1",
    });
    vi.mocked(resolveWorkspaceView).mockReturnValue({
      kind: "plugin-subview",
      resourceId: "item_board",
      resourceTitle: "Roadmap",
      resourceTypeId: "lunaris.kanban",
      viewId: "task-detail",
      subviewId: "task_1",
      subviewPath: "task",
      title: "Task",
      viewInstanceId: "plugin-subview:item_board:task:task_1",
    });

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() => {
      expect(openView).toHaveBeenCalledWith({
        params: {
          resourceId: "item_board",
          subviewId: "task_1",
          viewInstanceId: "plugin-subview:item_board:task:task_1",
        },
        extensionId: "lunaris.kanban",
        viewInstanceId: "plugin-subview:item_board:task:task_1",
        route: {
          resourceId: "item_board",
          path: "task",
          subviewId: "task_1",
        },
        sourceResourceId: "item_board",
        title: "Task",
        viewId: "task-detail",
      });
    });
    expect(openResource).not.toHaveBeenCalled();
  });

  it("preserves an open task title without refocusing its board", async () => {
    const gridState = mockDesktopShellEnv();
    gridState.panels = [
      {
        id: "panel-board",
        isUnloaded: false,
        lastActiveAt: 1,
        params: { viewId: "item_board" },
        pluginId: "lunaris.kanban",
        renderer: "content",
        title: "Roadmap",
      },
      {
        id: "panel-task",
        isUnloaded: false,
        lastActiveAt: 2,
        params: { viewId: "plugin-subview:item_board:task:task_1" },
        pluginId: "lunaris.kanban",
        renderer: "task-detail",
        title: "Draft release notes",
      },
    ];
    const openResource = vi.fn();
    const openView = vi.fn(() => true);
    vi.mocked(useOrganizationNavigation).mockReturnValue({
      openResource,
      openView,
      openViewInNewWindow: vi.fn(async () => true),
      openTool: vi.fn(),
    });
    vi.mocked(useParams).mockReturnValue({
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "item_board",
      subviewPath: "task",
      subviewId: "task_1",
    });
    vi.mocked(resolveWorkspaceView).mockReturnValue({
      kind: "plugin-subview",
      resourceId: "item_board",
      resourceTitle: "Roadmap",
      resourceTypeId: "lunaris.kanban",
      viewId: "task-detail",
      subviewId: "task_1",
      subviewPath: "task",
      title: "Task",
      viewInstanceId: "plugin-subview:item_board:task:task_1",
    });

    render(<DesktopWorkspaceShell controller={createDesktopController()} />);

    await waitFor(() => expect(openView).toHaveBeenCalledOnce());
    expect(openView).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft release notes" })
    );
    expect(openResource).not.toHaveBeenCalled();
  });

  it("falls back to workspace name for routed tool views", async () => {
    mockDesktopShellEnv();
    vi.mocked(useParams).mockReturnValue({
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "debugger",
    });
    vi.mocked(resolveWorkspaceView).mockReturnValue({
      kind: "tool",
      tool: {
        toolId: "debugger",
        pluginId: "system-debugger",
        renderer: "panel",
        titleKey: "commands.debugger",
      },
    });

    render(
      <DesktopWorkspaceShell
        controller={{
          bootError: null,
          bootState: "ready",

          createDataStorageService: vi.fn(),

          createWorkspaceDataService: vi.fn(),

          markReady: vi.fn(),
          enabledPluginIds: null,
          workspaceId: "workspace_1",
          reportBootError: vi.fn(),
          retryBoot: vi.fn(),
          retryKey: 0,
          yjsStorageService: {
            create: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn(),
          },
        }}
      />
    );

    await waitFor(() => {
      expect(document.title).toBe("Workspace One");
    });
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  cleanupPluginsMock.mockReset();
  cleanupPluginsMock.mockResolvedValue(undefined);
  extensionsPanelMock.mockClear();
  initializePluginsMock.mockReset();
  initializePluginsMock.mockImplementation(async (plugins) =>
    plugins.map((plugin) => ({
      pluginId: plugin.manifest.id,
      success: true,
    }))
  );
  loadPluginMock.mockReset();
  loadPluginMock.mockImplementation(async (id: string) => ({
    plugin: {
      activate: () => undefined,
      manifest: {
        api: "^0.9.0",
        conflicts: {},
        contributions: [],
        dependencies: {},
        description: id,
        developer: "Lunaris",
        id,
        name: id,
        permissions: [],
        version: "1.0.0",
      },
    },
  }));
  panelWindowDescriptorFromPanelMock.mockReset();
  panelWindowDescriptorFromPanelMock.mockImplementation((panel: Panel) => ({
    params: panel.params,
    pluginId: panel.pluginId,
    renderer: panel.renderer,
    title: panel.title,
  }));
  persistPanelWindowDescriptorMock.mockReset();
  readPanelWindowSessionMock.mockReset();
  readPanelWindowSessionMock.mockReturnValue(null);
  reloadPluginMock.mockReset();
  reloadPluginMock.mockResolvedValue({ pluginId: "plugin", success: true });
});

vi.mock("../extensions/use-preload-resource-renderer", () => ({
  usePreloadResourceRenderer: vi.fn(),
  usePreloadRichTextRenderer: vi.fn(),
}));
