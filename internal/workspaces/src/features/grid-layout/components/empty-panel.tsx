"use client";

import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
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
import { useSearchDialogStore } from "../../search/hooks/useSearchDialog";
import { useOrganizationNavigation } from "../../organization-navigation";
import { useCreateRootResource } from "../../workspace-explorer/hooks/use-create-root-resource";

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
  const { createFolder } = useWorkspaceActions();
  const canCreate = usePermission(permission.content.write);
  const startRenamingResource = useStartRenamingItem();
  const { openExplorer, openTool } = useOrganizationNavigation();
  const createRootResource = useCreateRootResource();
  const openResourceCommands = useSearchDialogStore(
    (state) => state.openResourceCommands
  );
  const [isPending, setIsPending] = useState(false);
  const groupId = api.group.id;
  const target = { direction: "within" as const, groupId };

  const handleCreateFile = async (resource: ResourceTypeDefinition) => {
    setIsPending(true);
    try {
      await createRootResource(resource, {
        target,
        onOpened: () => api.close(),
      });
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
              <Button
                aria-haspopup="dialog"
                className={launcherRowClassName}
                disabled={isPending || resources.length === 0}
                onClick={() => openResourceCommands(handleCreateFile)}
                variant="ghost"
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
              </Button>
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
