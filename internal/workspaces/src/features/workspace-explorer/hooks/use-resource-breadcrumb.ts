import { useMemo } from "react";
import { useWorkspaceResourcesMap } from "../store";
import { getAncestorPath } from "../utils";

export interface BreadcrumbItem {
  id: string;
  isLast: boolean;
  name: string;
  resourceTypeId: string | null;
  schemaVersion: number;
}

export function useResourceBreadcrumb(resourceId: string): BreadcrumbItem[] {
  const resourcesMap = useWorkspaceResourcesMap();

  return useMemo(() => {
    if (!resourceId || !resourcesMap.has(resourceId)) return [];
    const path = getAncestorPath(resourcesMap, resourceId);
    return path.map((entry, index) => ({
      id: entry.id,
      name: entry.item.name ?? "",
      resourceTypeId: entry.item.resource_type_id,
      schemaVersion: entry.item.schema_version ?? 1,
      isLast: index === path.length - 1,
    }));
  }, [resourcesMap, resourceId]);
}
