import { usePluginSdkRuntime } from "@lunarisapp/plugin-sdk/internal";
import { usePowerSync } from "@repo/data/core";
import { readWebMcpFile } from "./webmcp-files";
import { permission } from "@repo/auth/permissions";
import { usePermission } from "@repo/features/permissions";
import { log } from "evlog";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getWebMcpContext,
  registerWorkspaceWebMcp,
  type WebMcpUndoEdit,
  type WebMcpSelection,
} from "./webmcp";

/** Mounted only inside the authorized workspace runtime. No UI or polyfill. */
export function WorkspaceWebMcp() {
  const { contributions, host } = usePluginSdkRuntime();
  const content = host.useLunarisContent();
  const resources = host.useWorkspaceResourcesMap();
  const navigation = host.useOrganizationNavigation();
  const db = usePowerSync();
  const selections = useMemo(
    () => new Map<string, WebMcpSelection>(),
    [content.activeWorkspaceId]
  );
  const canWrite = usePermission(permission.content.write);
  const undoEdits = useMemo(
    () => new Map<string, WebMcpUndoEdit>(),
    [content.activeWorkspaceId]
  );
  const subscribe = useCallback(
    (listener: () => void) => contributions.subscribe(listener),
    [contributions]
  );
  const getSnapshot = useCallback(
    () => contributions.getVersion(),
    [contributions]
  );
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const context = getWebMcpContext(document);
    if (!context) {
      return;
    }
    const controller = new AbortController();
    const enabledPluginIds = new Set(
      contributions.getResourceTypes().map((entry) => entry.extensionId)
    );
    registerWorkspaceWebMcp({
      context,
      content,
      resources,
      selections,
      openResource: (resourceId) => {
        const resource = resources.get(resourceId);
        if (!resource) {
          throw new Error("Resource is unavailable in the active workspace.");
        }
        navigation.openResource({
          ...resource,
          title: resource.name ?? "Untitled",
        });
      },
      readFile: (resourceId) =>
        readWebMcpFile(db, content.activeWorkspaceId, resourceId),
      canWrite,
      undoEdits,
      target: document,
      enabledPluginIds,
      signal: controller.signal,
    }).catch(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        log.warn({ event: "webmcp.registration_failed" });
      }
    });
    return () => controller.abort();
  }, [
    canWrite,
    content,
    contributions,
    db,
    navigation,
    resources,
    selections,
    undoEdits,
    version,
  ]);
  return null;
}
