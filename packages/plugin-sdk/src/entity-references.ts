import type {
  PluginResource,
  PluginResourceSearchResult,
  PluginWorkspaceSummary,
} from "./runtime-context";
import type { ResourceStorageHandles } from "./types";

export type PluginEntityReference =
  | {
      workspaceId: string;
      type: "workspace";
    }
  | {
      resourceId: string;
      workspaceId: string;
      type: "workspace-resource";
    };

export type PluginEntityReferenceKind = "folder" | "workspace" | "resource";

export interface PluginEntityReferenceOption {
  kind: PluginEntityReferenceKind;
  name: string;
  reference: PluginEntityReference;
  resourceTypeId: string | null;
  storage: ResourceStorageHandles;
  workspaceName: string;
}

export interface PluginMentionTrigger {
  end: number;
  query: string;
  start: number;
}

export function entityReferenceKey(reference: PluginEntityReference): string {
  return reference.type === "workspace"
    ? `workspace:${reference.workspaceId}`
    : `workspace-resource:${reference.workspaceId}:${reference.resourceId}`;
}

export function findMentionTrigger(
  text: string,
  caret: number
): PluginMentionTrigger | null {
  const beforeCaret = text.slice(0, caret);
  const match = /(^|[\s([{])@([^\s@]*)$/u.exec(beforeCaret);
  if (!match) {
    return null;
  }

  const query = match[2] ?? "";
  return {
    end: caret,
    query,
    start: beforeCaret.length - query.length - 1,
  };
}

export function insertMention(
  text: string,
  trigger: PluginMentionTrigger,
  name: string
): { caret: number; text: string } {
  const inserted = `@${name} `;
  const suffixStart = text[trigger.end] === " " ? trigger.end + 1 : trigger.end;
  return {
    caret: trigger.start + inserted.length,
    text: `${text.slice(0, trigger.start)}${inserted}${text.slice(suffixStart)}`,
  };
}

function resourceToEntityReferenceOption(
  item: Pick<
    PluginResource,
    "name" | "resourceId" | "resourceTypeId" | "storage"
  >,
  workspace: { id: string; name: string }
): PluginEntityReferenceOption {
  return {
    kind: item.resourceTypeId === "lunaris.folder" ? "folder" : "resource",
    name: item.name?.trim() || "Untitled",
    resourceTypeId: item.resourceTypeId,
    storage: item.storage,
    workspaceName: workspace.name,
    reference: {
      resourceId: item.resourceId,
      workspaceId: workspace.id,
      type: "workspace-resource",
    },
  };
}

export function workspaceResourceToEntityReferenceOption(
  item: PluginResource,
  workspace: { id: string; name: string }
): PluginEntityReferenceOption {
  return resourceToEntityReferenceOption(item, workspace);
}

export function searchResultToEntityReferenceOption(
  item: PluginResourceSearchResult
): PluginEntityReferenceOption {
  return resourceToEntityReferenceOption(item, {
    id: item.workspaceId,
    name: item.workspaceName,
  });
}

export function workspaceToEntityReferenceOption(
  workspace: PluginWorkspaceSummary
): PluginEntityReferenceOption {
  const name = workspace.name?.trim() || "Untitled";
  return {
    kind: "workspace",
    name,
    resourceTypeId: null,
    storage: {},
    workspaceName: name,
    reference: { workspaceId: workspace.id, type: "workspace" },
  };
}

export function uniqueEntityReferenceOptions(
  items: PluginEntityReferenceOption[]
): PluginEntityReferenceOption[] {
  const unique = new Map<string, PluginEntityReferenceOption>();
  for (const item of items) {
    const key = entityReferenceKey(item.reference);
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }
  return [...unique.values()];
}
