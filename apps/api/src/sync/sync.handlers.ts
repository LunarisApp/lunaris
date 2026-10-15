import type { DatabaseOrTx } from "@app/db/utils";
import type { AppPermission } from "@repo/auth/permissions";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { workspaceExtensionsHandler } from "./handlers/workspace-extensions.handler";
import { workspaceResourcesHandler } from "./handlers/workspace-resources.handler";
import { workspaceResourceTrashHandler } from "./handlers/workspace-resource-trash.handler";
import { workspaceStorageSlotsHandler } from "./handlers/workspace-storage-slots.handler";
import { workspaceStorageValuesHandler } from "./handlers/workspace-storage-values.handler";
import { workspacesHandler } from "./handlers/workspaces.handler";
import { yjsDocumentUpdatesHandler } from "./handlers/yjs-document-updates.handler";
import { yjsDocumentsHandler } from "./handlers/yjs-documents.handler";

export interface EntityHandler {
  /** Verify org ownership before processing. Throw to reject. */
  authorize: (
    tx: DatabaseOrTx,
    op: "PUT" | "PATCH" | "DELETE",
    id: string,
    data: Record<string, unknown> | undefined,
    organizationId: string,
    userId?: string,
  ) => Promise<void>;
  /** Custom DELETE — if undefined, uses default delete. */
  delete?: (tx: DatabaseOrTx, id: string) => Promise<void>;
  idCol: PgColumn;
  /** Keys that must not be changed after creation (stripped from PATCH data). */
  immutableKeys?: string[];
  /** Custom PATCH — if undefined, uses default update. */
  patch?: (
    tx: DatabaseOrTx,
    id: string,
    mapped: Record<string, unknown>
  ) => Promise<void>;
  permissions: Record<"PUT" | "PATCH" | "DELETE", AppPermission>;
  /** Prepares an audit callback. The callback runs only after commit. */
  prepareAudit?: (
    tx: DatabaseOrTx,
    op: "PUT" | "PATCH" | "DELETE",
    id: string,
    data: Record<string, unknown> | undefined,
    organizationId: string,
    userId?: string,
  ) => Promise<(() => void) | undefined>;
  /** Custom PUT — if undefined, uses default insert. */
  put?: (
    tx: DatabaseOrTx,
    id: string,
    mapped: Record<string, unknown>
  ) => Promise<void>;
  table: PgTable;
  /** Runs after snakeToCamel, before coerceTimestamps. */
  transform?: (mapped: Record<string, unknown>) => void;
}

export { isUniqueViolation } from "@app/db";

export const HANDLERS: Record<string, EntityHandler> = {
  workspaces: workspacesHandler,
  workspace_extensions: workspaceExtensionsHandler,
  workspace_resources: workspaceResourcesHandler,
  workspace_resource_trash: workspaceResourceTrashHandler,
  workspace_storage_slots: workspaceStorageSlotsHandler,
  workspace_storage_values: workspaceStorageValuesHandler,
  yjs_documents: yjsDocumentsHandler,
  yjs_document_updates: yjsDocumentUpdatesHandler,
};
