"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addRecentFileToList,
  clearRecentFiles as clearStoredRecentFiles,
  filterRecentFilesByValidResources,
  loadRecentFiles,
  removeRecentFilesFromList,
  saveRecentFiles,
} from "../recent-files";
import type { RecentFile } from "../types";

/**
 * Standalone function to remove resource IDs from recent files.
 * Can be called outside of React components/hooks.
 * @param workspaceId - The workspace ID
 * @param resourceIds - Array of resource IDs to remove
 */
export function removeRecentFilesByResourceIds(
  workspaceId: string,
  resourceIds: string[]
): void {
  if (typeof window === "undefined" || !workspaceId || resourceIds.length === 0)
    return;
  const current = loadRecentFiles(workspaceId);
  const updated = removeRecentFilesFromList(current, resourceIds);
  if (updated.length !== current.length) {
    saveRecentFiles(workspaceId, updated);
  }
}

/**
 * Standalone function to clear all recent files for a workspace.
 * Call this when a workspace is deleted to remove orphaned localStorage keys.
 * @param workspaceId - The workspace ID
 */
export function clearRecentFilesForWorkspace(workspaceId: string): void {
  if (typeof window === "undefined" || !workspaceId) return;
  clearStoredRecentFiles(workspaceId);
}

// No-op functions for when workspaceId is undefined
const noopAdd = (_resourceId: string, _title: string, _pluginId?: string) => {};
const noopRemove = (_resourceId: string) => {};
const noopClear = () => {};

export interface UseRecentFilesOptions {
  /**
   * Set of valid resource IDs to validate against.
   * If provided, recents with unknown resource IDs are removed on load.
   */
  validResourceIds?: Set<string>;
}

/**
 * Hook for managing recently opened files with localStorage persistence.
 * Tracks up to 5 recent files per workspace.
 * @param workspaceId - The workspace ID to scope recents to. Returns no-ops if undefined.
 * @param options - Optional configuration for validation
 */
export function useRecentFiles(
  workspaceId: string | undefined,
  options?: UseRecentFilesOptions
) {
  const { validResourceIds } = options ?? {};
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  // Load on mount or when workspaceId changes, filtering invalid entries
  useEffect(() => {
    if (!workspaceId) {
      setRecentFiles([]);
      return;
    }

    const loaded = loadRecentFiles(workspaceId);
    const cleaned = filterRecentFilesByValidResources(
      loaded,
      validResourceIds
    );

    if (cleaned.length !== loaded.length) {
      saveRecentFiles(workspaceId, cleaned);
    }
    setRecentFiles(cleaned);
  }, [workspaceId, validResourceIds]);

  const addRecentFile = useCallback(
    (resourceId: string, title: string, pluginId?: string) => {
      if (!workspaceId) return;
      setRecentFiles((current) => {
        const updated = addRecentFileToList(
          current,
          resourceId,
          title,
          pluginId
        );
        saveRecentFiles(workspaceId, updated);
        return updated;
      });
    },
    [workspaceId]
  );

  const removeRecentFile = useCallback(
    (resourceId: string) => {
      if (!workspaceId) return;
      setRecentFiles((current) => {
        const updated = removeRecentFilesFromList(current, [resourceId]);
        saveRecentFiles(workspaceId, updated);
        return updated;
      });
    },
    [workspaceId]
  );

  const clearRecentFiles = useCallback(() => {
    if (!workspaceId) return;
    setRecentFiles([]);
    clearStoredRecentFiles(workspaceId);
  }, [workspaceId]);

  // Return no-ops if no workspaceId
  if (!workspaceId) {
    return {
      recentFiles: [] as RecentFile[],
      addRecentFile: noopAdd,
      removeRecentFile: noopRemove,
      clearRecentFiles: noopClear,
    };
  }

  return {
    recentFiles,
    addRecentFile,
    removeRecentFile,
    clearRecentFiles,
  };
}
