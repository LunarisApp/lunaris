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
      <span className="flex size-10 items-center justify-center rounded-xl border bg-background text-foreground transition-transform duration-200 group-hover/button:-translate-y-0.5">
        <HugeiconsIcon className="size-5" icon={icon} />
      </span>
      <span className="space-y-1">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="block text-muted-foreground text-xs leading-relaxed">
          {description}
        </span>
      </span>
    </>
  );
}

const launcherCardClassName =
  "h-auto min-h-32 w-full flex-col items-start justify-between gap-5 whitespace-normal rounded-2xl border-border/80 bg-card p-5 text-left hover:border-foreground/20 hover:bg-muted/40 active:scale-[0.99] @min-[480px]:min-h-36";

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
    <div className="@container h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center @min-[480px]:px-8 px-5 py-10">
        <div className="w-full">
          <div className="mb-6 max-w-md space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-xl tracking-tight">
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

          <div
            aria-busy={isPending}
            className="grid @min-[480px]:grid-cols-2 grid-cols-1 gap-3"
          >
            {canCreate && (
              <ResponsiveDropdownMenu>
                <ResponsiveDropdownMenuTrigger
                  disabled={isPending || resources.length === 0}
                  render={
                    <Button
                      className={`${launcherCardClassName} @min-[480px]:col-span-2`}
                      variant="outline"
                    />
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
                className={launcherCardClassName}
                disabled={isPending}
                onClick={handleCreateFolder}
                variant="outline"
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
              className={launcherCardClassName}
              disabled={isPending}
              onClick={handleExploreExtensions}
              variant="outline"
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
