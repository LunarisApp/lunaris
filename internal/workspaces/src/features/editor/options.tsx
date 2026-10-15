import type {
  ResourceCommand,
  ResourceCommandContext,
  ResourceCommandGroup,
  ResourceEnvelope,
  ResourceStorageHandles,
} from "@lunarisapp/plugin-sdk";
import { useResourceCommands, useViews } from "@lunarisapp/plugin-sdk";
import { usePluginSdkRuntime } from "@lunarisapp/plugin-sdk/internal";
import { useResourceStorageSlots } from "@repo/data/features/workspace-storage-slots";
import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import { RenameDialog } from "@lunarisapp/ui/blocks/rename-dialog";
import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuSeparator,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
import { Button } from "@lunarisapp/ui/components/button";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@lunarisapp/ui/components/dropdown-menu";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Edit02Icon,
  HugeiconsIcon,
  MoreHorizontal,
  ScanEyeIcon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import { usePowerSync } from "@repo/data/core";
import { waitForYjsDocumentPersistence } from "@repo/data/features/yjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGridLayoutStore } from "../grid-layout/context";
import { formatHotkeyDisplay } from "@repo/features/hotkeys";
import { usePermission } from "@repo/features/permissions";
import { useWorkspaceActions, useWorkspaceResourcesMap } from "../workspace-explorer";
import {
  useOrganizationNavigation,
  useOrganizationViewState,
} from "../organization-navigation";

interface EditorOptionsProps {
  resource: ResourceEnvelope;
}

function isCommandGroup(
  command: ResourceCommand | ResourceCommandGroup
): command is ResourceCommandGroup {
  return Array.isArray(command.children);
}

