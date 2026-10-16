import type { PluginManifest, PluginMetadata } from "@lunarisapp/plugin-sdk";
import { usePowerSync, useSyncAccess } from "@repo/data/core";
import {
  startAttachmentQueue,
  stopAttachmentQueue,
} from "@repo/data/features/attachments";
import {
  createFileAttachmentWatcher,
  repairFileAttachmentPointers,
} from "@repo/data/features/files";
import { useApi } from "@repo/features/api";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import { log, parseError } from "evlog";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadWorkspacePluginIds } from "../extensions/host/loader";
import {
  loadPlugin as loadBundledPlugin,
  type PluginLoadResult,
} from "../extensions/registry";

export type WorkspaceRuntimeBootState = "error" | "loading" | "ready";
type WorkspaceRuntimeBootStage =
  | "attachment_queue"
  | "initialize_plugins"
  | "read_plugin_ids";

interface WorkspacePluginLoaders {
  defaultExtensionIds?: readonly string[];
  extensionManifests?: Record<string, PluginManifest>;
  extensionMetadata?: Record<string, PluginMetadata>;
  loadPlugin?: (id: string) => Promise<PluginLoadResult>;
  unloadPlugin?: (id: string) => void;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Failed to open workspace";
}

function logWorkspaceRuntimeBootFailure({
  error,
  workspaceId,
  stage,
}: {
  error: unknown;
  workspaceId: string;
  stage: WorkspaceRuntimeBootStage;
}) {
  log.error({
    action: "workspace_runtime.boot",
    outcome: "failure",
    workspace: { id: workspaceId },
    boot: { stage },
    error: parseError(error),
  });
}

export function markWorkspaceRuntimeReady() {
  globalThis.performance?.mark("lunaris:workspace-runtime-ready");
}

export function useWorkspaceRuntimeController(
  allExtensionIds: readonly string[],
  {
    defaultExtensionIds = allExtensionIds,
    extensionManifests = {},
    extensionMetadata = {},
    loadPlugin = loadBundledPlugin,
    unloadPlugin = () => undefined,
  }: WorkspacePluginLoaders = {}
) {
  const db = usePowerSync();
  const api = useApi();
  const syncAccess = useSyncAccess();
  const { workspaceId } = useCurrentWorkspace();
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootState, setBootState] =
    useState<WorkspaceRuntimeBootState>("loading");
  const [enabledPluginIds, setEnabledPluginIds] = useState<string[] | null>(
    null
  );
  const [retryKey, setRetryKey] = useState(0);
  // Live registry changes reconcile through WorkspacePluginRuntimeProvider.
  // Keep boot inputs current without restarting and disposing the organization.
  const extensionIdsRef = useRef({ allExtensionIds, defaultExtensionIds });
  extensionIdsRef.current = { allExtensionIds, defaultExtensionIds };

  const retryBoot = useCallback(() => {
    setBootError(null);
    setBootState("loading");
    setEnabledPluginIds(null);
    setRetryKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    let cancelled = false;

    setBootError(null);
    setBootState("loading");
    setEnabledPluginIds(null);

    const { allExtensionIds, defaultExtensionIds } = extensionIdsRef.current;
    loadWorkspacePluginIds({
      allExtensionIds,
      defaultExtensionIds,
      db,
      workspaceId,
    })
      .then((ids) => {
        if (!cancelled) {
          setEnabledPluginIds(ids);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          logWorkspaceRuntimeBootFailure({
            error,
            workspaceId,
            stage: "read_plugin_ids",
          });
          setBootError(getErrorMessage(error));
          setBootState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db, workspaceId, retryKey]);

  useEffect(() => {
    if (syncAccess !== "cloud") {
      void stopAttachmentQueue({ db, workspaceId });
      return;
    }
    let cancelled = false;
    repairFileAttachmentPointers({ db, workspaceId })
      .then(() => {
        if (cancelled) {
          return;
        }
        return startAttachmentQueue({
          api,
          db,
          workspaceId,
          watchAttachments: createFileAttachmentWatcher({ db, workspaceId }),
        });
      })
      .catch((error) => {
        if (!cancelled) {
          logWorkspaceRuntimeBootFailure({
            error,
            workspaceId,
            stage: "attachment_queue",
          });
        }
      });
    return () => {
      cancelled = true;
      void stopAttachmentQueue({ db, workspaceId });
    };
  }, [api, db, workspaceId, syncAccess]);

  const reportBootError = useCallback(
    (error: unknown) => {
      logWorkspaceRuntimeBootFailure({
        error,
        workspaceId,
        stage: "initialize_plugins",
      });
      setBootError(getErrorMessage(error));
      setBootState("error");
    },
    [workspaceId]
  );

  const markReady = useCallback(() => {
    markWorkspaceRuntimeReady();
    setBootError(null);
    setBootState("ready");
  }, []);

  return {
    allExtensionIds,
    bootError,
    bootState,
    markReady,
    loadPlugin,
    enabledPluginIds,
    extensionManifests,
    extensionMetadata,
    workspaceId,
    reportBootError,
    retryBoot,
    retryKey,
    unloadPlugin,
  };
}
