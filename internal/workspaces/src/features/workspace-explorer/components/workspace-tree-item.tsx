import {
  type ResourceTypeDefinition,
  useResourceType,
  useView,
} from "@lunarisapp/plugin-sdk";
import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@lunarisapp/ui/components/context-menu";
import {
  type ItemInstance,
  TreeItem,
  TreeItemLabel,
} from "@lunarisapp/ui/components/tree";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { permission } from "@repo/auth/permissions";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { usePlatform } from "@repo/platform";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { toast } from "sonner";
import { getResourceCapacityErrorMessageKey } from "@repo/features/entitlements";
import { usePermission } from "@repo/features/permissions";
import { useCurrentWorkspace } from "../../workspace";
import { useOrganizationNavigation } from "../../organization-navigation";
import { useAvailableResources } from "../hooks/use-available-resources";
import {
  useYjsStorageIntentPreload,
  type YjsPreloadTarget,
} from "../hooks/use-preload-visible-resource";
import { useWorkspaceResourceCreation } from "../hooks/use-workspace-resource-creation";
import { useWorkspaceActions, useWorkspaceResourcesMap } from "../store";
import { isFolder, supportsResourceDuplication } from "../types";
import {
  type DeleteTarget,
  getAncestorPath,
  getDeleteDescriptionI18n,
  resolveDeleteTargets,
  toDeleteTargetName,
} from "../utils";
import {
  MobileWorkspaceTreeItemActions,
  WorkspaceTreeItemContextMenuContent,
} from "./workspace-tree-item-actions";
import {
  WorkspaceTreeItemIcon,
  WorkspaceTreeItemLabel,
} from "./workspace-tree-item-content";

import type { ObservePreloadRow } from "../hooks/use-preload-viewport";

