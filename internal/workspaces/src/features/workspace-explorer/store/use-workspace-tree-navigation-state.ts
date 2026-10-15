import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceResourcesMap } from "../types";
import { isFolder } from "../types";
import type { TreeNavigationContextValue } from "./contexts";

interface PendingTreeAction {
  kind: "navigate" | "rename";
  resourceId: string;
}

interface RegisteredTree {
  onOpenResource?: (resource: WorkspaceResourceEntity) => void;
  tree: TreeInstance<WorkspaceResourceEntity>;
}

function performTreeAction({
  action,
  resourcesMap,
  registration,
}: {
  action: PendingTreeAction;
  resourcesMap: WorkspaceResourcesMap;
  registration: RegisteredTree;
}): boolean {
  const { resourceId, kind } = action;
  const { tree, onOpenResource } = registration;
  const resource = resourcesMap.get(resourceId);
  if (!resource) return false;

  const itemInstance = tree.getItemInstance(resourceId);
  if (!itemInstance) return false;

  tree.setSelectedItems([resourceId]);

  let current = itemInstance;
  const ancestors: string[] = [];
  while (current.getParent()) {
    const parent = current.getParent();
    if (parent) {
      ancestors.unshift(parent.getId());
      current = parent;
    } else {
      break;
    }
  }
  for (const ancestorId of ancestors) {
    tree.getItemInstance(ancestorId)?.expand();
  }

  if (isFolder(resource)) {
    itemInstance.expand();
  }

  if (kind === "rename") {
    itemInstance.startRenaming();
  } else if (!isFolder(resource) && resource.resource_type_id && onOpenResource) {
    onOpenResource(resource);
  }

  itemInstance.scrollTo();
  return true;
}

export function useWorkspaceTreeNavigationState({
  resourcesMap,
  workspaceId,
}: {
  resourcesMap: WorkspaceResourcesMap;
  workspaceId: string;
}): TreeNavigationContextValue {
  const resourcesMapRef = useRef(resourcesMap);
  resourcesMapRef.current = resourcesMap;
  const [treeRegistration, setTreeRegistration] =
    useState<RegisteredTree | null>(null);
  const pendingActionRef = useRef<PendingTreeAction | null>(null);

  useEffect(() => {
    pendingActionRef.current = null;
    setTreeRegistration(null);
  }, [workspaceId]);

  const runAction = useCallback(
    (action: PendingTreeAction, registration: RegisteredTree) =>
      performTreeAction({
        action,
        resourcesMap: resourcesMapRef.current,
        registration,
      }),
    []
  );

  const flushPendingAction = useCallback(
    (registration: RegisteredTree) => {
      const pendingAction = pendingActionRef.current;
      if (!pendingAction || !runAction(pendingAction, registration)) return;
      pendingActionRef.current = null;
    },
    [runAction]
  );

  const registerTree = useCallback(
    (
      tree: TreeInstance<WorkspaceResourceEntity>,
      onOpenResource?: (resource: WorkspaceResourceEntity) => void
    ) => {
      const registration = { tree, onOpenResource };
      setTreeRegistration(registration);
      flushPendingAction(registration);
    },
    [flushPendingAction]
  );

  const navigateToResource = useCallback(
    (resourceId: string) => {
      const action = { resourceId, kind: "navigate" } as const;
      if (treeRegistration && runAction(action, treeRegistration)) return;
      pendingActionRef.current = action;
    },
    [runAction, treeRegistration]
  );

  const startRenamingResource = useCallback(
    (resourceId: string) => {
      const action = { resourceId, kind: "rename" } as const;
      if (treeRegistration && runAction(action, treeRegistration)) return;
      pendingActionRef.current = action;
    },
    [runAction, treeRegistration]
  );

  useEffect(() => {
    if (treeRegistration) flushPendingAction(treeRegistration);
  }, [flushPendingAction, resourcesMap, treeRegistration]);

  return useMemo(
    () => ({ registerTree, navigateToResource, startRenamingResource }),
    [registerTree, navigateToResource, startRenamingResource]
  );
}
