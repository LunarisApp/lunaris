import { AgentWorkLauncher } from "../features/agent-work/launcher";
import { AgentWorkPanel } from "../features/agent-work/panel";
import { AGENT_WORK_PANEL_ID, AGENT_WORK_RENDERER } from "../features/agent-work/constants";
import { migrateAgentWorkDescriptor } from "../features/agent-work/compatibility";
import {
  createPluginSubviewViewInstanceId,
  createViewInstanceId,
  useResourceTypes,
  useViews,
} from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import { Appbar } from "@repo/features/appbar";
import {
  DEBUGGER_PLUGIN_ID,
  DEBUGGER_RENDERER,
  DebuggerPanel,
  useDebuggerHotkey,
} from "@repo/workspaces/debugger";
import { ResourceViewLayout } from "@repo/workspaces/editor";
import {
  EXTENSIONS_PLUGIN_ID,
  EXTENSIONS_RENDERER,
  ExtensionsButton,
  ExtensionsPanel,
} from "@repo/workspaces/extensions";
import {
  type AddGroup,
  type AddPanel,
  createEmptyPanelDefinition,
  FocusModeOverlay,
  getRendererComponent,
  GridLayoutProvider,
  GridLayoutView,
  LEFT_GROUP_ID,
  MAIN_GROUP_ID,
  type Panel,
  type PanelWindowSession,
  panelWindowSearch,
  readPanelWindowSession,
  useFocusMode,
  useGridLayoutStore,
  useRenameActiveResource,
} from "@repo/workspaces/grid-layout";
import { WorkspaceLayout } from "@repo/workspaces/layouts";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import {
  WORKSPACE_EXPLORER_PLUGIN_ID,
  WORKSPACE_EXPLORER_RENDERER,
  WORKSPACE_TRASH_PLUGIN_ID,
  WORKSPACE_TRASH_RENDERER,
  WorkspaceExplorerButton,
  WorkspaceExplorerContainer,
  WorkspaceExplorerTree,
  WorkspaceTrashPanel,
  useNavigateToResource,
  useWorkspaceResourcesMap,
} from "@repo/workspaces/workspace-explorer";
import {
  WORKSPACE_SETTINGS_PLUGIN_ID,
  WORKSPACE_SETTINGS_RENDERER,
  WorkspaceSettingsButton,
  WorkspaceSettingsPanel,
} from "@repo/workspaces/workspace-settings";
import {
  SearchButton,
  SearchDialog,
  SearchProvider,
} from "@repo/workspaces/search";
import { ActiveResourceStatusBar, Statusbar } from "@repo/workspaces/statusbar";
import SyncStatusIndicator from "@repo/features/sync-status";
import {
  getTool,
  type OpenResourceInput,
  type OpenViewInput,
  type OpenToolInput,
  useOrganizationNavigation,
  OrganizationNavigationProvider,
  type OrganizationViewState,
} from "@repo/workspaces/organization-navigation";
import { usePlatform } from "@repo/platform";
import { log } from "evlog";
import {
  type ComponentType,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { AppUpdateButton } from "@repo/features/app-update";
import { BuildVersion } from "@repo/features/build-version";
import { ExtensionViewLaunchers } from "../components/extension-view-launchers";
import { SkipLink } from "../components/skip-link";
import {
  type InitializePluginsDeps,
  reportResourceOpenReady,
  usePluginRuntimeHost,
} from "../extensions/host";
import {
  type PluginRuntimeTarget,
  useOrganizationPluginRuntime,
} from "../extensions/organization-runtime";
import { usePreloadRichTextRenderer } from "../extensions/use-preload-resource-renderer";
import {
  prepareResourceOpen,
  trackResourceViewActivation,
} from "./resource-open-navigation";
import { isResourceViewReady } from "../extensions/host/resource-view-readiness";
import { useWorkspaceBrowserTitle } from "./workspace-browser-title";
import {
  getWorkspacePath,
  resolveWorkspaceView,
  type ViewResolution,
} from "./workspace-deep-link";
import { WorkspaceDesktopLoadingContent } from "./workspace-desktop-loading-shell";
import {
  getPathForActiveDesktopPanel,
  resolvePendingDesktopRoute,
} from "./workspace-desktop-shell-utils";
import {
  moveWorkspacePanelToWindow,
  openWorkspacePanelInNewWindow,
} from "./workspace-panel-window";
import {
  useAcknowledgePanelWindowTransfer,
  usePersistPanelWindowDescriptor,
} from "./workspace-panel-window-lifecycle";
import type { useWorkspaceRuntimeController } from "./workspace-runtime";

type WorkspaceRuntimeController = ReturnType<typeof useWorkspaceRuntimeController>;
const noopUnregisterPlugin = () => undefined;
const noopRegisterRuntimeReconciler = () => () => undefined;

export function filterPanelWindowSession(
  session: PanelWindowSession | null,
  allowedPluginIds: readonly string[],
): PanelWindowSession | null {
  if (session?.descriptor) {
    const descriptor = migrateAgentWorkDescriptor(session.descriptor);
    if (descriptor !== session.descriptor) session = { ...session, descriptor };
  }
  const pluginId = session?.descriptor?.extensionId;
  if (session && pluginId && pluginId !== AGENT_WORK_PANEL_ID && !allowedPluginIds.includes(pluginId)) {
    return { ...session, descriptor: null };
  }
  return session;
}

interface DesktopWorkspaceBootOptions {
  addGroup: (group: AddGroup) => unknown;
  addPanel: (panel: AddPanel) => unknown;
  allExtensionIds: readonly string[];
  enabledPluginIds: string[] | null;
  i18n: ReturnType<typeof useTranslation>["i18n"];
  loadPlugin: WorkspaceRuntimeController["loadPlugin"];
  markReady: () => void;
  panelWindowSession: PanelWindowSession | null;
  registerRenderers: InitializePluginsDeps["gridLayoutRegister"];
  registerRuntimeReconciler?: ReturnType<
    typeof useOrganizationPluginRuntime
  >["registerRuntimeReconciler"];
  reportBootError: (error: unknown) => void;
  runtimeTarget?: PluginRuntimeTarget;
  setKnownPluginIds: (pluginIds: string[]) => void;
  shouldOpenInitialEmptyPanel: boolean;
  t: ReturnType<typeof useTranslation>["t"];
  unloadPlugin: WorkspaceRuntimeController["unloadPlugin"];
  unregisterPlugin?: (pluginId: string) => void;
  unregisterRenderer: NonNullable<InitializePluginsDeps["gridLayoutUnregister"]>;
}

function ensureDesktopExplorerPanel({
  addGroup,
  addPanel,
  viewportWidth,
}: {
  addGroup: (group: AddGroup) => unknown;
  addPanel: (panel: AddPanel) => unknown;
  viewportWidth: number;
}) {
  addGroup({ id: MAIN_GROUP_ID, direction: "right" });

  const sideWidth = viewportWidth * 0.2;
  addGroup({
    id: LEFT_GROUP_ID,
    referenceGroup: MAIN_GROUP_ID,
    direction: "left",
    initialWidth: sideWidth,
    initialHeight: sideWidth,
    minimumWidth: viewportWidth * 0.1,
  });

  addPanel({
    pluginId: WORKSPACE_EXPLORER_PLUGIN_ID,
    renderer: WORKSPACE_EXPLORER_RENDERER,
    title: "",
    position: { referenceGroup: LEFT_GROUP_ID },
  });
}

export function useDesktopWorkspaceBoot({
  addGroup,
  addPanel,
  allExtensionIds,
  enabledPluginIds,
  i18n,
  loadPlugin,
  markReady,
  panelWindowSession,
  registerRenderers,
  unregisterRenderer,
  reportBootError,
  setKnownPluginIds,
  shouldOpenInitialEmptyPanel,
  t,
  unloadPlugin,
  unregisterPlugin = noopUnregisterPlugin,
  registerRuntimeReconciler = noopRegisterRuntimeReconciler,
  runtimeTarget = {
    enabledExtensionIds: enabledPluginIds ?? [],
    extensionAvailability: {},
    runtimeRevisions: Object.fromEntries(
      (enabledPluginIds ?? []).map((id) => [id, "current"]),
    ),
  },
}: DesktopWorkspaceBootOptions) {
  const { viewport } = usePlatform();
  const initializedRef = useRef(false);
  const layoutInitializedRef = useRef(false);
  const runtimeCleanupRef = useRef<(() => void) | null>(null);
  const {
    dispose: disposePlugins,
    reconcile: reconcilePlugins,
  } = usePluginRuntimeHost({
    resourceViewLayoutWrapper: ResourceViewLayout,
    i18n,
    loadPlugin,
    registerRenderers,
    unloadPlugin,
    unregisterPlugin,
    unregisterRenderer,
  });
  const runtimeTargetRef = useRef(runtimeTarget);
  runtimeTargetRef.current = runtimeTarget;

  useEffect(() => {
    setKnownPluginIds([...allExtensionIds]);
  }, [allExtensionIds, setKnownPluginIds]);

  useEffect(() => {
    if (layoutInitializedRef.current) return;
    layoutInitializedRef.current = true;
    registerRenderers(
      WORKSPACE_EXPLORER_PLUGIN_ID,
      WORKSPACE_EXPLORER_RENDERER,
      () => (
        <WorkspaceExplorerTree
          className="px-[calc(var(--dv-border-radius)/2)]"
          footerActions={
            <>
              <ExtensionsButton />
              <WorkspaceSettingsButton />
            </>
          }
        />
      )
    );
    registerRenderers(WORKSPACE_TRASH_PLUGIN_ID, WORKSPACE_TRASH_RENDERER, () => (
      <WorkspaceTrashPanel />
    ));
    registerRenderers(EXTENSIONS_PLUGIN_ID, EXTENSIONS_RENDERER, () => (
      <ExtensionsPanel />
    ));
    registerRenderers(AGENT_WORK_PANEL_ID, AGENT_WORK_RENDERER, () => <AgentWorkPanel />);
    registerRenderers(DEBUGGER_PLUGIN_ID, DEBUGGER_RENDERER, () => (
      <DebuggerPanel />
    ));
    registerRenderers(
      WORKSPACE_SETTINGS_PLUGIN_ID,
      WORKSPACE_SETTINGS_RENDERER,
      () => <WorkspaceSettingsPanel />,
    );
    // Normal shell starts with explorer. Panel windows start empty until
    // extension initialization makes their requested renderer available.
    if (panelWindowSession) {
      addGroup({ id: MAIN_GROUP_ID, direction: "right" });
    } else {
      ensureDesktopExplorerPanel({
        addGroup,
        addPanel: (panel) =>
          addPanel({
            ...panel,
            title: panel.title || t("explorer.title"),
          }),
        viewportWidth: viewport.width(),
      });
      if (shouldOpenInitialEmptyPanel) {
        addPanel(
          createEmptyPanelDefinition({
            groupId: MAIN_GROUP_ID,
            initial: true,
            title: t("gridLayout.emptyPanel.title"),
          })
        );
      }
    }
  }, [
    addGroup,
    addPanel,
    panelWindowSession,
    registerRenderers,
    shouldOpenInitialEmptyPanel,
    t,
    viewport,
  ]);

  useEffect(() => {
    if (!enabledPluginIds || initializedRef.current) return;

    initializedRef.current = true;
    let cancelled = false;

    // Boot pipeline
    //
    // Declarations register without executing extension implementations.
    reconcilePlugins(runtimeTargetRef.current)
      .then(() => {
        if (!cancelled) {
          const unregisterReconciler = registerRuntimeReconciler(reconcilePlugins);
          runtimeCleanupRef.current = unregisterReconciler;
          if (panelWindowSession?.descriptor) {
            addPanel({
              params: panelWindowSession.descriptor.params,
              pluginId: panelWindowSession.descriptor.extensionId,
              position: { referenceGroup: MAIN_GROUP_ID },
              renderer: panelWindowSession.descriptor.viewId,
              title: panelWindowSession.descriptor.title,
            });
          }
          markReady();
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          reportBootError(error);
        }
      });

    return () => {
      cancelled = true;
      runtimeCleanupRef.current?.();
      runtimeCleanupRef.current = null;
      disposePlugins();
      initializedRef.current = false;
    };
  }, [
    addGroup,
    addPanel,
    disposePlugins,
    enabledPluginIds,
    reconcilePlugins,
    markReady,
    panelWindowSession,
    registerRenderers,
    registerRuntimeReconciler,
    reportBootError,
    shouldOpenInitialEmptyPanel,
    t,
    viewport,
  ]);
}

function WorkspaceRuntimeStatus({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  if (!error) {
    return <WorkspaceDesktopLoadingContent />;
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-4 rounded-lg border bg-background p-6 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Workspace failed to load</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </div>
  );
}

function DesktopOrganizationNavigationBridge({
  children,
  panelWindowSession,
  routeSyncEnabled,
}: {
  children: ReactNode;
  panelWindowSession: PanelWindowSession | null;
  routeSyncEnabled: boolean;
}) {
  const { t } = useTranslation();
  const { panelWindows, viewport } = usePlatform();
  const location = useLocation();
  const navigate = useNavigate();
  // Hold location in a ref so the dockview listeners don't need it in their
  // dep arrays — otherwise every navigate() tears down and re-registers the
  // listeners, which is both wasteful and racy.
  const locationRef = useRef(location);
  locationRef.current = location;
  const { subviewId, subviewPath, viewId, organizationSlug, workspaceSlug } = useParams<{
    subviewId?: string;
    subviewPath?: string;
    viewId?: string;
    organizationSlug: string;
    workspaceSlug: string;
  }>();
  const addGroup = useGridLayoutStore((state) => state.addGroup);
  const addPanel = useGridLayoutStore((state) => state.addPanel);
  const clearRenamingResource = useGridLayoutStore(
    (state) => state.clearRenamingResource
  );
  const dockviewApi = useGridLayoutStore((state) => state.dockviewApi);
  const isFocusMode = useGridLayoutStore((state) => state.isFocusMode);
  const openResourcePanel = useGridLayoutStore((state) => state.openResourcePanel);
  const openPluginPanel = useGridLayoutStore((state) => state.openPluginPanel);
  const openToolPanel = useGridLayoutStore((state) => state.openToolPanel);
  const panels = useGridLayoutStore((state) => state.panels);
  const componentRenderers = useGridLayoutStore(
    (state) => state.componentRenderers
  );
  const resolvePanelRenderer = useGridLayoutStore(
    (state) => state.resolvePanelRenderer
  );
  const resourceTypes = useResourceTypes();
  const resourceViews = useViews();
  const resourceTypeMap = useMemo(
    () =>
      new Map(
        resourceTypes.map((resourceType) => [
          resourceType.resourceTypeId,
          resourceType,
        ]),
      ),
    [resourceTypes]
  );
  const viewMap = useMemo(
    () =>
      new Map(
        resourceViews.map((view) => [view.definition.viewId, view]),
      ),
    [resourceViews]
  );
  const activePanelId = useGridLayoutStore((state) => state.activePanelId);
  const activeResourceId = panels.find((panel) => panel.id === activePanelId)
    ?.params?.resourceId;
  usePreloadRichTextRenderer(
    typeof activeResourceId === "string" ? activeResourceId : undefined,
    routeSyncEnabled
  );
  const removePanelsByViewIds = useGridLayoutStore(
    (state) => state.removePanelsByViewIds
  );
  const renamingResourceId = useGridLayoutStore(
    (state) => state.renamingResourceId
  );
  const requestRenameActiveResource = useGridLayoutStore(
    (state) => state.requestRenameActiveResource
  );
  const toggleFocusMode = useGridLayoutStore((state) => state.toggleFocusMode);
  const unregisterPlugin = useGridLayoutStore((state) => state.unregisterByPlugin);
  const updatePanelTitleByResourceId = useGridLayoutStore(
    (state) => state.updatePanelTitleByResourceId
  );
  const updatePanelTitleByViewId = useGridLayoutStore(
    (state) => state.updatePanelTitleByViewId
  );

  // Mirror the panels slice into a ref so openExplorer can find the
  // explorer panel without adding `panels` to its dep array — otherwise the
  // navigation context would rebuild on every panel add/remove.
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const activePanelIdRef = useRef(activePanelId);
  activePanelIdRef.current = activePanelId;

  useEffect(() => {
    for (const panel of panels) {
      const resourceTypeId = panel.params?.resourceTypeId;
      if (typeof resourceTypeId !== "string") continue;

      const resourceType = resourceTypeMap.get(resourceTypeId);
      const defaultView = viewMap.get(resourceType?.defaultViewId ?? "");
      if (!defaultView) continue;
      const component = getRendererComponent(
        defaultView.extensionId,
        defaultView.definition.viewId
      );
      if (!componentRenderers[component]) continue;

      resolvePanelRenderer(
        panel.id,
        defaultView.extensionId,
        defaultView.definition.viewId
      );
    }
  }, [
    componentRenderers,
    panels,
    resolvePanelRenderer,
    resourceTypeMap,
    viewMap,
  ]);

  usePersistPanelWindowDescriptor({
    activePanelId,
    panels,
    session: panelWindowSession,
  });

  const openExplorer = useCallback(() => {
    const existingExplorerPanel = panelsRef.current.find(
      (panel) => panel.pluginId === WORKSPACE_EXPLORER_PLUGIN_ID
    );
    if (existingExplorerPanel) {
      dockviewApi?.getPanel(existingExplorerPanel.id)?.api.setActive();
      return;
    }

    ensureDesktopExplorerPanel({
      addGroup,
      addPanel: (panel) =>
        addPanel({
          ...panel,
          title: t("explorer.title"),
        }),
      viewportWidth: viewport.width(),
    });
  }, [addGroup, addPanel, dockviewApi, t, viewport]);

  const closeViewInstances = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      removePanelsByViewIds(ids);
    },
    [removePanelsByViewIds]
  );

  const navigation = useMemo(
    () => ({
      clearRenamingResource,
      closeViewInstances,
      openExplorer,
      openResource: ({
        resourceId,
        resourceTypeId,
        title,
        parentId,
        openKind: requestedOpenKind,
        replaceCurrent,
        schemaVersion,
        target,
      }: OpenResourceInput) => {
        const resourceType = resourceTypeMap.get(resourceTypeId);
        const defaultView = viewMap.get(resourceType?.defaultViewId ?? "");
        const extensionId = defaultView?.extensionId ?? resourceTypeId;
        const resourceViewId =
          defaultView?.definition.viewId ??
          resourceType?.defaultViewId ??
          "resource";
        const previousViewId = replaceCurrent
          ? panelsRef.current.find(
              (panel) => panel.id === activePanelIdRef.current
            )?.params?.viewId
          : undefined;
        const existing = panelsRef.current.find(
          (panel) => panel.params?.viewId === resourceId
        );
        prepareResourceOpen({
          existingPanel: existing,
          resourceId,
          resourceTypeId,
          preloadRenderer: defaultView?.definition.preload,
          requestedOpenKind,
        });
        openResourcePanel({
          extensionId,
          resourceId,
          resourceTypeId,
          title,
          parentId,
          schemaVersion,
          target,
          viewId: resourceViewId,
        });
        if (
          typeof previousViewId === "string" &&
          previousViewId !== resourceId
        ) {
          removePanelsByViewIds([previousViewId]);
        }
        if (isResourceViewReady(resourceId))
          reportResourceOpenReady(resourceId);
      },
      openResourceInNewWindow: async ({
        parentId,
        resourceId,
        resourceTypeId,
        schemaVersion,
        title,
      }: OpenResourceInput) => {
        if (!organizationSlug || !workspaceSlug) return false;
        const resourceType = resourceTypeMap.get(resourceTypeId);
        const defaultView = viewMap.get(resourceType?.defaultViewId ?? "");

        return openWorkspacePanelInNewWindow({
          descriptor: {
            extensionId: defaultView?.extensionId ?? resourceTypeId,
            params: {
              parentId: parentId ?? null,
              resourceId,
              resourceTypeId,
              schemaVersion,
              viewId: resourceId,
            },
            title,
            viewId:
              defaultView?.definition.viewId ??
              resourceType?.defaultViewId ??
              "resource",
          },
          errorMessage: t("gridLayout.tab.openInNewWindowError"),
          manager: panelWindows,
          workspacePath: getWorkspacePath(organizationSlug, workspaceSlug, resourceId),
        });
      },
      openView: ({
        extensionId,
        viewInstanceId,
        params,
        route,
        sourceResourceId,
        title,
        viewId: definitionViewId,
      }: OpenViewInput) =>
        openPluginPanel({
          pluginId: extensionId,
          renderer: definitionViewId,
          sourceViewId: sourceResourceId,
          title,
          viewId:
            viewInstanceId ??
            (route
              ? createPluginSubviewViewInstanceId(route)
              : createViewInstanceId(definitionViewId)),
          params: {
            ...params,
            ...(route
              ? {
                  routeItemId: route.resourceId,
                  routePath: route.path,
                  routeSubviewId: route.subviewId,
                }
              : {}),
          },
        }),
      openViewInNewWindow: async ({
        params,
        route,
        extensionId,
        viewInstanceId,
        title,
        viewId: definitionViewId,
      }: OpenViewInput) => {
        if (!organizationSlug || !workspaceSlug) return false;

        return openWorkspacePanelInNewWindow({
          descriptor: {
            extensionId,
            params: {
              ...params,
              extensionId,
              viewId:
                viewInstanceId ??
                (route
                  ? createPluginSubviewViewInstanceId(route)
                  : createViewInstanceId(definitionViewId)),
              ...(route
                ? {
                    routeItemId: route.resourceId,
                    routePath: route.path,
                    routeSubviewId: route.subviewId,
                  }
                : {}),
            },
            title,
            viewId: definitionViewId,
          },
          errorMessage: t("gridLayout.tab.openInNewWindowError"),
          manager: panelWindows,
          workspacePath: getWorkspacePath(organizationSlug, workspaceSlug),
        });
      },
      openTool: ({ target, toolId }: OpenToolInput) => {
        const tool = getTool(toolId);
        if (!tool) {
          log.warn({
            action: "workspace.tool.open",
            outcome: "not_found",
            tool: { id: toolId },
          });
          return;
        }
        openToolPanel({
          toolId: tool.toolId,
          pluginId: tool.pluginId,
          renderer: tool.renderer,
          target,
          title: t(tool.titleKey),
        });
      },
      requestRenameActiveResource,
      setResourceTitle: updatePanelTitleByResourceId,
      setViewInstanceTitle: updatePanelTitleByViewId,
      toggleFocusMode,
      unregisterPlugin,
    }),
    [
      clearRenamingResource,
      closeViewInstances,
      resourceTypeMap,
      openExplorer,
      openResourcePanel,
      openPluginPanel,
      openToolPanel,
      panelWindows,
      workspaceSlug,
      requestRenameActiveResource,
      t,
      toggleFocusMode,
      unregisterPlugin,
      updatePanelTitleByResourceId,
      updatePanelTitleByViewId,
      viewMap,
      organizationSlug,
    ]
  );

  const viewState = useMemo<OrganizationViewState>(
    () => ({
      activeViewInstanceId:
        viewId && subviewPath && subviewId
          ? createPluginSubviewViewInstanceId({
              resourceId: viewId,
              path: subviewPath,
              subviewId,
            })
          : viewId ?? null,
      isFocusMode,
      isExplorerOpen: panels.some(
        (panel) => panel.pluginId === WORKSPACE_EXPLORER_PLUGIN_ID
      ),
      isToolOpen: (toolId: string) => {
        const tool = getTool(toolId);
        if (!tool) return false;
        return panels.some((panel) => panel.params?.viewId === tool.toolId);
      },
      renamingResourceId,
    }),
    [isFocusMode, panels, renamingResourceId, subviewId, subviewPath, viewId]
  );

  useEffect(() => {
    if (
      !routeSyncEnabled ||
      !dockviewApi ||
      !organizationSlug ||
      !workspaceSlug
    ) {
      return;
    }

    const disposable = dockviewApi.onDidActivePanelChange((event) => {
      const panel = event.panel;
      const resourceId = panel?.params?.resourceId;
      const resourceTypeId = panel?.params?.resourceTypeId;
      if (
        typeof resourceId === "string" &&
        typeof resourceTypeId === "string" &&
        panel?.params?.viewId === resourceId
      ) {
        const resourceType = resourceTypeMap.get(resourceTypeId);
        trackResourceViewActivation({
          resourceId,
          resourceTypeId,
          preloadRenderer: viewMap.get(resourceType?.defaultViewId ?? "")
            ?.definition.preload,
        });
      }
      const mainPanel = dockviewApi.getGroup(MAIN_GROUP_ID)?.activePanel;
      const nextPath = getPathForActiveDesktopPanel(
        organizationSlug,
        workspaceSlug,
        panel,
        mainPanel
      );
      const nextSearch = panelWindowSession
        ? panelWindowSearch(panelWindowSession.windowId)
        : "";
      const current = locationRef.current;
      const nextLocation = resolvePendingDesktopRoute(
        current,
        nextPath,
        nextSearch
      );
      if (!nextLocation) return;
      locationRef.current = nextLocation;
      navigate({ pathname: nextPath, search: nextSearch }, { replace: true });
    });

    return () => disposable.dispose();
  }, [
    dockviewApi,
    navigate,
    panelWindowSession,
    routeSyncEnabled,
    resourceTypeMap,
    viewMap,
    organizationSlug,
    workspaceSlug,
  ]);

  // Close-panel URL sync: if the user closes the active panel and the next
  // active is explorer chrome (or nothing), drop the viewId from the URL.
  useEffect(() => {
    if (
      !routeSyncEnabled ||
      !dockviewApi ||
      !organizationSlug ||
      !workspaceSlug
    ) {
      return;
    }

    const disposable = dockviewApi.onDidRemovePanel(() => {
      const nextActive = dockviewApi.activePanel ?? null;
      const mainPanel = dockviewApi.getGroup(MAIN_GROUP_ID)?.activePanel;
      const nextPath = getPathForActiveDesktopPanel(
        organizationSlug,
        workspaceSlug,
        nextActive,
        mainPanel
      );
      const nextSearch = panelWindowSession
        ? panelWindowSearch(panelWindowSession.windowId)
        : "";
      const current = locationRef.current;
      const nextLocation = resolvePendingDesktopRoute(
        current,
        nextPath,
        nextSearch
      );
      if (!nextLocation) return;
      locationRef.current = nextLocation;
      navigate({ pathname: nextPath, search: nextSearch }, { replace: true });
    });

    return () => disposable.dispose();
  }, [
    dockviewApi,
    navigate,
    panelWindowSession,
    routeSyncEnabled,
    organizationSlug,
    workspaceSlug,
  ]);

  return (
    <OrganizationNavigationProvider navigation={navigation} viewState={viewState}>
      {children}
    </OrganizationNavigationProvider>
  );
}

