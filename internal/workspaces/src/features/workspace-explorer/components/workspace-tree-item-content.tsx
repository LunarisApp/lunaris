import type { PluginIconSource } from "@lunarisapp/plugin-sdk";
import { Icon } from "@lunarisapp/ui/components/icon";
import { Input } from "@lunarisapp/ui/components/input";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import type { ItemInstance } from "@lunarisapp/ui/components/tree";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { useTranslation } from "react-i18next";
import { useExtensionRegistry } from "../../extensions";
import {
  isResourceTypeIconLoading,
  resolveWorkspaceResourceIcon,
} from "../types";

export function WorkspaceResourceIcon({
  className,
  isExpanded = false,
  resourceIcon,
  item,
}: {
  className?: string;
  isExpanded?: boolean;
  resourceIcon?: PluginIconSource;
  item: WorkspaceResourceEntity;
}) {
  const extensionRegistry = useExtensionRegistry();
  const resourceIconLoading = isResourceTypeIconLoading({
    enabledExtensionIds: extensionRegistry.enabledExtensionIds,
    extensionAvailability: extensionRegistry.extensionAvailability,
    resourceTypeId: item.resource_type_id,
  });
  const icon = resolveWorkspaceResourceIcon({
    resourceIcon,
    resourceIconLoading,
    isExpanded,
    item,
  });

  if (!icon) {
    return (
      <Spinner
        className={cn("pointer-events-none text-muted-foreground", className)}
      />
    );
  }

  return (
    <Icon
      className={cn("pointer-events-none text-muted-foreground", className)}
      icon={icon}
    />
  );
}

export function WorkspaceTreeItemIcon({
  resourceIcon,
  item,
}: {
  resourceIcon?: PluginIconSource;
  item: ItemInstance<WorkspaceResourceEntity>;
}) {
  const data = item.getItemData();

  return (
    <WorkspaceResourceIcon
      className="size-4"
      isExpanded={item.isExpanded()}
      item={data}
      resourceIcon={resourceIcon}
    />
  );
}

export function WorkspaceTreeItemLabel({
  item,
}: {
  item: ItemInstance<WorkspaceResourceEntity>;
}) {
  const { t } = useTranslation();
  if (typeof item.isRenaming === "function" && item.isRenaming()) {
    return (
      <Input
        {...item.getRenameInputProps()}
        aria-label={t("explorer.renameResource")}
        autoFocus
        className="-my-0.5 h-6 px-1"
      />
    );
  }

  const name = item.getItemName();
  if (!name) {
    return <em className="text-muted-foreground">{t("common.untitled")}</em>;
  }
  return <>{name}</>;
}