export function WorkspaceTreeItem({
  item,
  yjsStorage,
  observePreload,
}: {
  item: ItemInstance<WorkspaceResourceEntity>;
  yjsStorage?: YjsPreloadTarget;
  observePreload?: ObservePreloadRow;
}) {
  const { t } = useTranslation();
  const { clipboard, navigation } = usePlatform();
  const { deleteResources, duplicateResource } = useWorkspaceActions();
  const { canCreate, createFolder, createResource } =
    useWorkspaceResourceCreation();
  const canDelete = usePermission(permission.content.delete);
  const canUpdate = usePermission(permission.content.write);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[]>([]);
  const resources = useAvailableResources();
  const { openResource } = useOrganizationNavigation();
  const isMobile = useIsMobile();
  const resourcesMap = useWorkspaceResourcesMap();
  const { workspaceId } = useCurrentWorkspace();
  const { organizationSlug, workspaceSlug } = useParams<{
    organizationSlug: string;
    workspaceSlug: string;
  }>();

  const itemData = item.getItemData();
  const resource = useResourceType(itemData.resource_type_id ?? "");
  const canDuplicate =
    canCreate && !isFolder(itemData) && supportsResourceDuplication(resource);
  const defaultView = useView(resource?.defaultViewId ?? "");
  const { ref: preloadRef, ...intentPreloadProps } = useYjsStorageIntentPreload(
    yjsStorage,
    workspaceId,
    defaultView?.definition.preload,
    observePreload
  );

  const handleCopyPath = useCallback(() => {
    const segs = getAncestorPath(resourcesMap, item.getId());
    const path = `/${segs.map((s) => s.item.name).join("/")}`;
    void clipboard.writeText(path);
  }, [clipboard, resourcesMap, item]);

  const handleCopyUrl = useCallback(() => {
    if (!(organizationSlug && workspaceSlug)) {
      return;
    }
    const url = `${navigation.origin()}/${organizationSlug}/${workspaceSlug}/${item.getId()}`;
    void clipboard.writeText(url);
  }, [clipboard, navigation, organizationSlug, workspaceSlug, item]);

  const handleDeleteRequest = () => {
    if (!canDelete) {
      return;
    }
    const tree = item.getTree();
    const selected: DeleteTarget[] = tree.getSelectedItems().map((s) => ({
      id: s.getId(),
      name: toDeleteTargetName(s.getItemName()),
    }));
    const targets = resolveDeleteTargets(
      item.getId(),
      toDeleteTargetName(item.getItemName()),
      selected
    );

    setDeleteTargets(targets);
    setConfirmDeleteOpen(true);
  };

  const handleDuplicate = async () => {
    if (!canCreate) {
      return;
    }
    try {
      await duplicateResource(item.getId(), {
        copyLabel: t("common.copy"),
        trigger: "context-menu",
        untitledLabel: t("common.untitled"),
      });
    } catch (error) {
      toast.error(
        t(
          getResourceCapacityErrorMessageKey(
            error,
            "explorer.failedToCreateResource"
          )
        )
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!canDelete || deleteTargets.length === 0) {
      return;
    }
    const ids = deleteTargets.map((target) => target.id);
    setConfirmDeleteOpen(false);
    setDeleteTargets([]);
    await deleteResources(ids);
  };

  const deleteDescriptionI18n = getDeleteDescriptionI18n(deleteTargets);
  const deleteDescription = t(
    deleteDescriptionI18n.key,
    deleteDescriptionI18n.params
  );

  const handleAddFolder = async () => {
    const newId = await createFolder(item.getId());
    if (!newId) {
      return;
    }

    item.expand();
    setTimeout(() => {
      const tree = item.getTree();
      tree.setSelectedItems([newId]);
      tree.getItemInstance(newId).expand();
      tree.getItemInstance(newId).startRenaming();
    }, 0);
  };

  const handleAddItem = async (resource: ResourceTypeDefinition) => {
    const resourceTypeId = resource.resourceTypeId;
    const result = await createResource(item.getId(), resource);
    if (!result) {
      return;
    }
    item.expand();
    if (!result.name) {
      setTimeout(
        () => item.getTree().getItemInstance(result.resourceId).startRenaming(),
        0
      );
    }
    openResource({
      resourceId: result.resourceId,
      resourceTypeId,
      title: result.name,
      schemaVersion: resource.schema.currentVersion,
    });
  };

  const treeItemContent = (
    <TreeItemLabel>
      <span
        className="flex items-center gap-2 text-nowrap"
        data-workspace-resource-id={item.getId()}
        data-workspace-resource-name={item.getItemName()}
        data-testid="workspace-tree-item"
        ref={preloadRef}
      >
        <WorkspaceTreeItemIcon resourceIcon={resource?.icon} item={item} />
        <WorkspaceTreeItemLabel item={item} />
      </span>
    </TreeItemLabel>
  );

  if (isMobile) {
    return (
      <>
        <TreeItem
          {...intentPreloadProps}
          item={item}
          key={item.getId()}
          render={
            <div className="flex items-center">
              <span className="min-w-0 flex-1">{treeItemContent}</span>
              <MobileWorkspaceTreeItemActions
                canCreate={canCreate}
                canDelete={canDelete}
                canDuplicate={canDuplicate}
                canUpdate={canUpdate}
                resources={resources}
                item={item}
                onAddFolder={handleAddFolder}
                onAddItem={handleAddItem}
                onCopyPath={handleCopyPath}
                onCopyUrl={handleCopyUrl}
                onDelete={handleDeleteRequest}
                onDuplicate={handleDuplicate}
              />
            </div>
          }
        />
        <ConfirmationDialog
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.continue")}
          description={deleteDescription}
          onConfirm={handleConfirmDelete}
          onOpenChange={setConfirmDeleteOpen}
          open={confirmDeleteOpen}
          title={t("common.areYouSure")}
        />
      </>
    );
  }

  return (
    <>
      <ContextMenu>
        <TreeItem
          {...intentPreloadProps}
          item={item}
          key={item.getId()}
          render={<ContextMenuTrigger>{treeItemContent}</ContextMenuTrigger>}
        />
        <WorkspaceTreeItemContextMenuContent
          canCreate={canCreate}
          canDelete={canDelete}
          canDuplicate={canDuplicate}
          canUpdate={canUpdate}
          resources={resources}
          item={item}
          onAddFolder={handleAddFolder}
          onAddItem={handleAddItem}
          onCopyPath={handleCopyPath}
          onCopyUrl={handleCopyUrl}
          onDelete={handleDeleteRequest}
          onDuplicate={handleDuplicate}
        />
      </ContextMenu>
      <ConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.continue")}
        description={deleteDescription}
        onConfirm={handleConfirmDelete}
        onOpenChange={setConfirmDeleteOpen}
        open={confirmDeleteOpen}
        title={t("common.areYouSure")}
      />
    </>
  );
}
