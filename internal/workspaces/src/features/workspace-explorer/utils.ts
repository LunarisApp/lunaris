import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { VIRTUAL_ROOT_ID } from "./constants";
import type { WorkspaceResourcesMap } from "./types";

export interface DeleteTarget {
  id: string;
  name: string;
}

export const UNTITLED_FALLBACK = "Untitled";

export function toDeleteTargetName(name: string | null | undefined): string {
  return name || UNTITLED_FALLBACK;
}

/**
 * Decide which items the delete action operates on given a clicked item and
 * the tree's current selection. If the clicked item is part of a multi-select
 * (> 1 selected and click lands inside the selection), operate on the whole
 * selection. Otherwise operate on only the clicked item.
 */
export function resolveDeleteTargets(
  clickedId: string,
  clickedName: string,
  selected: ReadonlyArray<DeleteTarget>
): DeleteTarget[] {
  const inSelection = selected.some((s) => s.id === clickedId);
  const useSelection = inSelection && selected.length > 1;
  return useSelection
    ? selected.map((s) => ({ id: s.id, name: s.name }))
    : [{ id: clickedId, name: clickedName }];
}

/**
 * Pick the i18n key + params for the delete-confirmation dialog description
 * based on how many items are being deleted.
 */
export function getDeleteDescriptionI18n(
  targets: ReadonlyArray<DeleteTarget>
): { key: string; params: Record<string, unknown> } {
  return targets.length === 1
    ? {
        key: "explorer.deleteConfirmation",
        params: { name: targets[0]?.name ?? "" },
      }
    : {
        key: "explorer.deleteConfirmationMultiple",
        params: { count: targets.length },
      };
}

/**
 * Filter out ids whose ancestor is also in the list — avoids redundant
 * descendant walks when a parent + child are both selected for deletion.
 */
export function filterOutNestedSelections(
  ids: string[],
  resourcesMap: WorkspaceResourcesMap
): string[] {
  const idSet = new Set(ids);
  return [...idSet].filter((id) => {
    const visited = new Set<string>();
    let cur = resourcesMap.get(id)?.parent_id ?? null;
    while (cur) {
      if (visited.has(cur)) break;
      visited.add(cur);
      if (idSet.has(cur)) return false;
      cur = resourcesMap.get(cur)?.parent_id ?? null;
    }
    return true;
  });
}

export function getAncestorPath(
  resourcesMap: WorkspaceResourcesMap,
  resourceId: string
): { id: string; item: WorkspaceResourceEntity }[] {
  const path: { id: string; item: WorkspaceResourceEntity }[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = resourceId;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const item = resourcesMap.get(currentId);
    if (!item) break;

    if (item.id !== VIRTUAL_ROOT_ID) {
      path.unshift({ id: currentId, item });
    }

    currentId = item.parent_id ?? undefined;
  }

  return path;
}
