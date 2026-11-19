"use client";

import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  BlockGameIcon,
  FileAddIcon,
  FolderAddIcon,
  HugeiconsIcon,
  type IconSvgObject,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import type { IDockviewPanelProps } from "dockview";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getResourceCapacityErrorMessageKey } from "@repo/features/entitlements";
import { usePermission } from "@repo/features/permissions";
import {
  useAvailableResources,
  useWorkspaceActions,
  useStartRenamingItem,
  VIRTUAL_ROOT_ID,
} from "../../workspace-explorer";
import { useOrganizationNavigation } from "../../organization-navigation";
import { useGridLayoutStore } from "../context";

function LauncherCardContent({
  description,
  icon,
  title,
}: {
  description: string;
  icon: IconSvgObject;
  title: string;
}) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <HugeiconsIcon className="size-5" icon={icon} />
      </span>
      <span className="min-w-0 space-y-1">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="block text-muted-foreground text-xs leading-relaxed">
          {description}
        </span>
      </span>
    </>
  );
}

const launcherRowClassName =
  "h-auto min-h-16 w-full justify-start gap-4 whitespace-normal px-3 py-3 text-left focus-visible:z-10";

export function GridLayoutEmptyPanel({ api }: IDockviewPanelProps) {
  const { t } = useTranslation();
  const resources = useAvailableResources();
  const { createFolder, createResource } = useWorkspaceActions();
  const canCreate = usePermission(permission.content.write);
  const startRenamingResource = useStartRenamingItem();
  const { openExplorer, openResource, openTool } = useOrganizationNavigation();
  const requestRenameResource = useGridLayoutStore(
    (state) => state.requestRenameResource
  );
  const [isPending, setIsPending] = useState(false);
  const groupId = api.group.id;
  const target = { direction: "within" as const, groupId };

  const handleCreateFile = async (resource: ResourceTypeDefinition) => {
    setIsPending(true);
    try {
      const result = await createResource(VIRTUAL_ROOT_ID, resource);
      if (!result) {
        return;
      }

      openResource({
        resourceId: result.resourceId,
        resourceTypeId: resource.resourceTypeId,
        schemaVersion: resource.schema.currentVersion,
        target,
        title: result.name || t("common.untitled"),
      });
      if (!result.name) {
        requestRenameResource(result.resourceId);
      }
      api.close();
    } catch (error) {
      toast.error(
        t(
          getResourceCapacityErrorMessageKey(
            error,
            "gridLayout.emptyPanel.createFileError"
          )
        )
      );
    } finally {
      setIsPending(false);
    }
  };

  const handleCreateFolder = async () => {
    setIsPending(true);
    try {
      const resourceId = await createFolder(VIRTUAL_ROOT_ID);
      openExplorer();
      startRenamingResource(resourceId);
      api.close();
    } catch (error) {
      toast.error(
        t(
          getResourceCapacityErrorMessageKey(
            error,
            "gridLayout.emptyPanel.createFolderError"
          )
        )
      );
    } finally {
      setIsPending(false);
    }
  };

  const handleExploreExtensions = () => {
    openTool({ target, toolId: "extensions" });
    api.close();
  };

  return (
    <div className="@container h-full overflow-y-auto bg-card">
      <div className="mx-auto flex min-h-full w-full max-w-xl items-center @min-[480px]:px-8 px-5 py-10">
        <div className="w-full">
          <div className="mb-6 max-w-md space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="app-panel-title">
                {t("gridLayout.emptyPanel.heading")}
              </h1>
              {!canCreate && (
                <Badge variant="outline">
                  {t("permissions.readOnlyTitle")}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("gridLayout.emptyPanel.description")}
            </p>
          </div>

          <div aria-busy={isPending} className="grid gap-1 border-y py-2">
            {canCreate && (
              <ResponsiveDropdownMenu>
                <ResponsiveDropdownMenuTrigger
                  disabled={isPending || resources.length === 0}
                  render={
                    <Button className={launcherRowClassName} variant="ghost" />
                  }
                >
                  <LauncherCardContent
                    description={
                      resources.length === 0
                        ? t("gridLayout.emptyPanel.noFileTypes")
                        : t("gridLayout.emptyPanel.createFileDescription")
                    }
                    icon={FileAddIcon}
                    title={t("gridLayout.emptyPanel.createFile")}
                  />
                </ResponsiveDropdownMenuTrigger>
                <ResponsiveDropdownMenuContent
                  align="start"
                  title={t("gridLayout.emptyPanel.chooseFileType")}
                >
                  {resources.map((resource) => (
                    <ResponsiveDropdownMenuItem
                      disabled={isPending}
                      key={resource.resourceTypeId}
                      onClick={() => handleCreateFile(resource)}
                    >
                      <Icon className="size-4" icon={resource.icon} />
                      {resource.name}
                    </ResponsiveDropdownMenuItem>
                  ))}
                </ResponsiveDropdownMenuContent>
              </ResponsiveDropdownMenu>
            )}

            {canCreate && (
              <Button
                className={launcherRowClassName}
                disabled={isPending}
                onClick={handleCreateFolder}
                variant="ghost"
              >
                <LauncherCardContent
                  description={t(
                    "gridLayout.emptyPanel.createFolderDescription"
                  )}
                  icon={FolderAddIcon}
                  title={t("gridLayout.emptyPanel.createFolder")}
                />
              </Button>
            )}

            <Button
              className={launcherRowClassName}
              disabled={isPending}
              onClick={handleExploreExtensions}
              variant="ghost"
            >
              <LauncherCardContent
                description={t(
                  "gridLayout.emptyPanel.exploreExtensionsDescription"
                )}
                icon={BlockGameIcon}
                title={t("gridLayout.emptyPanel.exploreExtensions")}
              />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
