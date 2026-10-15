import {
  getWorkspaceExtensions,
  resolveEnabledWorkspaceExtensionIds,
} from "@repo/data/features/workspace-extensions";

interface PluginLoaderDatabase {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface LoadWorkspacePluginIdsDeps {
  allExtensionIds: readonly string[];
  db: PluginLoaderDatabase;
  defaultExtensionIds?: readonly string[];
  workspaceId: string;
}

/** Read enabled extension IDs without executing extension implementations. */
export async function loadWorkspacePluginIds({
  allExtensionIds,
  defaultExtensionIds = allExtensionIds,
  db,
  workspaceId,
}: LoadWorkspacePluginIdsDeps): Promise<string[]> {
  const rows = await getWorkspaceExtensions(db, workspaceId);
  const enabledIds = resolveEnabledWorkspaceExtensionIds(
    rows,
    defaultExtensionIds,
  );
  return [...enabledIds].filter((id) => allExtensionIds.includes(id));
}
