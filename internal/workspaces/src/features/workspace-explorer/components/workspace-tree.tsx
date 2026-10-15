"use client";

import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@lunarisapp/ui/components/context-menu";
import {
  AssistiveTreeDescription,
  Tree,
  TreeDragLine,
} from "@lunarisapp/ui/components/tree";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { useWorkspaceStorageSlots } from "@repo/data/features/workspace-storage-slots";
import { useCurrentWorkspace } from "../../workspace";
import { usePreloadViewport } from "../hooks/use-preload-viewport";
import type { YjsPreloadTarget } from "../hooks/use-preload-visible-resource";
import { log } from "evlog";
import type React from "react";
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useStableInitialLoading } from "@repo/features/sync-status";
import { useOrganizationNavigation } from "../../organization-navigation";
import { TREE_INDENT, VIRTUAL_ROOT_ID } from "../constants";
import { useAvailableResources } from "../hooks/use-available-resources";
import { useDeleteKeyboardShortcut } from "../hooks/use-delete-keyboard-shortcut";
import { useResourceClipboardShortcuts } from "../hooks/use-resource-clipboard-shortcuts";
import { useFilteredResources } from "../hooks/use-filtered-resources";
import { useWorkspaceResourceCreation } from "../hooks/use-workspace-resource-creation";
import { useWorkspaceTree } from "../hooks/use-workspace-tree";
import { useRenameKeyboardShortcut } from "../hooks/use-rename-keyboard-shortcut";
import { useWorkspaceResources, useRegisterTree } from "../store";
import { getDeleteDescriptionI18n } from "../utils";
import { AddFolderMenuItem, AddItemSubmenu } from "./context-menu-config";
import { WorkspaceTreeEmpty } from "./workspace-tree-empty";
import { WorkspaceTreeFlatList } from "./workspace-tree-flat-list";
import { WorkspaceTreeHeader } from "./workspace-tree-header";
import { WorkspaceTreeItem } from "./workspace-tree-item";
import { WorkspaceTreeSkeleton } from "./workspace-tree-skeleton";
import { WorkspaceTrashButton } from "./workspace-trash-button";

