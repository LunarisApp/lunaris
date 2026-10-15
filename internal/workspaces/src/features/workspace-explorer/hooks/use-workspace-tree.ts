import { useResourceTypes } from "@lunarisapp/plugin-sdk";
import {
  type DragTarget,
  dragAndDropFeature,
  expandAllFeature,
  type FeatureImplementation,
  hotkeysCoreFeature,
  type ItemInstance,
  isOrderedDragTarget,
  keyboardDragAndDropFeature,
  renamingFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type TreeInstance,
  useTree,
} from "@lunarisapp/ui/components/tree";
import { permission } from "@repo/auth/permissions";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { useCallback, useEffect, useMemo } from "react";
import {
  encodeResourceDragPayload,
  LUNARIS_RESOURCE_DND_MIME,
} from "../../grid-layout/dnd";
import { usePermission } from "@repo/features/permissions";
import { TREE_INDENT, VIRTUAL_ROOT_ID } from "../constants";
import { doubleClickRenameFeature } from "../extensions/double-click-rename-feature";
import {
  useWorkspaceActions,
  useWorkspaceChildrenMap,
  useWorkspaceResourcesMap,
} from "../store";
import { isFolder } from "../types";

export interface UseWorkspaceTreeOptions {
  /**
   * Called when the user activates (primary-action) a non-folder item.
   * The item is passed whole so callers can decide how to open it — this
   * works for every resource type.
   */
  onOpenResource?: (item: WorkspaceResourceEntity) => void;
}

export function isWorkspaceTreeItemVisible(
  item: Pick<WorkspaceResourceEntity, "resource_type_id">,
  hiddenResourceIds: ReadonlySet<string>
): boolean {
  return !item.resource_type_id || !hiddenResourceIds.has(item.resource_type_id);
}

export function isWorkspaceTreeItemOpenable(
  item: WorkspaceResourceEntity
): boolean {
  return !isFolder(item) && Boolean(item.resource_type_id);
}

export function getWorkspaceTreeFeatures(
  canUpdate: boolean
): FeatureImplementation[] {
  return [
    syncDataLoaderFeature,
    hotkeysCoreFeature,
    selectionFeature,
    renamingFeature,
    ...(canUpdate
      ? [
          doubleClickRenameFeature,
          dragAndDropFeature,
          keyboardDragAndDropFeature,
        ]
      : []),
    expandAllFeature,
  ];
}

interface ApplyWorkspaceTreeDropOptions {
  childrenMap: ReturnType<typeof useWorkspaceChildrenMap>;
  draggedItems: ItemInstance<WorkspaceResourceEntity>[];
  moveResource: (
    resourceId: string,
    newParentId: string,
    newPosition: number
  ) => Promise<void>;
  reorderChildren: (
    parentId: string,
    orderedIds: string[]
  ) => Promise<void>;
  target: DragTarget<WorkspaceResourceEntity>;
}

export async function applyWorkspaceTreeDrop({
  childrenMap,
  draggedItems,
  moveResource,
  reorderChildren,
  target,
}: ApplyWorkspaceTreeDropOptions): Promise<void> {
  if (!isOrderedDragTarget(target) && !target.item.isFolder()) return;

  const draggedIds = draggedItems.map((item) => item.getId());
  const draggedIdSet = new Set(draggedIds);
  const targetParentId = target.item.getId();
  const currentChildren = (childrenMap.get(targetParentId) ?? [])
    .map((child) => child.id)
    .filter((id) => !draggedIdSet.has(id));

  const newChildren = [...currentChildren];

  if (isOrderedDragTarget(target)) {
    const insertAt = Math.min(target.insertionIndex, newChildren.length);
    newChildren.splice(insertAt, 0, ...draggedIds);
  } else {
    newChildren.push(...draggedIds);
  }

  const reorderedSourceParents = new Set<string>();

  for (const item of draggedItems) {
    const sourceParentId = item.getParent()?.getId();
    const newPos = newChildren.indexOf(item.getId());

    if (sourceParentId && sourceParentId !== targetParentId) {
      await moveResource(item.getId(), targetParentId, newPos);
    }

    if (sourceParentId && sourceParentId !== targetParentId) {
      reorderedSourceParents.add(sourceParentId);
    }
  }

  for (const sourceParentId of reorderedSourceParents) {
    const sourceChildren = (childrenMap.get(sourceParentId) ?? [])
      .map((child) => child.id)
      .filter((id) => !draggedIdSet.has(id));
    await reorderChildren(sourceParentId, sourceChildren);
  }

  await reorderChildren(targetParentId, newChildren);
}

