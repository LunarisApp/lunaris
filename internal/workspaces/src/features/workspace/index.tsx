"use client";

import {
  normalizeWorkspaceVisibility,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import { SYNC_ACCESS, useSyncAccess } from "@repo/data/core";
import type { WorkspaceEntity } from "@repo/data/features/workspaces";
import {
  useWorkspaceBySlugQuery,
  useWorkspaceSync,
  WORKSPACE_INDEX_SYNC_STREAMS,
} from "@repo/data/features/workspaces";
import { useOnlineStatus } from "@repo/platform";
import { log } from "evlog";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useParams } from "react-router";

interface WorkspaceContextValue {
  isLoading: boolean;
  isUnavailableOffline: boolean;
  workspace: WorkspaceEntity | null;
  workspaceContentHasSynced: boolean;
  workspaceId: string;
  workspaceVisibility: WorkspaceVisibility | undefined;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
  organizationId?: string;
}

export function WorkspaceProvider({
  children,
  organizationId,
}: WorkspaceProviderProps) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const syncAccess = useSyncAccess();
  const isOnline = useOnlineStatus();

  const workspacesQuery = useWorkspaceBySlugQuery(workspaceSlug, organizationId, {
    streams:
      syncAccess === SYNC_ACCESS.cloud
        ? WORKSPACE_INDEX_SYNC_STREAMS
        : undefined,
  });
  const workspaces = workspacesQuery.data ?? [];

  const workspace = workspaces[0] ?? null;
  const workspaceId = workspace?.id ?? "";
  const workspaceVisibility = normalizeWorkspaceVisibility(workspace?.visibility);
  const workspaceSync = useWorkspaceSync(workspaceId || undefined, workspaceVisibility);

  const isWorkspaceSyncPending =
    syncAccess === SYNC_ACCESS.cloud &&
    workspace !== null &&
    (!workspaceSync.hasSynced || workspaceSync.isLoading);
  const readyWorkspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (workspaceId && !isWorkspaceSyncPending) {
      readyWorkspaceIdRef.current = workspaceId;
    }
  }, [isWorkspaceSyncPending, workspaceId]);
  const isInitialWorkspaceSyncPending =
    isWorkspaceSyncPending && readyWorkspaceIdRef.current !== workspaceId;
  const isUnavailableOffline = isInitialWorkspaceSyncPending && !isOnline;
  const isLoading =
    !workspaceSlug ||
    !organizationId ||
    workspacesQuery.isLoading ||
    (workspacesQuery.isFetching && workspaces.length === 0) ||
    (isInitialWorkspaceSyncPending && !isUnavailableOffline);
  const routeDecision = isUnavailableOffline
    ? "offline-unavailable"
    : isLoading
      ? "loading"
      : workspace
        ? "resolved"
        : "not-found";
  const previousDebugSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = JSON.stringify({
      organizationId,
      isOnline,
      workspaceId,
      workspaceQuery: {
        firstWorkspaceId: workspace?.id ?? null,
        isFetching: workspacesQuery.isFetching,
        isLoading: workspacesQuery.isLoading,
        rowCount: workspaces.length,
      },
      workspaceSlug,
      workspaceSync: workspaceSync.streams,
      routeDecision,
      syncAccess,
    });

    if (previousDebugSnapshotRef.current === snapshot) return;
    previousDebugSnapshotRef.current = snapshot;

    log.debug({
      tag: "WorkspaceRouteDebug",
      msg: "workspace provider state changed",
      organizationId,
      isOnline,
      workspaceId,
      workspaceQuery: {
        firstWorkspaceId: workspace?.id ?? null,
        isFetching: workspacesQuery.isFetching,
        isLoading: workspacesQuery.isLoading,
        rowCount: workspaces.length,
      },
      workspaceSlug,
      workspaceSync: workspaceSync.streams,
      routeDecision,
      syncAccess,
    });
  }, [
    organizationId,
    isOnline,
    workspace?.id,
    workspaceId,
    workspaceSlug,
    workspaceSync.streams,
    workspaces.length,
    workspacesQuery.isFetching,
    workspacesQuery.isLoading,
    routeDecision,
    syncAccess,
  ]);

  if (workspacesQuery.error) throw workspacesQuery.error;

  if (!workspaceSlug) {
    return null;
  }

  return (
    <WorkspaceContext.Provider
      value={{
        isLoading,
        isUnavailableOffline,
        workspaceId,
        workspace,
        workspaceContentHasSynced: workspaceSync.hasSynced,
        workspaceVisibility,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useCurrentWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useCurrentWorkspace must be used within WorkspaceProvider");
  }
  return context;
}

/** Workspace context when mounted inside a workspace route. */
export function useOptionalCurrentWorkspace() {
  return useContext(WorkspaceContext);
}
