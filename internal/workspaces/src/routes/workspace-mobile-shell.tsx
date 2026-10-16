import {
  createPluginSubviewViewInstanceId,
  createViewInstanceId,
  useViews,
} from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import { ResourceViewLayout } from "@repo/workspaces/editor";
import { ExtensionPlaceholder } from "@repo/workspaces/extensions";
import { GridLayoutProvider } from "@repo/workspaces/grid-layout";
import { LoaderView } from "@repo/features/loading";
import {
  WORKSPACE_TRASH_PLUGIN_ID,
  WORKSPACE_TRASH_RENDERER,
  WorkspaceExplorerContainer,
  WorkspaceTrashPanel,
  WorkspaceTreeSkeleton,
} from "@repo/workspaces/workspace-explorer";
import { SearchProvider } from "@repo/workspaces/search";
import {
  type OpenResourceInput,
  type OpenViewInput,
  type OpenToolInput,
  OrganizationNavigationProvider,
  type OrganizationViewState,
} from "@repo/workspaces/organization-navigation";
import posthog from "posthog-js";
import {
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  type InitializePluginsDeps,
  usePluginRuntimeHost,
} from "../extensions/host";
import {
  type PluginRuntimeTarget,
  useOrganizationPluginRuntime,
} from "../extensions/organization-runtime";
import {
  getWorkspacePath,
  getWorkspaceSubviewPath,
} from "./workspace-deep-link";
import type { useWorkspaceRuntimeController } from "./workspace-runtime";

type WorkspaceRuntimeController = ReturnType<
  typeof useWorkspaceRuntimeController
>;

// ---------------------------------------------------------------------------
// Mobile Content Registry
// ---------------------------------------------------------------------------

type RendererBuilder = (props: {
  params: Record<string, unknown>;
}) => ReactNode;

interface MobileViewRegistryValue {
  getRenderer: (
    pluginId: string,
    renderer: string
  ) => RendererBuilder | undefined;
}

const MobileViewRegistryContext = createContext<MobileViewRegistryValue | null>(
  null
);

export function useMobileViewRegistry() {
  const ctx = useContext(MobileViewRegistryContext);
  if (!ctx) {
    throw new Error(
      "useMobileViewRegistry must be used within MobileViewRegistryProvider"
    );
  }
  return ctx;
}

function useMobileViewRegistryStore() {
  const registryRef = useRef(new Map<string, RendererBuilder>());

  const register = useCallback(
    (pluginId: string, renderer: string, builder: RendererBuilder) => {
      registryRef.current.set(`${pluginId}.${renderer}`, builder);
    },
    []
  );

  const getRenderer = useCallback(
    (pluginId: string, renderer: string) =>
      registryRef.current.get(`${pluginId}.${renderer}`),
    []
  );

  const unregister = useCallback((pluginId: string, renderer: string) => {
    registryRef.current.set(`${pluginId}.${renderer}`, () => (
      <ExtensionPlaceholder extensionId={pluginId} />
    ));
  }, []);

  const unregisterPlugin = useCallback((pluginId: string) => {
    for (const key of registryRef.current.keys()) {
      if (!key.startsWith(`${pluginId}.`)) {
        continue;
      }
      registryRef.current.set(key, () => (
        <ExtensionPlaceholder extensionId={pluginId} />
      ));
    }
  }, []);

  return { register, getRenderer, unregister, unregisterPlugin };
}

// ---------------------------------------------------------------------------
// Mobile Boot
// ---------------------------------------------------------------------------

interface MobileBootOptions {
  enabledPluginIds: string[] | null;
  i18n: ReturnType<typeof useTranslation>["i18n"];
  loadPlugin: WorkspaceRuntimeController["loadPlugin"];
  markReady: () => void;
  registerRenderers: InitializePluginsDeps["gridLayoutRegister"];
  registerRuntimeReconciler: ReturnType<
    typeof useOrganizationPluginRuntime
  >["registerRuntimeReconciler"];
  reportBootError: (error: unknown) => void;
  runtimeTarget: PluginRuntimeTarget;
  unloadPlugin: WorkspaceRuntimeController["unloadPlugin"];
  unregisterPlugin: (pluginId: string) => void;
  unregisterRenderer: NonNullable<
    InitializePluginsDeps["gridLayoutUnregister"]
  >;
}