export function useWorkspaceTree(options: UseWorkspaceTreeOptions = {}): {
  tree: TreeInstance<WorkspaceResourceEntity>;
} {
  const resourcesMap = useWorkspaceResourcesMap();
  const childrenMap = useWorkspaceChildrenMap();
  const resources = useResourceTypes();
  const hiddenResourceIds = useMemo(
    () =>
      new Set(
        resources
          .filter((resource) => resource.hierarchy?.visible === false)
          .map((resourceType) => resourceType.resourceTypeId)
      ),
    [resources]
  );
  const { renameResource, moveResource, reorderChildren } = useWorkspaceActions();
  const canUpdate = usePermission(permission.content.write);
  const { onOpenResource } = options;

  const handleDrop = useCallback(
    async (
      draggedItems: ItemInstance<WorkspaceResourceEntity>[],
      target: DragTarget<WorkspaceResourceEntity>
    ) => {
      await applyWorkspaceTreeDrop({
        childrenMap,
        draggedItems,
        moveResource,
        reorderChildren,
        target,
      });
    },
    [moveResource, reorderChildren, childrenMap]
  );

  const handlePrimaryAction = useCallback(
    (item: ItemInstance<WorkspaceResourceEntity>) => {
      const data = item.getItemData();
      if (isWorkspaceTreeItemOpenable(data) && onOpenResource) {
        onOpenResource(data);
      }
    },
    [onOpenResource]
  );

  const tree = useTree<WorkspaceResourceEntity>({
    canReorder: canUpdate,
    dataLoader: {
      getChildren: (resourceId) =>
        childrenMap
          .get(resourceId)
          ?.filter(
            (child) => isWorkspaceTreeItemVisible(child, hiddenResourceIds)
          )
          .map((child) => child.id) ?? [],
      getItem: (resourceId) => {
        const item = resourcesMap.get(resourceId);
        if (!item) {
          return {
            id: resourceId,
            workspace_id: "",
            name: "",
            icon: null,
            position: 0,
            parent_id: null,
            resource_type_id: null,
            schema_version: 1,
            created_at: "",
            updated_at: "",
          } as WorkspaceResourceEntity;
        }
        return item;
      },
    },
    features: getWorkspaceTreeFeatures(canUpdate),
    getItemName: (item) => item.getItemData().name ?? "",
    indent: TREE_INDENT,
    isItemFolder: (item) => {
      const data = item.getItemData();
      return isFolder(data);
    },
    canRename: () => canUpdate,
    onRename: (item, newName) =>
      canUpdate ? renameResource(item.getId(), newName) : undefined,
    onDrop: handleDrop,
    onPrimaryAction: handlePrimaryAction,
    rootItemId: VIRTUAL_ROOT_ID,
    createForeignDragObject: (items) => {
      const openable = items
        .map((i) => i.getItemData())
        .filter((d) => !isFolder(d) && d.resource_type_id)
        .map((d) => ({
          resourceId: d.id,
          resourceTypeId: d.resource_type_id as string,
          schemaVersion: d.schema_version ?? 1,
          title: d.name ?? "",
        }));
      // NOTE: must always return a valid object — the headless-tree runtime
      // destructures the result unconditionally, so returning undefined throws
      // inside onDragStart and silently breaks the drag. Folders / unopenable
      // items emit a no-op MIME that dockview does not recognise.
      if (openable.length === 0) {
        return { format: "text/plain", data: "" };
      }
      return {
        format: LUNARIS_RESOURCE_DND_MIME,
        data: encodeResourceDragPayload({ v: 3, resources: openable }),
      };
    },
    canDropForeignDragObject: () => false,
  });

  // Rebuild tree when data changes
  useEffect(() => {
    tree.rebuildTree();
  }, [resourcesMap, childrenMap, hiddenResourceIds, tree]);

  return { tree };
}
