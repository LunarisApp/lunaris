import type {
  CommandSearchResult,
  ResourceSearchResult,
  WorkspaceSearchResult,
  RecentFile,
} from "./types";

export interface SearchGroup {
  items: string[];
  name: string;
}

export interface SearchGroupLabels {
  commands: string;
  contentMatches: string;
  recent: string;
  resources: string;
  workspaces: string;
}

export function buildSearchGroups({
  commandResults,
  resourceResults,
  hasRecent,
  isQueryEmpty,
  labels,
  workspaceResults,
  recentFiles,
  uniqueContentResults,
}: {
  commandResults: CommandSearchResult[];
  resourceResults: ResourceSearchResult[];
  hasRecent: boolean;
  isQueryEmpty: boolean;
  labels: SearchGroupLabels;
  workspaceResults: WorkspaceSearchResult[];
  recentFiles: RecentFile[];
  uniqueContentResults: ResourceSearchResult[];
}): SearchGroup[] {
  const groups: SearchGroup[] = [];

  if (isQueryEmpty && hasRecent) {
    groups.push({
      name: labels.recent,
      items: recentFiles.map((file) => `recent-${file.resourceId}`),
    });
  }

  if (workspaceResults.length > 0) {
    groups.push({
      name: labels.workspaces,
      items: workspaceResults.map((result) => result.id),
    });
  }

  if (resourceResults.length > 0) {
    groups.push({
      name: labels.resources,
      items: resourceResults.map((result) => result.id),
    });
  }

  if (uniqueContentResults.length > 0) {
    groups.push({
      name: labels.contentMatches,
      items: uniqueContentResults.map((result) => result.id),
    });
  }

  if (commandResults.length > 0) {
    groups.push({
      name: labels.commands,
      items: commandResults.map((result) => result.id),
    });
  }

  return groups;
}

export function getNextGroupItemValue(
  groups: SearchGroup[],
  selectedValue: string,
  direction: "next" | "previous"
): string | null {
  if (groups.length <= 1) {
    return null;
  }

  let currentGroupIndex = groups.findIndex((group) =>
    group.items.includes(selectedValue)
  );

  if (currentGroupIndex === -1) {
    currentGroupIndex = 0;
  }

  const nextGroupIndex =
    direction === "previous"
      ? (currentGroupIndex - 1 + groups.length) % groups.length
      : (currentGroupIndex + 1) % groups.length;

  return groups[nextGroupIndex]?.items[0] ?? null;
}