function DesktopWorkspaceContent({
  controller,
  panelWindowSession,
}: {
  controller: WorkspaceRuntimeController;
  panelWindowSession: PanelWindowSession | null;
}) {
  const { i18n, t } = useTranslation();
  const {
    extensionAvailability,
    registerRuntimeReconciler,
    runtimeRevisions,
  } = useOrganizationPluginRuntime();
  const {
    allExtensionIds = [],
    bootError,
    bootState,
    enabledPluginIds,
    loadPlugin,
    markReady,
    reportBootError,
    retryBoot,
    unloadPlugin,
  } = controller;
  const { panelWindows } = usePlatform();
  const location = useLocation();
  const navigate = useNavigate();
  const { subviewId, subviewPath, viewId, organizationSlug, workspaceSlug } = useParams<{
    subviewId?: string;
    subviewPath?: string;
    viewId?: string;
    organizationSlug: string;
    workspaceSlug: string;
  }>();
  const resourcesMap = useWorkspaceResourcesMap();
  const navigateToTreeItem = useNavigateToResource();
  const addGroup = useGridLayoutStore((state) => state.addGroup);
  const addPanel = useGridLayoutStore((state) => state.addPanel);
  const dockviewApi = useGridLayoutStore((state) => state.dockviewApi);
  const panels = useGridLayoutStore((state) => state.panels);
  const views = useViews();
  const registerRenderers = useGridLayoutStore((state) => state.register);
  const unregisterRenderer = useGridLayoutStore((state) => state.unregister);
  const unregisterPlugin = useGridLayoutStore(
    (state) => state.unregisterByPlugin,
  );
  const setKnownPluginIds = useGridLayoutStore((state) => state.setKnownPluginIds);
  const { openResource, openTool } = useOrganizationNavigation();
  const { openView } = useOrganizationNavigation();
  const lastRoutedViewInstanceIdRef = useRef<string | null>(null);
  const resolution: ViewResolution = useMemo(
    () =>
      workspaceSlug && organizationSlug
        ? resolveWorkspaceView({
            resourcesMap,
            organizationSlug,
            workspaceSlug,
            subviewId: subviewId ?? null,
            subviewPath: subviewPath ?? null,
            viewId: viewId ?? null,
            views,
          })
        : { kind: "none" },
    [
      resourcesMap,
      workspaceSlug,
      subviewId,
      subviewPath,
      viewId,
      views,
      organizationSlug,
    ]
  );

  useFocusMode();
  useDebuggerHotkey();
  useRenameActiveResource();
  useWorkspaceBrowserTitle({ resolution });

  useDesktopWorkspaceBoot({
    addGroup,
    addPanel,
    allExtensionIds,
    enabledPluginIds,
    i18n,
    loadPlugin,
    markReady,
    panelWindowSession,
    registerRenderers,
    registerRuntimeReconciler,
    reportBootError,
    setKnownPluginIds,
    shouldOpenInitialEmptyPanel: !(viewId && subviewPath && subviewId),
    t,
    unloadPlugin,
    unregisterPlugin,
    unregisterRenderer,
    runtimeTarget: {
      // Database read is authoritative during initial boot. Registry may still
      // be resolving external extensions and temporarily expose bundled defaults.
      enabledExtensionIds: enabledPluginIds ?? [],
      extensionAvailability,
      runtimeRevisions,
    },
  });

  useAcknowledgePanelWindowTransfer({
    bootState,
    dockviewApi,
    navigate,
    panelWindows,
    panels,
    pathname: location.pathname,
    workspaceSlug,
    session: panelWindowSession,
    organizationSlug,
  });

  // Reset the dedupe ref whenever the active workspace changes — otherwise a
  // stale resourceId from workspace A could cause the first mount effect on workspace
  // B to short-circuit and leave the user on a blank workspace.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally
  // resetting on workspaceSlug change only.
  useEffect(() => {
        lastRoutedViewInstanceIdRef.current = null;
  }, [workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || !organizationSlug) return;

    if (resolution.kind === "none") {
      lastRoutedViewInstanceIdRef.current = null;
      return;
    }

    // Resource rows resolve independently and can open against a deferred
    // renderer. Extension-owned routes must wait for their definitions;
    // resolving those early would incorrectly replace valid deep-links.
    if (
      bootState !== "ready" &&
      resolution.kind !== "resource" &&
      resolution.kind !== "folder"
    ) {
      return;
    }

    switch (resolution.kind) {
      case "redirect":
        navigate(resolution.to, { replace: true });
        return;
      case "folder":
        navigate(getWorkspacePath(organizationSlug, workspaceSlug), { replace: true });
        navigateToTreeItem(resolution.resourceId);
        return;
      case "resource": {
        if (lastRoutedViewInstanceIdRef.current === resolution.resourceId) return;
        lastRoutedViewInstanceIdRef.current = resolution.resourceId;
        // Selecting a panel also updates the URL. Do not reopen that panel and
        // replace its in-flight resource-open measurement with a route echo.
        if (
          dockviewApi?.activePanel?.params?.viewId === resolution.resourceId
        )
          return;
        openResource({
          resourceId: resolution.resourceId,
          resourceTypeId: resolution.resourceTypeId,
          title: resolution.title,
          parentId: resolution.parentId,
          openKind: "deep_link",
          schemaVersion: resolution.schemaVersion,
        });
        return;
      }
      case "plugin-subview": {
        if (lastRoutedViewInstanceIdRef.current === resolution.viewInstanceId) return;
        lastRoutedViewInstanceIdRef.current = resolution.viewInstanceId;
        const existingSubviewPanel = panels.find(
          (panel) => panel.params?.viewId === resolution.viewInstanceId
        );
        openView({
          extensionId: resolution.resourceTypeId,
          viewInstanceId: resolution.viewInstanceId,
          params: {
            resourceId: resolution.resourceId,
            subviewId: resolution.subviewId,
            viewInstanceId: resolution.viewInstanceId,
          },
          route: {
            resourceId: resolution.resourceId,
            path: resolution.subviewPath,
            subviewId: resolution.subviewId,
          },
          sourceResourceId: resolution.resourceId,
          title: existingSubviewPanel?.title ?? resolution.title,
          viewId: resolution.viewId,
        });
        return;
      }
      case "tool": {
        if (lastRoutedViewInstanceIdRef.current === resolution.tool.toolId) return;
        lastRoutedViewInstanceIdRef.current = resolution.tool.toolId;
        openTool({ toolId: resolution.tool.toolId });
        return;
      }
      case "view": {
        if (lastRoutedViewInstanceIdRef.current === resolution.viewInstanceId) return;
        lastRoutedViewInstanceIdRef.current = resolution.viewInstanceId;
        openView({
          extensionId: resolution.extensionId,
          viewInstanceId: resolution.viewInstanceId,
          placement: resolution.placement,
          title: resolution.title,
          viewId: resolution.viewId,
        });
        return;
      }
      default: {
        // Exhaustiveness check — TypeScript fails here if a new
        // ViewResolution variant is added without a matching branch.
        const _exhaustive: never = resolution;
        return _exhaustive;
      }
    }
  }, [
    bootState,
    dockviewApi,
    resourcesMap,
    navigate,
    navigateToTreeItem,
    openResource,
    openView,
    openTool,
    panels,
    organizationSlug,
    workspaceSlug,
    resolution,
  ]);

  if (bootState === "error") {
    return (
      <WorkspaceRuntimeStatus
        error={bootError}
        onRetry={retryBoot}
      />
    );
  }

  return <GridLayoutView />;
}

