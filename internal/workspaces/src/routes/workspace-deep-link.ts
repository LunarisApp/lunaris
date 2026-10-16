import { isLegacyAgentWorkView } from "../features/agent-work/compatibility";
import { AGENT_WORK_TOOL_ID } from "../features/agent-work/constants";
import {
  createPluginSubviewViewInstanceId,
  getViewIdFromInstanceId,
  type RegisteredView,
  type ViewPlacement,
} from "@lunarisapp/plugin-sdk";
import {
  isFolder,
  type WorkspaceResourcesMap,
} from "@repo/workspaces/workspace-explorer";
import {
  getTool,
  type ToolDescriptor,
} from "@repo/workspaces/organization-navigation";
import { getPluginSubviewRoute } from "../extensions/registry";

/**
 * Canonical URL shapes:
 *   `/:organizationSlug/:workspaceSlug/:viewId?`
 *   `/:organizationSlug/:workspaceSlug/:resourceId/:subviewPath/:subviewId`
 *
 *   :viewId starts with legacy "item_" or current "res_" → workspace_resources row
 *   :viewId matches a tool id    → routable tool (e.g. "debugger")
 *   nested resource subview      → allowlisted extension-owned view
 *   :viewId missing / unknown    → workspace root
 *
 * Folders are not addressable: they redirect to the workspace root and the tree
 * is focused on the folder via the workspace-explorer tree navigation context.
 */

const LEGACY_RESOURCE_PREFIX = "item_";
const RESOURCE_PREFIX = "res_";

export function getWorkspacePath(
  organizationSlug: string,
  workspaceSlug: string,
  viewId?: string | null
): string {
  return viewId
    ? `/${organizationSlug}/${workspaceSlug}/${viewId}`
    : `/${organizationSlug}/${workspaceSlug}`;
}

export function getWorkspaceSubviewPath(
  organizationSlug: string,
  workspaceSlug: string,
  resourceId: string,
  subviewPath: string,
  subviewId: string
): string {
  return `${getWorkspacePath(organizationSlug, workspaceSlug, resourceId)}/${subviewPath}/${subviewId}`;
}

export type ViewResolution =
  | { kind: "none" }
  | {
      kind: "resource";
      resourceId: string;
      resourceTypeId: string;
      parentId: string | null;
      title: string;
      schemaVersion: number;
    }
  | { kind: "folder"; resourceId: string }
  | {
      kind: "plugin-subview";
      resourceId: string;
      resourceTitle: string;
      resourceTypeId: string;
      viewId: string;
      subviewId: string;
      subviewPath: string;
      title: string;
      viewInstanceId: string;
    }
  | { kind: "tool"; tool: ToolDescriptor }
  | {
      kind: "view";
      viewId: string;
      extensionId: string;
      placement?: ViewPlacement;
      title: string;
      viewInstanceId: string;
    }
  | { kind: "redirect"; to: string };

interface ResolveWorkspaceViewInput {
  organizationSlug: string;
  resourcesMap: WorkspaceResourcesMap;
  subviewId?: string | null;
  subviewPath?: string | null;
  viewId: string | null | undefined;
  views?: readonly RegisteredView[];
  workspaceSlug: string;
}

export function resolveWorkspaceView({
  resourcesMap,
  organizationSlug,
  workspaceSlug,
  subviewId,
  subviewPath,
  viewId,
  views = [],
}: ResolveWorkspaceViewInput): ViewResolution {
  if (!viewId) {
    return { kind: "none" };
  }
  if (isLegacyAgentWorkView(viewId) && !subviewPath && !subviewId) {
    return {
      kind: "redirect",
      to: getWorkspacePath(organizationSlug, workspaceSlug, AGENT_WORK_TOOL_ID),
    };
  }

  if (subviewPath || subviewId) {
    const item = resourcesMap.get(viewId);
    if (
      !(subviewPath && subviewId && item) ||
      isFolder(item) ||
      !item.resource_type_id
    ) {
      return {
        kind: "redirect",
        to: getWorkspacePath(organizationSlug, workspaceSlug),
      };
    }

    const route = getPluginSubviewRoute(item.resource_type_id, subviewPath);
    if (!route) {
      return {
        kind: "redirect",
        to: getWorkspacePath(organizationSlug, workspaceSlug, item.id),
      };
    }

    return {
      kind: "plugin-subview",
      resourceId: item.id,
      resourceTitle: item.name || "Untitled",
      resourceTypeId: item.resource_type_id,
      viewId: route.viewId,
      subviewId,
      subviewPath,
      title: route.title,
      viewInstanceId: createPluginSubviewViewInstanceId({
        resourceId: item.id,
        path: subviewPath,
        subviewId,
      }),
    };
  }

  if (
    viewId.startsWith(LEGACY_RESOURCE_PREFIX) ||
    viewId.startsWith(RESOURCE_PREFIX)
  ) {
    const item = resourcesMap.get(viewId);
    if (!item) {
      return {
        kind: "redirect",
        to: getWorkspacePath(organizationSlug, workspaceSlug),
      };
    }
    if (isFolder(item)) {
      return { kind: "folder", resourceId: item.id };
    }
    if (!item.resource_type_id) {
      // Resource has neither type nor folder state — redirect to workspace root.
      return {
        kind: "redirect",
        to: getWorkspacePath(organizationSlug, workspaceSlug),
      };
    }
    return {
      kind: "resource",
      resourceId: item.id,
      resourceTypeId: item.resource_type_id,
      parentId: item.parent_id ?? null,
      title: item.name || "Untitled",
      schemaVersion: item.schema_version ?? 1,
    };
  }

  const tool = getTool(viewId);
  if (tool) {
    return { kind: "tool", tool };
  }

  const viewDefinitionId = getViewIdFromInstanceId(viewId);
  const registeredView = views.find(
    ({ definition }) => definition.viewId === viewDefinitionId
  );
  if (registeredView) {
    return {
      kind: "view",
      viewId: registeredView.definition.viewId,
      placement:
        registeredView.definition.target.kind === "standalone"
          ? registeredView.definition.target.launcher?.defaultPlacement
          : undefined,
      extensionId: registeredView.extensionId,
      title: registeredView.definition.name,
      viewInstanceId: viewId,
    };
  }

  return {
    kind: "redirect",
    to: getWorkspacePath(organizationSlug, workspaceSlug),
  };
}
