import { usePowerSync } from "@repo/data/core";
import { log, parseError } from "evlog";
import { useCallback, useRef } from "react";
import { loadWorkspacePluginIds } from "../extensions/host/loader";
import { loadPlugin as loadBundledPlugin } from "../extensions/registry";

interface WorkspacePluginPreloadOptions {
  defaultExtensionIds?: readonly string[];
  loadPlugin?: (id: string) => Promise<unknown>;
}

export function useWorkspacePluginPreload(
  allExtensionIds: readonly string[],
  {
    defaultExtensionIds = allExtensionIds,
    loadPlugin = loadBundledPlugin,
  }: WorkspacePluginPreloadOptions = {},
) {
  const db = usePowerSync();
  const inFlight = useRef(new Map<string, Promise<void>>());

  return useCallback(
    (workspaceId: string) => {
      if (inFlight.current.has(workspaceId)) return;

      const preload = loadWorkspacePluginIds({
        allExtensionIds,
        defaultExtensionIds,
        db,
        workspaceId,
      })
        .then(async (pluginIds) => {
          await Promise.all(pluginIds.map((pluginId) => loadPlugin(pluginId)));
        })
        .catch((error) => {
          log.debug({
            action: "workspace_runtime.preload",
            outcome: "failure",
            workspace: { id: workspaceId },
            error: parseError(error),
          });
        })
        .finally(() => {
          if (inFlight.current.get(workspaceId) === preload) {
            inFlight.current.delete(workspaceId);
          }
        });

      inFlight.current.set(workspaceId, preload);
    },
    [allExtensionIds, db, defaultExtensionIds, loadPlugin],
  );
}