export function DesktopWorkspaceShell({
  AppBarLeading = () => null,
  AppBarTrailing = () => null,
  buildVersion = "test",
  controller,
}: {
  AppBarLeading?: ComponentType;
  AppBarTrailing?: ComponentType;
  buildVersion?: string;
  controller: WorkspaceRuntimeController;
}) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const location = useLocation();
  const { panelWindows } = usePlatform();
  const { organizationSlug, workspaceSlug } = useParams<{
    organizationSlug: string;
    workspaceSlug: string;
  }>();
  const panelWindowSession = useMemo(
    () =>
      filterPanelWindowSession(
        readPanelWindowSession(location.search),
        controller.allExtensionIds,
      ),
    [controller.allExtensionIds, location.search]
  );
  const movePanelToWindow = useCallback(
    (panel: Panel) =>
      moveWorkspacePanelToWindow({
        errorMessage: t("gridLayout.tab.moveToNewWindowError"),
        manager: panelWindows,
        panel,
        workspacePath:
          organizationSlug && workspaceSlug
            ? getWorkspacePath(organizationSlug, workspaceSlug)
            : location.pathname,
      }),
    [location.pathname, panelWindows, workspaceSlug, t, organizationSlug]
  );

  return (
    <SearchProvider
      indexingReady={controller.bootState === "ready"}
      key={`search-${controller.retryKey}`}
    >
      <GridLayoutProvider
        key={`grid-${controller.retryKey}`}
        onMovePanelToWindow={movePanelToWindow}
      >
        <DesktopOrganizationNavigationBridge
          panelWindowSession={panelWindowSession}
          routeSyncEnabled={controller.bootState === "ready"}
        >
          <WorkspaceLayout>
            <SkipLink />
            <FocusModeOverlay />
            <div className="workspace-editor-layout grid min-h-0 flex-1 grid-rows-[3rem_minmax(0,1fr)] transition-[grid-template-rows] duration-200">
              <Appbar className="row-start-1">
                <Appbar.Leading>
                  <AppBarLeading />
                  <AgentWorkLauncher />
                </Appbar.Leading>
                <Appbar.Middle>
                  <div className="relative w-[15.6rem] max-w-full">
                    <SearchButton
                      workspaceName={workspace?.name ?? t("editor.workspace")}
                    />
                    <div className="absolute start-full top-1/2 ms-2 -translate-y-1/2">
                      <AppUpdateButton />
                    </div>
                  </div>
                </Appbar.Middle>
                <Appbar.Trailing>
                  <ExtensionViewLaunchers />
                  <AppBarTrailing />
                </Appbar.Trailing>
              </Appbar>
              <div className="row-start-2 flex min-h-0 min-w-0 flex-col">
                <WorkspaceExplorerContainer>
                  <WorkspaceLayout.Content>
                    <Suspense fallback={<WorkspaceDesktopLoadingContent />}>
                      <SearchDialog />
                      <DesktopWorkspaceContent
                        controller={controller}
                        panelWindowSession={panelWindowSession}
                      />
                    </Suspense>
                  </WorkspaceLayout.Content>
                  <Statusbar>
                    <Statusbar.Leading>
                      {controller.bootState === "ready" ? (
                        <WorkspaceExplorerButton />
                      ) : null}
                      <SyncStatusIndicator />
                    </Statusbar.Leading>
                    <Statusbar.Trailing>
                      <ActiveResourceStatusBar />
                      <BuildVersion version={buildVersion} />
                    </Statusbar.Trailing>
                  </Statusbar>
                </WorkspaceExplorerContainer>
              </div>
            </div>
          </WorkspaceLayout>
        </DesktopOrganizationNavigationBridge>
      </GridLayoutProvider>
    </SearchProvider>
  );
}
