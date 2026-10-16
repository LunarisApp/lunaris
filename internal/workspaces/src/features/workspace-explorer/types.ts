import type {
  PluginIconSource,
  ResourceTypeDefinition,
} from "@lunarisapp/plugin-sdk";
import {
  FileUnknownIcon,
  Folder01Icon,
  Folder02Icon,
  type IconSvgObject,
} from "@lunarisapp/ui/icons";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import type { WorkspaceResourceTrashEntity } from "@repo/data/features/workspace-resources";
import type { ExtensionAvailability } from "../extensions";

export type { WorkspaceResourceEntity };

export type WorkspaceResourcesMap = Map<string, WorkspaceResourceEntity>;
export type ChildrenMap = Map<string | null, WorkspaceResourceEntity[]>;
export type WorkspaceResourceTrashMap = Map<
  string,
  WorkspaceResourceTrashEntity
>;

export function parseResourceIcon(
  item: WorkspaceResourceEntity
): IconSvgObject | undefined {
  if (!item.icon) {
    return undefined;
  }
  try {
    return JSON.parse(item.icon) as IconSvgObject;
  } catch {
    return undefined;
  }
}

export function isFolder(item: WorkspaceResourceEntity): boolean {
  return item.resource_type_id === "lunaris.folder";
}

export function supportsResourceDuplication(
  resource: ResourceTypeDefinition | undefined
): boolean {
  if (!resource) {
    return false;
  }
  return Object.values(resource.storage).every((slot) => slot.kind !== "file");
}

export function isResourceTypeIconLoading({
  enabledExtensionIds,
  extensionAvailability,
  resourceTypeId,
}: {
  enabledExtensionIds: readonly string[];
  extensionAvailability: Readonly<
    Record<string, ExtensionAvailability | undefined>
  >;
  resourceTypeId: string | null;
}): boolean {
  return enabledExtensionIds.some(
    (extensionId) =>
      extensionAvailability[extensionId] === "available" &&
      (resourceTypeId === extensionId ||
        resourceTypeId?.startsWith(`${extensionId}.`))
  );
}

export function resolveWorkspaceResourceIcon({
  resourceIcon,
  resourceIconLoading = false,
  isExpanded = false,
  item,
}: {
  resourceIcon?: PluginIconSource;
  resourceIconLoading?: boolean;
  isExpanded?: boolean;
  item: WorkspaceResourceEntity;
}): PluginIconSource | undefined {
  const customIcon = parseResourceIcon(item);
  if (customIcon) {
    return customIcon;
  }

  if (isFolder(item)) {
    return isExpanded ? Folder02Icon : Folder01Icon;
  }

  if (item.resource_type_id && resourceIconLoading) {
    return resourceIcon;
  }

  return resourceIcon ?? FileUnknownIcon;
}
