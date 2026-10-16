import { permission } from "@repo/auth/permissions";
import { WORKSPACE_ROLE, WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { useWorkspaceMemberRole } from "@repo/data/features/workspace-members";
import { useAuth } from "@repo/features/auth/context";
import {
  WorkspaceNotFound,
  WorkspaceUnavailableOffline,
} from "@repo/workspaces/editor";
import { LoaderView } from "@repo/features/loading";
import { PermissionDenied } from "@repo/features/permission-denied";
import {
  PermissionProvider,
  useAllPermissions,
  usePermissionCheck,
} from "@repo/features/permissions";
import {
  WorkspaceProvider,
  useCurrentWorkspace,
} from "@repo/workspaces/workspace";
import { useRegionClients } from "@repo/features/region";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { rememberWorkspace } from "./last-workspace";
import type { AvailablePluginRegistry } from "../extensions/access";
import {
  WorkspacePluginRuntimeProvider,
  useOrganizationPluginRuntime,
} from "../extensions/organization-runtime";
import { ExtensionHostProvider } from "../extensions/host";
import { WorkspaceDesktopLoadingShell } from "./workspace-desktop-loading-shell";
import { useWorkspacePluginPreload } from "./workspace-plugin-preload";
import { useWorkspaceRuntimeController } from "./workspace-runtime";
import type { WorkspacePageProps } from "./types";

const DesktopWorkspaceShell = lazy(() =>
  import("./workspace-desktop-shell").then((module) => ({
    default: module.DesktopWorkspaceShell,
  }))
);
const MobileWorkspaceShell = lazy(() =>
  import("./workspace-mobile-shell").then((module) => ({
    default: module.MobileWorkspaceShell,
  }))
);

const EmptyAppBarSlot = () => null;

type WorkspacePluginRegistry = Pick<
  AvailablePluginRegistry,
  | "allExtensionIds"
  | "defaultExtensionIds"
  | "extensionManifests"
  | "extensionMetadata"
  | "loadPlugin"
  | "unloadPlugin"
>;

export default function WorkspacePage({
  AppBarLeading = EmptyAppBarSlot,
  AppBarTrailing = EmptyAppBarSlot,
  buildVersion = "",
  shell,
}: WorkspacePageProps) {
  const { authClient } = useRegionClients();
  const canReadWorkspace = useAllPermissions([
    permission.workspace.read,
    permission.content.read,
  ]);
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const { data: activeOrg } = authClient?.useActiveOrganization() ?? {
    data: null,
  };
  const bundledRegistry = useOrganizationPluginRuntime();

  const fallback =
    shell === "mobile" ? (
      <LoaderView />
    ) : (
      <WorkspaceDesktopLoadingShell
        AppBarLeading={AppBarLeading}
        AppBarTrailing={AppBarTrailing}
      />
    );

  if (!authClient) {
    return fallback;
  }

  if (!canReadWorkspace) {
    return (
      <PermissionDenied
        backTo={organizationSlug ? `/${organizationSlug}` : "/"}
      />
    );
  }

  return (
    <Suspense fallback={fallback}>
      <WorkspaceProvider organizationId={activeOrg?.id}>
        <WorkspaceInner
          AppBarLeading={AppBarLeading}
          AppBarTrailing={AppBarTrailing}
          buildVersion={buildVersion}
          bundledRegistry={bundledRegistry}
          shell={shell}
        />
      </WorkspaceProvider>
    </Suspense>
  );
}

function WorkspaceInner({
  AppBarLeading,
  AppBarTrailing,
  buildVersion,
  bundledRegistry,
  shell,
}: Required<WorkspacePageProps> & {
  bundledRegistry: WorkspacePluginRegistry;
}) {
  const {
    isLoading,
    isUnavailableOffline,
    workspace,
    workspaceContentHasSynced,
  } = useCurrentWorkspace();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const organizationPermission = usePermissionCheck();
  const workspaceRole = useWorkspaceMemberRole(
    workspace?.id,
    session?.user?.id
  );
  const preloadWorkspacePlugins = useWorkspacePluginPreload(
    bundledRegistry.allExtensionIds,
    {
      defaultExtensionIds: bundledRegistry.defaultExtensionIds,
      loadPlugin: bundledRegistry.loadPlugin,
    }
  );
  const workspaceId = workspace?.id;
  const isPrivate = workspace?.visibility === WORKSPACE_VISIBILITY.private;
  const isOwner = Boolean(
    workspace && workspace.owner_id === session?.user?.id
  );
  const canRead =
    !isPrivate ||
    isOwner ||
    workspaceRole.data === WORKSPACE_ROLE.editor ||
    workspaceRole.data === WORKSPACE_ROLE.viewer;
  const canWrite = isOwner || workspaceRole.data === WORKSPACE_ROLE.editor;
  const { organizationSlug, viewId, subviewPath, subviewId } = useParams();
  const location = useLocation();
  const userId = session?.user?.id;
  const organizationId = workspace?.organization_id;
  const viewPath = [viewId, subviewPath, subviewId]
    .filter(Boolean)
    .map((segment) => `/${segment}`)
    .join("");
  useEffect(() => {
    if (
      !(isLoading || isUnavailableOffline) &&
      canRead &&
      workspaceId &&
      userId &&
      organizationId &&
      !new URLSearchParams(location.search).has("panelWindow")
    ) {
      rememberWorkspace(userId, organizationId, { workspaceId, viewPath });
    }
  }, [
    isLoading,
    isUnavailableOffline,
    canRead,
    workspaceId,
    userId,
    organizationId,
    viewPath,
    location.search,
  ]);

  const fallback =
    shell === "mobile" ? (
      <LoaderView />
    ) : (
      <WorkspaceDesktopLoadingShell
        AppBarLeading={AppBarLeading}
        AppBarTrailing={AppBarTrailing}
      />
    );

  useEffect(() => {
    if (workspaceId && workspaceContentHasSynced && canRead) {
      preloadWorkspacePlugins(workspaceId);
    }
  }, [
    canRead,
    preloadWorkspacePlugins,
    workspaceContentHasSynced,
    workspaceId,
  ]);

  if (
    location.state?.restoredWorkspace &&
    (isUnavailableOffline ||
      !(isLoading || (workspace && (workspaceRole.isLoading || canRead))))
  ) {
    return (
      <Navigate replace to={organizationSlug ? `/${organizationSlug}` : "/"} />
    );
  }

  if (isUnavailableOffline) {
    return (
      <WorkspaceUnavailableOffline
        backTo={organizationSlug ? `/${organizationSlug}` : "/"}
      />
    );
  }

  if (isLoading) {
    return fallback;
  }

  if (!workspace) {
    return <WorkspaceNotFound />;
  }

  if (
    isPrivate &&
    workspace.owner_id !== session?.user?.id &&
    workspaceRole.isLoading
  ) {
    return fallback;
  }

  if (isPrivate && !canRead) {
    return (
      <PermissionDenied
        backTo={organizationSlug ? `/${organizationSlug}` : "/"}
      />
    );
  }
  const workspacePermission = (
    required: Parameters<typeof organizationPermission>[0]
  ) => {
    if (workspace.visibility !== WORKSPACE_VISIBILITY.private) {
      return organizationPermission(required);
    }
    if (required.resource === "content") {
      return required.action === "read" ? canRead : canWrite;
    }
    if (required.resource === "workspace") {
      return required.action === "read" ? canRead : isOwner;
    }
    return organizationPermission(required);
  };

  return (
    <PermissionProvider check={workspacePermission}>
      <ExtensionHostProvider key={workspace.id}>
        <WorkspacePluginRuntimeProvider workspaceId={workspace.id}>
          <WorkspaceRuntime
            AppBarLeading={AppBarLeading}
            AppBarTrailing={AppBarTrailing}
            buildVersion={buildVersion}
            shell={shell}
          />
        </WorkspacePluginRuntimeProvider>
      </ExtensionHostProvider>
    </PermissionProvider>
  );
}

function WorkspaceRuntime({
  AppBarLeading,
  AppBarTrailing,
  buildVersion,
  shell,
}: Required<WorkspacePageProps>) {
  const pluginRegistry = useOrganizationPluginRuntime();
  return (
    <ResolvedWorkspace
      AppBarLeading={AppBarLeading}
      AppBarTrailing={AppBarTrailing}
      buildVersion={buildVersion}
      pluginRegistry={pluginRegistry}
      shell={shell}
    />
  );
}

function ResolvedWorkspace({
  AppBarLeading,
  AppBarTrailing,
  buildVersion,
  pluginRegistry,
  shell,
}: Required<WorkspacePageProps> & { pluginRegistry: WorkspacePluginRegistry }) {
  const controller = useWorkspaceRuntimeController(
    pluginRegistry.allExtensionIds,
    {
      defaultExtensionIds: pluginRegistry.defaultExtensionIds,
      extensionManifests: pluginRegistry.extensionManifests,
      extensionMetadata: pluginRegistry.extensionMetadata,
      loadPlugin: pluginRegistry.loadPlugin,
      unloadPlugin: pluginRegistry.unloadPlugin,
    }
  );

  if (shell === "mobile") {
    return <MobileWorkspaceShell controller={controller} />;
  }

  return (
    <DesktopWorkspaceShell
      AppBarLeading={AppBarLeading}
      AppBarTrailing={AppBarTrailing}
      buildVersion={buildVersion}
      controller={controller}
    />
  );
}
