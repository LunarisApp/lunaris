"use client";

import {
  type ResourceTypeDefinition,
} from "@lunarisapp/plugin-sdk";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
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
import type { HTMLAttributes, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAnyPermission } from "@repo/features/permissions";
import { useNavigateToResource, useStartRenamingItem } from "../store";
import { VIRTUAL_ROOT_ID } from "../constants";
import { useAvailableResources } from "../hooks/use-available-resources";
import { useWorkspaceResourceCreation } from "../hooks/use-workspace-resource-creation";
import { WorkspaceTreeSearch } from "./workspace-tree-search";

interface WorkspaceTreeHeaderProps extends HTMLAttributes<HTMLDivElement> {
  onCollapseAll?: () => void;
  onSearchChange: (value: string) => void;
  onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  searchActiveDescendantId?: string;
  searchControlsId?: string;
  searchQuery: string;
  tree?: TreeInstance<WorkspaceResourceEntity>;
}

export function WorkspaceTreeHeader({
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
  const { canCreate, createFolder, createResource } = useWorkspaceResourceCreation();
  const navigateToResource = useNavigateToResource();
  const startRenamingResource = useStartRenamingItem();
  const canMutate = useAnyPermission([
    permission.content.write,
    permission.content.delete,
  ]);
  const getTargetParentId = () => {
    if (!tree) return VIRTUAL_ROOT_ID;

    const selectedItems = tree.getSelectedItems();
    const selectedItem = selectedItems[0];
    if (selectedItems.length === 1 && selectedItem?.isFolder()) {
      return selectedItem.getId();
    }

    return VIRTUAL_ROOT_ID;
  };

  const handleAddItem = async (resource: ResourceTypeDefinition) => {
    const parentId = getTargetParentId();
    const result = await createResource(parentId, resource);
    if (!result) return;

    // PowerSync query results can lag the completed write. Queue both actions
    // until the new resource is available to the tree and its renderer.
    navigateToResource(result.resourceId);
    if (!result.name) startRenamingResource(result.resourceId);
  };

  const resources = useAvailableResources();

  const handleAddFolder = async () => {
    const parentId = getTargetParentId();
    const newId = await createFolder(parentId);
    if (!newId) return;

    startRenamingResource(newId);
  };

  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "icon-lg" : "sm";
  const buttonClass = isMobile ? "size-12 [&_svg]:size-6" : undefined;

  return (
    <div
      className={cn(
        "flex",
        isMobile
          ? "items-center justify-between gap-2 border-t px-3 py-0"
          : "flex-col gap-1 border-b px-2 py-1.5 mb-1.5 @min-[260px]:flex-row @min-[260px]:items-center @min-[260px]:justify-between"
      )}
      {...props}
    >
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
          "flex items-center shrink-0",
          isMobile
            ? "gap-2"
            : "gap-1 justify-around @min-[260px]:justify-end"
        )}
      >
        {!canMutate && (
          <Badge variant="outline">{t("permissions.readOnlyTitle")}</Badge>
        )}
        {canCreate && <ResponsiveDropdownMenu>
          <ResponsiveDropdownMenuTrigger
            aria-label={t("explorer.addFile")}
            render={
              <Button
                className={buttonClass}
                size={buttonSize}
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon icon={FileAddIcon} />
            <span className="sr-only">{t("explorer.addFile")}</span>
          </ResponsiveDropdownMenuTrigger>
          <ResponsiveDropdownMenuContent>
            {resources.map((resource) => (
              <ResponsiveDropdownMenuItem
                key={resource.resourceTypeId}
                onClick={() => handleAddItem(resource)}
              >
                <Icon className="size-4" icon={resource.icon} />
                {resource.name}
              </ResponsiveDropdownMenuItem>
            ))}
          </ResponsiveDropdownMenuContent>
        </ResponsiveDropdownMenu>}
        {canCreate && <Tooltip>
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
        </Tooltip>}
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
