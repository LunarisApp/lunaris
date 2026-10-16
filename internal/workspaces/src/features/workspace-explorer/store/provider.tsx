import { usePowerSync } from "@repo/data/core";
import {
  getExpiredLocalTrashRootIds,
  getWorkspaceResourcesSyncStreams,
  useWorkspaceResourceTrashSuspenseQuery,
  useWorkspaceResourcesSuspenseQuery,
} from "@repo/data/features/workspace-resources";
import { permission } from "@repo/auth/permissions";
import { log, parseError } from "evlog";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth";
import { useReserveResourceCapacity } from "@repo/features/entitlements";
import { usePermissionCheck } from "@repo/features/permissions";
import { useOrganizationNavigation } from "../../organization-navigation";
import { removeRecentFilesByResourceIds } from "../../search";
import { VIRTUAL_ROOT_ID } from "../constants";
import type {
  ChildrenMap,
  WorkspaceResourcesMap,
  WorkspaceResourceTrashMap,
} from "../types";
import { createBoundActions } from "./actions";
import { WorkspaceExplorerContext, TreeNavigationContext } from "./contexts";
import { useWorkspaceTreeNavigationState } from "./use-workspace-tree-navigation-state";

export function WorkspaceExplorerProvider({
  children,
  workspaceId,
  waitForSync = true,
}: {
  children: ReactNode;
  workspaceId: string;
  waitForSync?: boolean;
}) {
  const itemStreams = useMemo(
    () => (waitForSync ? getWorkspaceResourcesSyncStreams() : undefined),
    [waitForSync]
  );
  const { data: resources } = useWorkspaceResourcesSuspenseQuery(
    workspaceId,
    itemStreams ? { streams: itemStreams } : undefined
  );
  const { data: trash } = useWorkspaceResourceTrashSuspenseQuery(
    workspaceId,
    itemStreams ? { streams: itemStreams } : undefined
  );
  const db = usePowerSync();
  const api = useApi();
  const auth = useAuth();
  const reserveResourceCapacity = useReserveResourceCapacity();
  const permissionCheck = usePermissionCheck();
  const { data: session } = auth.useSession();
  const { closeViewInstances, setResourceTitle } = useOrganizationNavigation();
  const previousDebugSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = JSON.stringify({
      resourceCount: resources.length,
      workspaceId,
    });

    if (previousDebugSnapshotRef.current === snapshot) {
      return;
    }
    previousDebugSnapshotRef.current = snapshot;

    log.debug({
      tag: "WorkspaceRouteDebug",
      msg: "workspace explorer provider state changed",
      resourceCount: resources.length,
      workspaceId,
    });
  }, [resources.length, workspaceId]);

  const { resourcesMap, childrenMap } = useMemo(() => {
    const im: WorkspaceResourcesMap = new Map(resources.map((i) => [i.id, i]));
    const cm: ChildrenMap = new Map();

    for (const resource of resources) {
      const parentKey = resource.parent_id ?? VIRTUAL_ROOT_ID;
      const siblings = cm.get(parentKey) ?? [];
      siblings.push(resource);
      cm.set(parentKey, siblings);
    }

    return { resourcesMap: im, childrenMap: cm };
  }, [resources]);
  const trashMap: WorkspaceResourceTrashMap = useMemo(
    () => new Map(trash.map((entry) => [entry.id, entry])),
    [trash]
  );

  useEffect(() => {
    const trashedIds = [...trashMap.keys()];
    if (trashedIds.length === 0) {
      return;
    }
    closeViewInstances(trashedIds);
    removeRecentFilesByResourceIds(workspaceId, trashedIds);
  }, [closeViewInstances, workspaceId, trashMap]);

  // Store resourcesMap in a ref so actions + navigateToResource can read the latest
  // without re-binding on every PowerSync push.
  const resourcesMapRef = useRef(resourcesMap);
  resourcesMapRef.current = resourcesMap;

  const actions = useMemo(
    () =>
      createBoundActions({
        api,
        currentUserId: session?.user.id ?? null,
        db,
        getResourcesMap: () => resourcesMapRef.current,
        permissionCheck,
        workspaceId,
        reserveResourceCapacity,
        organizationNavigation: {
          closeViewInstances,
          setResourceTitle,
        },
      }),
    [
      api,
      closeViewInstances,
      db,
      workspaceId,
      permissionCheck,
      reserveResourceCapacity,
      session?.user.id,
      setResourceTitle,
    ]
  );

  useEffect(() => {
    if (!permissionCheck(permission.content.delete)) {
      return;
    }
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const purgeExpired = async () => {
      try {
        const rootIds = await getExpiredLocalTrashRootIds({ db, workspaceId });
        if (!cancelled && rootIds.length > 0) {
          await actions.purgeResources(rootIds);
        }
      } catch (error) {
        log.error({
          tag: "WorkspaceTrash",
          msg: "automatic local trash purge failed",
          error: parseError(error),
          workspaceId,
        });
      }
    };

    void purgeExpired();
    const nearestDeadline = trash
      .filter((entry) => entry.id === entry.trash_root_id && entry.purge_at)
      .reduce(
        (nearest, entry) => Math.min(nearest, Date.parse(entry.purge_at ?? "")),
        Number.POSITIVE_INFINITY
      );
    if (Number.isFinite(nearestDeadline)) {
      const scheduleNearestDeadline = () => {
        timeoutId = setTimeout(
          async () => {
            await purgeExpired();
            if (!cancelled && nearestDeadline > Date.now()) {
              scheduleNearestDeadline();
            }
          },
          Math.min(Math.max(0, nearestDeadline - Date.now()), 60 * 60 * 1000)
        );
      };
      scheduleNearestDeadline();
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void purgeExpired();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [actions, db, permissionCheck, workspaceId, trash]);

  const explorerValue = useMemo(
    () => ({ resources, resourcesMap, childrenMap, trashMap, actions }),
    [resources, resourcesMap, childrenMap, trashMap, actions]
  );

  const treeNavigationValue = useWorkspaceTreeNavigationState({
    resourcesMap,
    workspaceId,
  });

  return (
    <WorkspaceExplorerContext.Provider value={explorerValue}>
      <TreeNavigationContext.Provider value={treeNavigationValue}>
        {children}
      </TreeNavigationContext.Provider>
    </WorkspaceExplorerContext.Provider>
  );
}
