"use client";

import { Icon } from "@lunarisapp/ui/components/icon";
import { Button } from "@lunarisapp/ui/components/button";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import {
  Alert02Icon,
  BlockGameIcon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import { usePowerSync } from "@repo/data/core";
import { createWorkspaceExtensionsService } from "@repo/data/features/workspace-extensions";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePermission } from "@repo/features/permissions";
import { useCurrentWorkspace } from "../workspace";
import { useExtensionRegistry } from "./extension-registry-context";
import { notifyWorkspaceExtensionsChanged } from "./workspace-extension-change-notification";

export interface ExtensionPlaceholderProps {
  /** Extension ID required by the content but not loaded. */
  extensionId: string;
}

/**
 * Placeholder shown when content requires an unloaded extension.
 * Displays a message and button to enable the required extension.
 */
export function ExtensionPlaceholder({ extensionId }: ExtensionPlaceholderProps) {
  const { t } = useTranslation();
  const {
    allExtensionIds,
    applyRuntimeChange,
    defaultExtensionIds,
    enabledExtensionIds,
    extensionAvailability,
    extensionMetadata,
    runtimeRevisions = {},
  } = useExtensionRegistry();
  const { workspaceId } = useCurrentWorkspace();
  const db = usePowerSync();
  const canWrite = usePermission(permission.content.write);

  const metadata = allExtensionIds.includes(extensionId)
    ? extensionMetadata[extensionId]
    : null;
  const extensionName = metadata
    ? t(`extensions.catalog.${extensionId}.name`, {
        defaultValue: metadata.name,
      })
    : extensionId;
  const availability = metadata
    ? extensionAvailability[extensionId] ?? "unknown-release"
    : null;
  const canEnable = availability === "available";
  const hasError = availability !== null && availability !== "available";
  const extensionIcon = hasError
    ? Alert02Icon
    : metadata?.icon ?? BlockGameIcon;
  const isLoading =
    enabledExtensionIds.includes(extensionId) && availability === "available";

  const handleEnableExtension = useCallback(async () => {
    if (!canWrite) return;

    const service = createWorkspaceExtensionsService(db, workspaceId);
    const initialState = {
      defaultExtensionIds,
      knownExtensionIds: allExtensionIds,
    };
    await service.setEnabled(extensionId, true, initialState);
    const change = {
      enabled: true,
      extensionId,
      operation: "enable" as const,
      workspaceId,
      revision: runtimeRevisions[extensionId],
    };
    notifyWorkspaceExtensionsChanged(change);
    try {
      await applyRuntimeChange?.(change);
    } catch {
      await service.setEnabled(extensionId, false, initialState);
      const rollback = {
        ...change,
        enabled: false,
        operation: "disable" as const,
      };
      notifyWorkspaceExtensionsChanged(rollback);
      await applyRuntimeChange?.(rollback).catch(() => undefined);
      toast.error(t("organization.extensions.saveFailed"));
    }
  }, [
    allExtensionIds,
    applyRuntimeChange,
    canWrite,
    db,
    defaultExtensionIds,
    extensionId,
    workspaceId,
    runtimeRevisions,
    t,
  ]);

  if (isLoading) {
    const loadingLabel = t("extensions.loadingExtension", {
      name: extensionName,
    });

    return (
      <div
        aria-busy="true"
        aria-label={loadingLabel}
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
        role="status"
      >
        <Spinner
          aria-hidden="true"
          className="size-8 text-muted-foreground"
          role="presentation"
        />
        <p className="text-sm text-muted-foreground">{loadingLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <div
        className={
          hasError
            ? "flex size-16 items-center justify-center rounded-full bg-destructive/10"
            : "flex size-16 items-center justify-center rounded-full bg-muted"
        }
      >
        <Icon
          className={
            hasError
              ? "size-8 text-destructive"
              : "size-8 text-muted-foreground"
          }
          icon={extensionIcon}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-medium">
          {t("extensions.extensionRequired")}
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {availability && availability !== "available"
            ? t(`extensions.placeholder.${availability}`, { name: extensionName })
            : t("extensions.extensionRequiredDescription", { name: extensionName })}
        </p>
      </div>
      <Button disabled={!canWrite || !canEnable} onClick={handleEnableExtension}>
        <HugeiconsIcon icon={BlockGameIcon} />
        {canEnable
          ? t("extensions.enableExtension")
          : availability
            ? t(`extensions.availability.${availability}`)
            : t("extensions.notInstalled")}
      </Button>
    </div>
  );
}
