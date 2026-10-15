"use client";

// Commands
export { COMMANDS, type CommandDefinition, type CommandId } from "./commands";
// Components
export { SearchButton } from "./components/search-button";
export { SearchDialog } from "./components/search-dialog";
export type { CommandAction, CommandActions } from "./hooks/useCommandSearch";
// Hooks & Context
export { useCommandSearch } from "./hooks/useCommandSearch";
export { useResourceContentSearch } from "./hooks/useResourceContentSearch";
export { useResourceSearch } from "./hooks/useResourceSearch";
export { useWorkspaceSearch } from "./hooks/useWorkspaceSearch";
export {
  clearRecentFilesForWorkspace,
  removeRecentFilesByResourceIds,
  useRecentFiles,
} from "./hooks/useRecentFiles";
export {
  SearchProvider,
  useSearchDialog,
  useSearchDialogStore,
} from "./hooks/useSearchDialog";
// Types
export type {
  CommandSearchResult,
  ResourceSearchResult,
  WorkspaceSearchResult,
  RecentFile,
  SearchCategory,
  SearchDialogActions,
  SearchDialogState,
  SearchDialogStore,
  SearchResult,
  SearchResultItem,
} from "./types";
