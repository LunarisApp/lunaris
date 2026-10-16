import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import {
  getSearchTerms,
  matchesSearchTerms,
  parseSearchQuery,
  type ParsedSearchQuery,
} from "./query";
import type { ResourceSearchResult } from "./types";

const FOLDER_RESOURCE_TYPE_ID = "lunaris.folder";

export interface SearchableWorkspaceResource {
  id: string;
  name?: string | null;
  resource_type_id?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  workspace_slug?: string | null;
  workspace_visibility?: string | null;
}

export interface SearchableResource {
  extensionId?: string;
  name: string;
  pluginId: string;
  resourceId: string;
  resourceTypeName?: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceVisibility: string | null;
}

export interface SearchResourceTypeMetadata {
  extensionId: string;
  name: string;
}

export function getSearchableResources(
  resources: SearchableWorkspaceResource[],
  untitledWorkspaceName = "Untitled",
  resourceTypes: ReadonlyMap<string, SearchResourceTypeMetadata> = new Map()
): SearchableResource[] {
  return resources.flatMap((resource) => {
    if (
      !resource.resource_type_id ||
      resource.resource_type_id === FOLDER_RESOURCE_TYPE_ID
    ) {
      return [];
    }

    const resourceType = resourceTypes.get(resource.resource_type_id);
    return {
      ...(resourceType
        ? {
            extensionId: resourceType.extensionId,
            resourceTypeName: resourceType.name,
          }
        : {}),
      resourceId: resource.id,
      name: resource.name || "Untitled",
      pluginId: resource.resource_type_id,
      workspaceId: resource.workspace_id ?? "",
      workspaceName: resource.workspace_name || untitledWorkspaceName,
      workspaceSlug: resource.workspace_slug ?? "",
      workspaceVisibility: resource.workspace_visibility ?? null,
    };
  });
}

export function matchesResourceFilters(
  resource: SearchableResource,
  query: ParsedSearchQuery
): boolean {
  return (
    matchesSearchTerms(
      [resource.workspaceName, resource.workspaceSlug],
      getSearchTerms(query, "workspace")
    ) &&
    matchesSearchTerms([resource.name], getSearchTerms(query, "title")) &&
    matchesSearchTerms(
      resource.extensionId ? [resource.extensionId] : [],
      getSearchTerms(query, "extension")
    ) &&
    matchesSearchTerms(
      resource.resourceTypeName
        ? [resource.pluginId, resource.resourceTypeName]
        : [resource.pluginId],
      getSearchTerms(query, "resource-type")
    )
  );
}

export function getCloudContentWorkspaceIds(
  resources: SearchableResource[],
  currentWorkspaceId: string
): string[] {
  return [
    ...new Set(
      resources.flatMap((resource) =>
        resource.workspaceId &&
        resource.workspaceId !== currentWorkspaceId &&
        resource.workspaceVisibility !== WORKSPACE_VISIBILITY.local
          ? [resource.workspaceId]
          : []
      )
    ),
  ];
}

export function searchResourcesByTitle(
  resources: SearchableResource[],
  query: string,
  options: { includeAllWhenEmpty?: boolean } = {}
): ResourceSearchResult[] {
  const parsedQuery = parseSearchQuery(query);
  const unscopedTerms = getSearchTerms(parsedQuery, null);
  const titleTerms = getSearchTerms(parsedQuery, "title");
  const resourceFilterTerms = parsedQuery.terms.filter(
    (term) => term.field === "extension" || term.field === "resource-type"
  );
  const workspaceTerms = getSearchTerms(parsedQuery, "workspace");
  const isWorkspaceOnly =
    workspaceTerms.length > 0 &&
    unscopedTerms.length === 0 &&
    titleTerms.length === 0 &&
    resourceFilterTerms.length === 0;
  if (
    (parsedQuery.terms.length === 0 && !options.includeAllWhenEmpty) ||
    isWorkspaceOnly
  ) {
    return [];
  }

  return resources
    .filter(
      (resource) =>
        matchesResourceFilters(resource, parsedQuery) &&
        matchesSearchTerms(resource.name ? [resource.name] : [], unscopedTerms)
    )
    .map((resource) => ({
      id: resource.resourceId,
      type: "resource" as const,
      label: resource.name,
      resourceId: resource.resourceId,
      pluginId: resource.pluginId,
      workspaceId: resource.workspaceId,
      workspaceName: resource.workspaceName,
      workspaceSlug: resource.workspaceSlug,
    }));
}