function useMobileWorkspaceBoot({
  enabledPluginIds,
  i18n,
  loadPlugin,
  markReady,
  registerRenderers,
  unregisterRenderer,
  unregisterPlugin,
  registerRuntimeReconciler,
  runtimeTarget,
  unloadPlugin,
  reportBootError,
}: MobileBootOptions) {
  const initializedRef = useRef(false);
  const runtimeCleanupRef = useRef<(() => void) | null>(null);
  const { dispose, reconcile } = usePluginRuntimeHost({
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
    if (!enabledPluginIds || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    let cancelled = false;

    registerRenderers(
      WORKSPACE_TRASH_PLUGIN_ID,
      WORKSPACE_TRASH_RENDERER,
      () => <WorkspaceTrashPanel />
    );

    reconcile(runtimeTargetRef.current)
      .then(() => {
        if (!cancelled) {
          runtimeCleanupRef.current = registerRuntimeReconciler(reconcile);
          markReady();
        }
      })
      .catch((error) => {
        if (!cancelled) {
          reportBootError(error);
        }
      });

    return () => {
      cancelled = true;
      runtimeCleanupRef.current?.();
      runtimeCleanupRef.current = null;
      dispose();
      initializedRef.current = false;
    };
  }, [
    dispose,
    enabledPluginIds,
    reconcile,
    markReady,
    registerRuntimeReconciler,
    registerRenderers,
    reportBootError,
  ]);
}

// ---------------------------------------------------------------------------
// Organization Navigation Bridge
// ---------------------------------------------------------------------------

function MobileOrganizationNavigationBridge({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const views = useViews();
  const { subviewId, subviewPath, viewId, organizationSlug, workspaceSlug } =
    useParams<{
      subviewId?: string;
      subviewPath?: string;
      viewId?: string;
      organizationSlug: string;
      workspaceSlug: string;
    }>();
  const activeViewInstanceId =
    viewId && subviewPath && subviewId
      ? createPluginSubviewViewInstanceId({
          resourceId: viewId,
          path: subviewPath,
          subviewId,
        })
      : viewId;
  const pluginViewIds = useMemo(
    () => new Set(views.map(({ definition }) => definition.viewId)),
    [views]
  );

  const reportUnsupportedWindowOpen = useCallback(() => {
    toast.error(t("gridLayout.tab.openInNewWindowError"));
    posthog.capture("panel_open_in_new_window_failed", {
      failure_reason: "unsupported",
      platform: "mobile",
    });
    return Promise.resolve(false);
  }, [t]);

  const navigation = useMemo(
    () => ({
      clearRenamingResource: () => {
        /* No action while this capability is unavailable. */
      },
      closeViewInstances: (viewInstanceIds: string[]) => {
        // Only bump the user to the workspace root if the view they are
        // currently looking at is one of the closed ones — otherwise a
        // background delete (e.g. deleting an unrelated item) would yank
        // them away from their active view for no reason.
        if (!(organizationSlug && workspaceSlug)) {
          return;
        }
        if (
          activeViewInstanceId &&
          viewInstanceIds.includes(activeViewInstanceId)
        ) {
          navigate(
            subviewPath && viewId
              ? getWorkspacePath(organizationSlug, workspaceSlug, viewId)
              : getWorkspacePath(organizationSlug, workspaceSlug)
          );
        }
      },
      openExplorer: () => {
        if (!(organizationSlug && workspaceSlug)) {
          return;
        }
        navigate(getWorkspacePath(organizationSlug, workspaceSlug));
      },
      openResource: ({ resourceId, replaceCurrent }: OpenResourceInput) => {
        if (!(organizationSlug && workspaceSlug)) {
          return;
        }
        navigate(
          getWorkspacePath(organizationSlug, workspaceSlug, resourceId),
          {
            replace: replaceCurrent,
          }
        );
      },
      openResourceInNewWindow: reportUnsupportedWindowOpen,
      openView: ({ route, viewId: definitionViewId }: OpenViewInput) => {
        if (!(organizationSlug && workspaceSlug)) {
          return false;
        }
        if (!(route || pluginViewIds.has(definitionViewId))) {
          return false;
        }
        navigate(
          route
            ? getWorkspaceSubviewPath(
                organizationSlug,
                workspaceSlug,
                route.resourceId,
                route.path,
                route.subviewId
              )
            : getWorkspacePath(
                organizationSlug,
                workspaceSlug,
                createViewInstanceId(definitionViewId)
              )
        );
        return true;
      },
      openViewInNewWindow: reportUnsupportedWindowOpen,
      openTool: ({ toolId }: OpenToolInput) => {
        if (!(organizationSlug && workspaceSlug)) {
          return;
        }
        navigate(getWorkspacePath(organizationSlug, workspaceSlug, toolId));
      },
      requestRenameActiveResource: () => {
        /* No action while this capability is unavailable. */
      },
      setResourceTitle: () => {
        /* No action while this capability is unavailable. */
      },
      setViewInstanceTitle: () => {
        /* No action while this capability is unavailable. */
      },
      toggleFocusMode: () => {
        /* No action while this capability is unavailable. */
      },
      unregisterPlugin: () => {
        /* No action while this capability is unavailable. */
      },
    }),
    [
      activeViewInstanceId,
      navigate,
      workspaceSlug,
      reportUnsupportedWindowOpen,
      subviewPath,
      viewId,
      pluginViewIds,
      organizationSlug,
    ]
  );

  const viewState = useMemo<OrganizationViewState>(
    () => ({
      activeViewInstanceId: activeViewInstanceId ?? null,
      isFocusMode: false,
      // On mobile the explorer is the workspace root route, so it is "open"
      // precisely when no viewId is active.
      isExplorerOpen: !viewId,
      isToolOpen: (toolId: string) => viewId === toolId,
      renamingResourceId: null,
    }),
    [activeViewInstanceId, viewId]
  );

  return (
    <OrganizationNavigationProvider
      navigation={navigation}
      viewState={viewState}
    >
      {children}
    </OrganizationNavigationProvider>
  );
}

// ---------------------------------------------------------------------------
// Boot Status
// ---------------------------------------------------------------------------

function MobileWorkspaceLoadingContent() {
  const { viewId } = useParams<{ viewId?: string }>();

  return viewId ? (
    <LoaderView />
  ) : (
    <div
      className="h-dvh min-h-0 overflow-y-auto px-1"
      data-testid="mobile-workspace-loading-shell"
    >
      <WorkspaceTreeSkeleton />
    </div>
  );
}

function MobileBootError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-4 rounded-lg border bg-background p-6 text-center">
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">
            {t("mobile.workspaceFailedToLoad")}
          </h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
        <Button onClick={onRetry}>{t("common.retry")}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Content
// ---------------------------------------------------------------------------

function MobileWorkspaceContent() {
  return (
    <Suspense fallback={<MobileWorkspaceLoadingContent />}>
      <Outlet />
    </Suspense>
  );
}

function MobileWorkspaceFlow({
  controller,
  registerRenderers,
  unregisterRenderer,
  unregisterPlugin,
}: {
  controller: WorkspaceRuntimeController;
  registerRenderers: InitializePluginsDeps["gridLayoutRegister"];
  unregisterRenderer: NonNullable<
    InitializePluginsDeps["gridLayoutUnregister"]
  >;
  unregisterPlugin: (pluginId: string) => void;
}) {
  const { i18n, t } = useTranslation();
  const { extensionAvailability, registerRuntimeReconciler, runtimeRevisions } =
    useOrganizationPluginRuntime();
  const {
    bootError,
    bootState,
    enabledPluginIds,
    loadPlugin,
    markReady,
    reportBootError,
    retryBoot,
    unloadPlugin,
  } = controller;
  useMobileWorkspaceBoot({
    enabledPluginIds,
    i18n,
    loadPlugin,
    markReady,
    registerRenderers,
    registerRuntimeReconciler,
    reportBootError,
    unregisterRenderer,
    unregisterPlugin,
    runtimeTarget: {
      // Avoid bundled defaults from the still-resolving registry. Runtime
      // reconciliation adds external extensions after its first full snapshot.
      enabledExtensionIds: enabledPluginIds ?? [],
      extensionAvailability,
      runtimeRevisions,
    },
    unloadPlugin,
  });

  if (bootState === "error") {
    return (
      <MobileBootError
        error={bootError ?? t("mobile.workspaceFailedToLoad")}
        onRetry={retryBoot}
      />
    );
  }

  const initialLoading = <MobileWorkspaceLoadingContent />;

  return (
    <Suspense fallback={initialLoading}>
      <WorkspaceExplorerContainer>
        {/* biome-ignore lint/suspicious/noLeakedRender: Both ternary branches intentionally render valid ReactNode/text values. */}
        {bootState === "ready" ? <MobileWorkspaceContent /> : initialLoading}
      </WorkspaceExplorerContainer>
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function MobileWorkspaceShell({
  controller,
}: {
  controller: WorkspaceRuntimeController;
}) {
  const { register, getRenderer, unregister, unregisterPlugin } =
    useMobileViewRegistryStore();

  const registryValue = useMemo(() => ({ getRenderer }), [getRenderer]);

  return (
    <SearchProvider
      indexingReady={controller.bootState === "ready"}
      key={`search-${controller.retryKey}`}
    >
      <GridLayoutProvider key={`grid-${controller.retryKey}`}>
        <MobileViewRegistryContext.Provider value={registryValue}>
          <MobileOrganizationNavigationBridge>
            <MobileWorkspaceFlow
              controller={controller}
              registerRenderers={register}
              unregisterRenderer={unregister}
              unregisterPlugin={unregisterPlugin}
            />
          </MobileOrganizationNavigationBridge>
        </MobileViewRegistryContext.Provider>
      </GridLayoutProvider>
    </SearchProvider>
  );
}
