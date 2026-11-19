"use client";

import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import {
  FileAddIcon,
  FolderAddIcon,
  HugeiconsIcon,
  MenuCollapseIcon,
} from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import { permission } from "@repo/auth/permissions";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnyPermission } from "@repo/features/permissions";
import { useStartRenamingItem } from "../store";
import { VIRTUAL_ROOT_ID } from "../constants";
import { useWorkspaceResourceCreation } from "../hooks/use-workspace-resource-creation";
import { WorkspaceTreeSearch } from "./workspace-tree-search";

interface WorkspaceTreeHeaderProps extends HTMLAttributes<HTMLDivElement> {
  mobileActions?: ReactNode;
  onAddResource: (parentId: string) => void;
  onCollapseAll?: () => void;
  onSearchChange: (value: string) => void;
  onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  searchActiveDescendantId?: string;
  searchControlsId?: string;
  searchQuery: string;
  tree?: TreeInstance<WorkspaceResourceEntity>;
}

export function WorkspaceTreeHeader({
  onAddResource,
  mobileActions,
  onCollapseAll,
  tree,
  searchQuery,
  onSearchChange,
  onSearchKeyDown,
  searchControlsId,
  searchActiveDescendantId,
  ...props
}: WorkspaceTreeHeaderProps) {
  const { t } = useTranslation();
  const { canCreate, createFolder } = useWorkspaceResourceCreation();
  const startRenamingResource = useStartRenamingItem();
  const canMutate = useAnyPermission([
    permission.content.write,
    permission.content.delete,
  ]);
  const getTargetParentId = () => {
    if (!tree) {
      return VIRTUAL_ROOT_ID;
    }

    const selectedItems = tree.getSelectedItems();
    const selectedItem = selectedItems[0];
    if (selectedItems.length === 1 && selectedItem?.isFolder()) {
      return selectedItem.getId();
    }

    return VIRTUAL_ROOT_ID;
  };

  const handleAddFolder = async () => {
    const parentId = getTargetParentId();
    const newId = await createFolder(parentId);
    if (!newId) {
      return;
    }

    startRenamingResource(newId);
  };

  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "icon" : "icon-sm";
  const buttonClass = isMobile ? "touch-target" : undefined;

  return (
    <div
      className={cn(
        "flex",
        isMobile
          ? "shrink-0 flex-wrap items-center justify-between gap-2 border-border/60 border-t bg-background pt-2 pr-[calc(1rem+var(--safe-area-right))] pb-[calc(0.5rem+var(--safe-area-bottom))] pl-[calc(1rem+var(--safe-area-left))]"
          : "mb-1.5 @min-[260px]:flex-row flex-col @min-[260px]:items-center @min-[260px]:justify-between gap-1 border-b px-2 py-1.5"
      )}
      {...props}
    >
      {isMobile && mobileActions ? (
        <div className="[&_button]:touch-target flex flex-wrap items-center gap-1">
          {mobileActions}
        </div>
      ) : null}
      {!isMobile && (
        <WorkspaceTreeSearch
          activeDescendantId={searchActiveDescendantId}
          controlsId={searchControlsId}
          onChange={onSearchChange}
          onKeyDown={onSearchKeyDown}
          value={searchQuery}
        />
      )}
      <div
        className={cn(
          "flex shrink-0 items-center",
          isMobile
            ? "ml-auto gap-1"
            : "@min-[260px]:justify-end justify-around gap-1"
        )}
      >
        {!canMutate && (
          <Badge variant="outline">{t("permissions.readOnlyTitle")}</Badge>
        )}
        {!!canCreate && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-haspopup="dialog"
                  aria-label={t("explorer.addFile")}
                  className={buttonClass}
                  onClick={() => onAddResource(getTargetParentId())}
                  size={buttonSize}
                  variant={isMobile ? "default" : "ghost"}
                />
              }
            >
              <HugeiconsIcon icon={FileAddIcon} />
            </TooltipTrigger>
            <TooltipContent>{t("explorer.addFile")}</TooltipContent>
          </Tooltip>
        )}
        {!!canCreate && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className={buttonClass}
                  data-testid="workspace-add-folder"
                  onClick={handleAddFolder}
                  size={buttonSize}
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon icon={FolderAddIcon} />
              <span className="sr-only">{t("explorer.addFolder")}</span>
            </TooltipTrigger>
            <TooltipContent>{t("explorer.addFolder")}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className={buttonClass}
                onClick={onCollapseAll}
                size={buttonSize}
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon icon={MenuCollapseIcon} />
            <span className="sr-only">{t("explorer.collapseAll")}</span>
          </TooltipTrigger>
          <TooltipContent>{t("explorer.collapseAll")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