export function EditorOptions({ resource }: EditorOptionsProps) {
  const resourceId = resource.resourceId;
  const { t } = useTranslation();
  const commands = useResourceCommands(resource).flatMap(
    ({ definition }) => definition.commands,
  );
  const views = useViews();
  const runtime = usePluginSdkRuntime();
  const db = usePowerSync();
  const fileStorage = runtime.host.useFileStorage();
  const storageSlots = useResourceStorageSlots(resource.resourceId);
  const storage = useMemo(
    () => Object.fromEntries(
      storageSlots.data
        .filter((slot) => slot.name && slot.kind)
        .map((slot) => [slot.name!, { kind: slot.kind!, storageId: slot.id }]),
    ) as ResourceStorageHandles,
    [storageSlots.data],
  );
  const resourceReadContext = runtime.host.useResourceReadContext();
  const { deleteResource, renameResource } = useWorkspaceActions();
  const canDelete = usePermission(permission.content.delete);
  const canUpdate = usePermission(permission.content.write);
  const openRightDockPanel = useGridLayoutStore((state) => state.openRightDockPanel);
  const resourcesMap = useWorkspaceResourcesMap();
  const { clearRenamingResource, openResource, toggleFocusMode } =
    useOrganizationNavigation();
  const { renamingResourceId } = useOrganizationViewState();
  const isMobile = useIsMobile();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [mobileActionGroupId, setMobileActionGroupId] = useState<string | null>(
    null
  );
  const [renameOpen, setRenameOpen] = useState(false);

  const item = resourceId ? resourcesMap.get(resourceId) : undefined;
  const itemName = item?.name || "Untitled";
  const mobileActionGroup = commands.find(
    (command): command is ResourceCommandGroup =>
      command.id === mobileActionGroupId && isCommandGroup(command)
  );
  const commandContext: ResourceCommandContext = {
    resourceReadContext,
    downloadFile: fileStorage.download,
    resourceId: resource.resourceId,
    resourceTypeId: resource.resourceTypeId,
    resourceName: itemName,
    storage,
    openView: ({ viewId, params, titleKey }) => {
      const registered = views.find(
        ({ definition }) => definition.viewId === viewId,
      );
      if (!registered) return;
      const isResourceView = registered.definition.target.kind === "resource";
      openRightDockPanel({
        extensionId: registered.extensionId,
        params: isResourceView
          ? {
              ...params,
              parentId: resource.parentId,
              resourceId: resource.resourceId,
              resourceTypeId: resource.resourceTypeId,
              schemaVersion: resource.schemaVersion,
            }
          : params,
        sourceResourceId: resourceId,
        title: t(titleKey),
        viewId,
      });
    },
    waitForYjsPersistence: async (handle) => {
      const slot = storageSlots.data.find((candidate) => candidate.id === handle.storageId);
      if (!slot?.backing_id || slot.kind !== "yjs") {
        throw new Error("Invalid Yjs storage handle");
      }
      await waitForYjsDocumentPersistence({ db, documentId: slot.backing_id });
    },
  };

  // Open rename dialog when this item is targeted by the global F2 handler
  useEffect(() => {
    if (renamingResourceId && renamingResourceId === resourceId) {
      setRenameOpen(true);
      clearRenamingResource();
    }
  }, [clearRenamingResource, resourceId, renamingResourceId]);

  return (
    <>
      <ResponsiveDropdownMenu
        onOpenChange={(open: boolean) => {
          if (!open) setMobileActionGroupId(null);
        }}
      >
        <ResponsiveDropdownMenuTrigger render={<Button size="icon" variant="ghost" />}>
          <HugeiconsIcon icon={MoreHorizontal} />
          <span className="sr-only">{t("editor.openOptions")}</span>
        </ResponsiveDropdownMenuTrigger>
        <ResponsiveDropdownMenuContent align="end" className="w-56">
          {isMobile && mobileActionGroup ? (
            <>
              <div className="flex items-center gap-2 px-1 py-1">
                <Button
                  aria-label={t("common.back")}
                  onClick={() => setMobileActionGroupId(null)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} />
                </Button>
                <span className="text-sm font-medium">
                  {t(mobileActionGroup.labelKey)}
                </span>
              </div>
              <ResponsiveDropdownMenuSeparator />
              {mobileActionGroup.children.map((action) => (
                <ResponsiveDropdownMenuItem
                  key={action.id}
                  onClick={() => action.onExecute(commandContext)}
                  variant={action.variant}
                >
                  {action.iconElement ??
                    (action.icon ? <HugeiconsIcon icon={action.icon} /> : null)}
                  <span>{t(action.labelKey)}</span>
                </ResponsiveDropdownMenuItem>
              ))}
            </>
          ) : (
            <>
              {resourceId && canUpdate && (
                <ResponsiveDropdownMenuItem
                  onClick={() => setRenameOpen(true)}
                >
                  <HugeiconsIcon icon={Edit02Icon} />
                  <span className="flex-1">{t("common.rename")}</span>
                  {!isMobile && (
                    <span className="text-muted-foreground text-xs">
                      {formatHotkeyDisplay("rename-resource")}
                    </span>
                  )}
                </ResponsiveDropdownMenuItem>
              )}
              {!isMobile && (
                <ResponsiveDropdownMenuItem onClick={toggleFocusMode}>
                  <HugeiconsIcon icon={ScanEyeIcon} />
                  <span className="flex-1">{t("commands.focusMode")}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatHotkeyDisplay("toggle-focus-mode")}
                  </span>
                </ResponsiveDropdownMenuItem>
              )}
              {commands.map((action) => {
                if (isCommandGroup(action)) {
                  if (action.children.length === 0) return null;

                  if (isMobile) {
                    return (
                      <Button
                        aria-haspopup="menu"
                        className="h-auto w-full justify-start gap-3 px-3 py-2.5 font-normal"
                        key={action.id}
                        onClick={() => setMobileActionGroupId(action.id)}
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={action.icon} />
                        <span>{t(action.labelKey)}</span>
                        <HugeiconsIcon
                          className="ml-auto"
                          icon={ArrowRight01Icon}
                        />
                      </Button>
                    );
                  }

                  return (
                    <DropdownMenuSub key={action.id}>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={action.icon} />
                        <span>{t(action.labelKey)}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {action.children.map((child) => (
                          <DropdownMenuItem
                            key={child.id}
                            onClick={() => child.onExecute(commandContext)}
                            variant={child.variant}
                          >
                            {child.iconElement ??
                              (child.icon ? (
                                <HugeiconsIcon icon={child.icon} />
                              ) : null)}
                            <span>{t(child.labelKey)}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                }

                return (
                  <ResponsiveDropdownMenuItem
                    key={action.id}
                    onClick={() => action.onExecute(commandContext)}
                    variant={action.variant}
                  >
                    {action.iconElement ??
                      (action.icon ? <HugeiconsIcon icon={action.icon} /> : null)}
                    <span>{t(action.labelKey)}</span>
                  </ResponsiveDropdownMenuItem>
                );
              })}
              {resourceId && canDelete && (
                <>
                  <ResponsiveDropdownMenuSeparator />
                  <ResponsiveDropdownMenuItem
                    onClick={() => setConfirmDeleteOpen(true)}
                    variant="destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    <span>{t("common.delete")}</span>
                  </ResponsiveDropdownMenuItem>
                </>
              )}
            </>
          )}
        </ResponsiveDropdownMenuContent>
      </ResponsiveDropdownMenu>
      {resourceId && canDelete && (
        <ConfirmationDialog
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.continue")}
          description={t("explorer.deleteConfirmation", { name: itemName })}
          onConfirm={async () => {
            const parent = item?.parent_id
              ? resourcesMap.get(item.parent_id)
              : undefined;
            await deleteResource(resourceId);
            if (parent?.resource_type_id) {
              openResource({
                resourceId: parent.id,
                resourceTypeId: parent.resource_type_id,
                schemaVersion: parent.schema_version ?? 1,
                title: parent.name ?? "Untitled",
              });
            }
            setConfirmDeleteOpen(false);
          }}
          onOpenChange={setConfirmDeleteOpen}
          open={confirmDeleteOpen}
          title={t("common.areYouSure")}
        />
      )}
      {resourceId && canUpdate && (
        <RenameDialog
          cancelLabel={t("common.cancel")}
          initialName={itemName}
          onOpenChange={setRenameOpen}
          onSubmit={(newName) => renameResource(resourceId, newName)}
          open={renameOpen}
          submitLabel={t("common.save")}
          title={t("common.rename")}
        />
      )}
    </>
  );
}
