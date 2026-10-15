import {
  WORKSPACE_VISIBILITY,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import {
  LOCAL_WORKSPACE_EXTENSIONS_TABLE,
  WORKSPACE_EXTENSIONS_TABLE,
} from "./workspace-extensions/table";
import {
  LOCAL_WORKSPACE_RESOURCES_TABLE,
  WORKSPACE_RESOURCES_TABLE,
} from "./workspace-resources/table";
import {
  LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE,
  WORKSPACE_RESOURCE_TRASH_TABLE,
} from "./workspace-resources/trash-table";
import { LOCAL_WORKSPACES_TABLE, WORKSPACES_TABLE } from "./workspaces/table";
import {
  LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE,
  LOCAL_WORKSPACE_STORAGE_VALUES_TABLE,
  WORKSPACE_STORAGE_SLOTS_TABLE,
  WORKSPACE_STORAGE_VALUES_TABLE,
} from "./workspace-storage-slots/table";
import {
  LOCAL_YJS_DOCUMENT_UPDATES_TABLE,
  LOCAL_YJS_DOCUMENTS_TABLE,
  YJS_DOCUMENT_UPDATES_TABLE,
  YJS_DOCUMENTS_TABLE,
} from "./yjs/table";

export interface WorkspaceScopedTableNames {
  workspaceExtensions: string;
  workspaceResources: string;
  workspaceResourceTrash: string;
  workspaceStorageSlots: string;
  workspaceStorageValues: string;
  workspaces: string;
  yjsDocuments: string;
  yjsDocumentUpdates: string;
}

export const CLOUD_WORKSPACE_TABLES: WorkspaceScopedTableNames = {
  workspaces: WORKSPACES_TABLE,
  workspaceExtensions: WORKSPACE_EXTENSIONS_TABLE,
  workspaceResources: WORKSPACE_RESOURCES_TABLE,
  workspaceResourceTrash: WORKSPACE_RESOURCE_TRASH_TABLE,
  workspaceStorageSlots: WORKSPACE_STORAGE_SLOTS_TABLE,
  workspaceStorageValues: WORKSPACE_STORAGE_VALUES_TABLE,
  yjsDocuments: YJS_DOCUMENTS_TABLE,
  yjsDocumentUpdates: YJS_DOCUMENT_UPDATES_TABLE,
};

export const LOCAL_WORKSPACE_TABLES: WorkspaceScopedTableNames = {
  workspaces: LOCAL_WORKSPACES_TABLE,
  workspaceExtensions: LOCAL_WORKSPACE_EXTENSIONS_TABLE,
  workspaceResources: LOCAL_WORKSPACE_RESOURCES_TABLE,
  workspaceResourceTrash: LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE,
  workspaceStorageSlots: LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE,
  workspaceStorageValues: LOCAL_WORKSPACE_STORAGE_VALUES_TABLE,
  yjsDocuments: LOCAL_YJS_DOCUMENTS_TABLE,
  yjsDocumentUpdates: LOCAL_YJS_DOCUMENT_UPDATES_TABLE,
};

export function resolveWorkspaceScopedTables(
  visibility: WorkspaceVisibility = WORKSPACE_VISIBILITY.shared
): WorkspaceScopedTableNames {
  return visibility === WORKSPACE_VISIBILITY.local
    ? LOCAL_WORKSPACE_TABLES
    : CLOUD_WORKSPACE_TABLES;
}

export function buildUnionAllQuery(
  cloudQuery: string,
  localQuery: string
): string {
  return `${cloudQuery} UNION ALL ${localQuery}`;
}