export function WorkspaceExplorerTree({
  className,
  footerActions,
  ...props
}: HTMLAttributes<HTMLDivElement> & { footerActions?: ReactNode }) {
  const { t } = useTranslation();
  const { openResource } = useOrganizationNavigation();

  const handleOpenResource = useCallback(
    (item: WorkspaceResourceEntity) => {
      if (!item.resource_type_id) return;
      openResource({
        resourceId: item.id,
        resourceTypeId: item.resource_type_id,
        title: item.name || "Untitled",
        parentId: item.parent_id ?? null,
        schemaVersion: item.schema_version ?? 1,
      });
    },
    [openResource]
  );

  const openResourceById = useCallback(
    (
      resourceId: string,
      resourceTypeId: string,
      title = "",
      schemaVersion = 1,
    ) => {
      openResource({ resourceId, resourceTypeId, title, schemaVersion });
    },
    [openResource]
  );

  const { tree } = useWorkspaceTree({ onOpenResource: handleOpenResource });
  const { canCreate, createFolder, createResource } = useWorkspaceResourceCreation();
  const registerTree = useRegisterTree();
  const resources = useAvailableResources();
  const items = useWorkspaceResources();
  const { showSkeleton, showEmpty } = useStableInitialLoading({
    dataEmpty: items.length === 0,
  });
  const previousDebugSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = JSON.stringify({
      resourceCount: items.length,
      showEmpty,
      showSkeleton,
    });

    if (previousDebugSnapshotRef.current === snapshot) return;
    previousDebugSnapshotRef.current = snapshot;

    log.debug({
      tag: "WorkspaceRouteDebug",
      msg: "workspace explorer tree state changed",
      resourceCount: items.length,
      showEmpty,
      showSkeleton,
    });
  }, [items.length, showEmpty, showSkeleton]);

  const [searchQuery, setSearchQuery] = useState("");
  const treeHotkeyTargetRef = useRef<HTMLDivElement | null>(null);
  const filteredResults = useFilteredResources(searchQuery);
  const isSearching = searchQuery.trim().length > 0;
  const [preloadViewport, setPreloadViewport] = useState<HTMLDivElement | null>(
    null
  );
  const observePreload = usePreloadViewport(preloadViewport);
  const { workspaceId } = useCurrentWorkspace();
  const storageSlots = useWorkspaceStorageSlots(workspaceId);
  const yjsStorageByResource = useMemo(() => {
    const index = new Map<string, YjsPreloadTarget>();
    for (const slot of storageSlots.data) {
      if (
        slot.resource_id &&
        slot.name === "content" &&
        slot.kind === "yjs" &&
        slot.backing_id
      ) {
        index.set(slot.resource_id, {
          storageId: slot.id,
          documentId: slot.backing_id,
        });
      }
    }
    return index;
  }, [storageSlots.data]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchResultsId = useId();
  const activeDescendantId =
    isSearching && activeResultIndex >= 0 && activeResultIndex < filteredResults.length
      ? `${searchResultsId}-option-${activeResultIndex}`
      : undefined;

  // Reset selection to top on a NEW query (not on every PowerSync push that
  // returns a new array with the same matches).
  useEffect(() => {
    setActiveResultIndex(0);
  }, [searchQuery]);

  // Clamp if results shrink below the current selection.
  useEffect(() => {
    setActiveResultIndex((prev) => {
      if (filteredResults.length === 0) return -1;
      if (prev < 0 || prev >= filteredResults.length) return 0;
      return prev;
    });
  }, [filteredResults.length]);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Don't intercept IME composition (CJK candidates).
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      if (!isSearching || filteredResults.length === 0) {
        if (e.key === "Escape" && searchQuery) {
          e.preventDefault();
          setSearchQuery("");
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveResultIndex((i) =>
          Math.min(i + 1, filteredResults.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveResultIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveResultIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveResultIndex(filteredResults.length - 1);
      } else if (e.key === "Enter") {
        const active = filteredResults[activeResultIndex];
        if (active?.resource_type_id) {
          e.preventDefault();
          handleOpenResource(active);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSearchQuery("");
      }
    },
    [
      activeResultIndex,
      filteredResults,
      handleOpenResource,
      isSearching,
      searchQuery,
    ]
  );
  const {
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    itemsToDelete,
    handleConfirmDelete,
  } = useDeleteKeyboardShortcut({ tree, target: treeHotkeyTargetRef });

  const deleteDialogI18n = getDeleteDescriptionI18n(itemsToDelete);
  const deleteDialogDescription = t(
    deleteDialogI18n.key,
    deleteDialogI18n.params
  );
  useRenameKeyboardShortcut({ tree, target: treeHotkeyTargetRef });
  useResourceClipboardShortcuts({ tree, target: treeHotkeyTargetRef });

  // Register tree instance with navigation context so deep-link focus can land.
  useEffect(() => {
    registerTree(tree, handleOpenResource);
  }, [handleOpenResource, registerTree, tree]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      tree.setSelectedItems([]);
    }
  };

  const isMobile = useIsMobile();

  const treeContent = (
    // Target only the rendered tree so sidebar search and other chrome never
    // trigger tree-scoped hotkeys.
    <div className="min-h-0" ref={treeHotkeyTargetRef} tabIndex={-1}>
      <Tree className="gap-1" indent={TREE_INDENT} tree={tree}>
        <AssistiveTreeDescription tree={tree} />
        {tree.getItems().map((item) => (
          <WorkspaceTreeItem
            item={item}
            key={item.getId()}
            observePreload={observePreload}
            yjsStorage={yjsStorageByResource.get(item.getId())}
          />
        ))}
        <TreeDragLine />
      </Tree>
    </div>
  );

  const body = showSkeleton ? (
    <WorkspaceTreeSkeleton />
  ) : showEmpty ? (
    <WorkspaceTreeEmpty />
  ) : (
    treeContent
  );

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "flex h-full",
        isMobile ? "flex-col-reverse" : "@container flex-col",
        className
      )}
      {...props}
    >
      <WorkspaceTreeHeader
        onCollapseAll={() => tree.collapseAll()}
        onOpenResource={openResourceById}
        onSearchChange={setSearchQuery}
        onSearchKeyDown={handleSearchKeyDown}
        searchActiveDescendantId={activeDescendantId}
        searchControlsId={searchResultsId}
        searchQuery={searchQuery}
        tree={tree}
      />
      {isMobile ? (
        <div
          className="flex-1 min-h-0 overflow-y-auto pt-2"
          onClick={handleContainerClick}
          ref={setPreloadViewport}
        >
          {isSearching ? (
            <WorkspaceTreeFlatList
              activeIndex={activeResultIndex}
              listId={searchResultsId}
              onActiveIndexChange={setActiveResultIndex}
              results={filteredResults}
            />
          ) : (
            body
          )}
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger className="min-h-0 flex-1">
            <div
              className="h-full min-h-0 overflow-y-auto"
              onClick={handleContainerClick}
              ref={setPreloadViewport}
            >
              {isSearching ? (
                <WorkspaceTreeFlatList
                  activeIndex={activeResultIndex}
                  listId={searchResultsId}
                  onActiveIndexChange={setActiveResultIndex}
                  results={filteredResults}
                />
              ) : (
                body
              )}
            </div>
          </ContextMenuTrigger>
          {canCreate && <ContextMenuContent>
            <AddItemSubmenu
              resources={resources}
              onAddItem={async (resource) => {
                const resourceTypeId = resource.resourceTypeId;
                const result = await createResource(
                  VIRTUAL_ROOT_ID,
                  resource
                );
                if (!result) return;
                if (!result.name) {
                  setTimeout(
                    () =>
                      tree.getItemInstance(result.resourceId).startRenaming(),
                    0
                  );
                }
                openResourceById(
                  result.resourceId,
                  resourceTypeId,
                  result.name,
                  resource.schema.currentVersion
                );
              }}
            />
            <AddFolderMenuItem
              onAddFolder={async () => {
                const newId = await createFolder(VIRTUAL_ROOT_ID);
                if (!newId) return;
                setTimeout(() => {
                  tree.setSelectedItems([newId]);
                  tree.getItemInstance(newId).expand();
                  tree.getItemInstance(newId).startRenaming();
                }, 0);
              }}
            />
          </ContextMenuContent>}
        </ContextMenu>
      )}
      {!isMobile ? (
        <div
          className="flex shrink-0 items-center justify-between border-t p-1"
          data-testid="workspace-explorer-footer"
        >
          <div data-testid="workspace-explorer-footer-leading">
            <WorkspaceTrashButton />
          </div>
          <div
            className="flex items-center gap-1"
            data-testid="workspace-explorer-footer-trailing"
          >
            {footerActions}
          </div>
        </div>
      ) : null}
      <ConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.continue")}
        description={deleteDialogDescription}
        onConfirm={handleConfirmDelete}
        onOpenChange={setConfirmDeleteOpen}
        open={confirmDeleteOpen}
        title={t("common.areYouSure")}
      />
    </nav>
  );
}
