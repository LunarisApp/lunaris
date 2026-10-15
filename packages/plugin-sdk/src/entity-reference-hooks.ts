import { useCallback, useRef } from "react";
import {
  workspaceResourceToEntityReferenceOption,
  workspaceToEntityReferenceOption,
  searchResultToEntityReferenceOption,
  type PluginEntityReferenceOption,
  uniqueEntityReferenceOptions,
} from "./entity-references";
import {
  type PluginLunarisContent,
  type PluginWorkspaceSummary,
  useCurrentWorkspace,
  useLunarisContent,
  useWorkspaceResourcesMap,
} from "./runtime-context";

const DEFAULT_ENTITY_REFERENCE_LIMIT = 8;

async function listAllWorkspaces(
  lunaris: PluginLunarisContent,
  consistency: "cached" | "confirmed"
): Promise<PluginWorkspaceSummary[]> {
  const workspaces: PluginWorkspaceSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await lunaris.listWorkspaces({
      consistency,
      cursor,
      limit: 100,
    });
    workspaces.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return workspaces;
}

function matchesQuery(
  option: PluginEntityReferenceOption,
  query: string
): boolean {
  return !query || option.name.toLocaleLowerCase().includes(query);
}

function compareNames(
  left: PluginEntityReferenceOption,
  right: PluginEntityReferenceOption
): number {
  return left.name.localeCompare(right.name);
}

export function useEntityReferenceSearch(options?: {
  limit?: number;
}): (query: string) => Promise<PluginEntityReferenceOption[]> {
  const limit = options?.limit ?? DEFAULT_ENTITY_REFERENCE_LIMIT;
  const lunaris = useLunarisContent();
  const { workspace, workspaceId } = useCurrentWorkspace();
  const resources = useWorkspaceResourcesMap();
  const workspacesCacheRef = useRef<{
    lunaris: PluginLunarisContent;
    workspaces: PluginWorkspaceSummary[] | null;
    request: Promise<PluginWorkspaceSummary[]> | null;
  } | null>(null);

  const loadWorkspaces = useCallback(() => {
    let cache = workspacesCacheRef.current;
    if (!cache || cache.lunaris !== lunaris) {
      cache = { lunaris, workspaces: null, request: null };
      workspacesCacheRef.current = cache;
    }
    if (cache.workspaces) return Promise.resolve(cache.workspaces);
    if (cache.request) return cache.request;

    const request = listAllWorkspaces(lunaris, "confirmed")
      .catch(() => listAllWorkspaces(lunaris, "cached"))
      .then((workspaces) => {
        cache.workspaces = workspaces;
        return workspaces;
      })
      .finally(() => {
        cache.request = null;
      });
    cache.request = request;
    return request;
  }, [lunaris]);

  return useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      const currentWorkspace = workspaceId
        ? {
            id: workspaceId,
            name: workspace?.name?.trim() || "Current workspace",
          }
        : null;
      const localOptions = currentWorkspace
        ? [...resources.values()]
            .map((item) =>
              workspaceResourceToEntityReferenceOption(item, currentWorkspace)
            )
            .filter((option) => matchesQuery(option, normalizedQuery))
            .sort(compareNames)
        : [];

      if (!normalizedQuery) {
        return uniqueEntityReferenceOptions([
          ...(currentWorkspace
            ? [workspaceToEntityReferenceOption(currentWorkspace)]
            : []),
          ...localOptions,
        ]).slice(0, limit);
      }

      const [workspaces, organizationItems] = await Promise.all([
        loadWorkspaces().catch(() => []),
        lunaris
          .searchResources({ consistency: "confirmed", limit, search: query.trim() })
          .catch(() =>
            lunaris.searchResources({
              consistency: "cached",
              limit,
              search: query.trim(),
            })
          )
          .then((page) => page.items)
          .catch(() => []),
      ]);
      const availableWorkspaces = currentWorkspace
        ? [
            currentWorkspace,
            ...workspaces.filter((candidate) => candidate.id !== workspaceId),
          ]
        : workspaces;
      const workspaceOptions = availableWorkspaces
        .map(workspaceToEntityReferenceOption)
        .filter((option) => matchesQuery(option, normalizedQuery))
        .sort(
          (left, right) =>
            Number(right.reference.workspaceId === workspaceId) -
              Number(left.reference.workspaceId === workspaceId) ||
            compareNames(left, right)
        );
      const organizationOptions = organizationItems.map(
        searchResultToEntityReferenceOption
      );

      return uniqueEntityReferenceOptions([
        ...workspaceOptions,
        ...organizationOptions,
        ...localOptions,
      ]).slice(0, limit);
    },
    [limit, loadWorkspaces, lunaris, workspace?.name, workspaceId, resources]
  );
}
