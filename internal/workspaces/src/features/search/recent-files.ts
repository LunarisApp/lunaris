import type { RecentFile } from "./types";

export const MAX_RECENT_FILES = 5;
export const STORAGE_KEY_PREFIX = "lunaris:recent-files:";

export function getRecentFilesStorageKey(workspaceId: string): string {
  return `${STORAGE_KEY_PREFIX}${workspaceId}`;
}

function isRecentFile(value: unknown): value is RecentFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const file = value as Partial<RecentFile>;
  return (
    typeof file.resourceId === "string" &&
    typeof file.title === "string" &&
    typeof file.openedAt === "number" &&
    (file.pluginId === undefined || typeof file.pluginId === "string")
  );
}

export function parseRecentFiles(value: string | null): RecentFile[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isRecentFile);
  } catch {
    return [];
  }
}

export function loadRecentFiles(workspaceId: string): RecentFile[] {
  if (typeof window === "undefined") {
    return [];
  }
  return parseRecentFiles(
    localStorage.getItem(getRecentFilesStorageKey(workspaceId))
  );
}

export function saveRecentFiles(
  workspaceId: string,
  files: RecentFile[]
): void {
  try {
    localStorage.setItem(
      getRecentFilesStorageKey(workspaceId),
      JSON.stringify(files)
    );
  } catch {
    // localStorage might be full or unavailable
  }
}

export function addRecentFileToList(
  files: RecentFile[],
  resourceId: string,
  title: string,
  pluginId?: string,
  openedAt = Date.now()
): RecentFile[] {
  const filtered = files.filter((file) => file.resourceId !== resourceId);

  return [{ resourceId, title, pluginId, openedAt }, ...filtered].slice(
    0,
    MAX_RECENT_FILES
  );
}

export function removeRecentFilesFromList(
  files: RecentFile[],
  resourceIds: Iterable<string>
): RecentFile[] {
  const idsToRemove = new Set(resourceIds);
  return files.filter((file) => !idsToRemove.has(file.resourceId));
}

export function filterRecentFilesByValidResources(
  files: RecentFile[],
  validResourceIds?: Set<string>
): RecentFile[] {
  if (!validResourceIds || validResourceIds.size === 0) {
    return files;
  }
  return files.filter((file) => validResourceIds.has(file.resourceId));
}

export function clearRecentFiles(workspaceId: string): void {
  try {
    localStorage.removeItem(getRecentFilesStorageKey(workspaceId));
  } catch {
    // Ignore storage errors
  }
}
