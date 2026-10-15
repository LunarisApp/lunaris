import type { PluginIconSource } from "@lunarisapp/plugin-sdk";

/** Search result categories */
export type SearchCategory =
  | "all"
  | "workspaces"
  | "resources"
  | "content"
  | "commands";

/** Base search result */
export interface SearchResult {
  icon?: PluginIconSource;
  id: string;
  label: string;
}

/** Resource search result */
export interface ResourceSearchResult extends SearchResult {
  pluginId?: string;
  preview?: string;
  previewHighlights?: Array<{ end: number; start: number }>;
  resourceId: string;
  type: "resource";
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
}

/** Workspace search result */
export interface WorkspaceSearchResult extends SearchResult {
  isCurrent: boolean;
  slug: string;
  type: "workspace";
  workspaceId: string;
}

/** Command search result */
export interface CommandSearchResult extends SearchResult {
  action: () => void;
  shortcut?: string;
  type: "command";
}

/** Union of all search result types */
export type SearchResultItem =
  | WorkspaceSearchResult
  | ResourceSearchResult
  | CommandSearchResult;

/** Search dialog state */
export interface SearchDialogState {
  category: SearchCategory;
  isOpen: boolean;
  query: string;
}

/** Search dialog actions */
export interface SearchDialogActions {
  close: () => void;
  open: () => void;
  setCategory: (category: SearchCategory) => void;
  setQuery: (query: string) => void;
  toggle: () => void;
}

/** Combined search dialog store */
export type SearchDialogStore = SearchDialogState & SearchDialogActions;

/** Recent file entry for tracking recently opened resources */
export interface RecentFile {
  openedAt: number;
  pluginId?: string;
  resourceId: string;
  title: string;
}
