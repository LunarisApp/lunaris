import { recordActivity } from "../activity/services";
import {
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
} from "@extension/kanban/constants";
import {
  type KanbanCreateTaskOutput,
  type KanbanGetBoardPropertiesOutput,
  type KanbanPropertyValue,
  type KanbanTaskProperties,
  type KanbanUpdateTaskOutput,
  kanbanCreateTaskOperationInputSchema,
  kanbanGetBoardPropertiesOperationInputSchema,
  kanbanUpdateTaskOperationInputSchema,
} from "@extension/kanban/mcp-contract";
import {
  getKanbanBoardProperties,
  kanbanTaskPropertiesIncludePeople,
  KanbanMcpInputError,
  updateKanbanTaskProperties,
} from "@extension/kanban/mcp-runtime";
import { RICH_TEXT_PLUGIN_ID } from "@extension/rich-text/constants";
import {
  type RichTextDocumentOutput,
  richTextGetDocumentOperationInputSchema,
  richTextReadMeOperationInputSchema,
  richTextUpdateDocumentOperationInputSchema,
} from "@extension/rich-text/mcp-contract";
import {
  getRichTextDocument,
  replaceRichTextDocument,
  RICH_TEXT_BLOCK_GUIDE,
  RichTextMcpInputError,
} from "@extension/rich-text/mcp-runtime";
import type { AbstractPowerSyncDatabase } from "@powersync/common";
import type {
  ContentProvenance,
  ContentRequestOptions,
  ContentSnapshot,
  LunarisContentClient,
  Page,
  PaginationInput,
  PendingAwareControlClient,
  PendingContentChanges,
  PendingContentTable,
  Workspace,
  WorkspaceResource,
  WorkspaceResourceFilters,
  WorkspaceResourceSearchInput,
  WorkspaceResourceSearchResult,
  Organization,
  YjsStorageJson,
} from "@repo/agent-contracts";
import { createId } from "@repo/utils";
import { v4 as uuidv4 } from "uuid";
import { Doc, encodeStateAsUpdateV2, encodeStateVector } from "yjs";
import type { DatabaseOrTx } from "../../core/utils";
import { IndexedDbFileStorageAdapter } from "../../storage/indexeddb-file-storage";
import { getFileStorageDatabaseName } from "../attachments";
import { resolveWorkspaceScopedTables } from "../workspace-storage";
import {
  applyYjsDocumentUpdates,
  compileYjsDocumentJson,
  getYjsDocumentUpdates,
} from "../yjs";
import { b64ToUint8Array, Uint8ArrayTob64 } from "../yjs/utils";
import { fingerprintValue } from "./fingerprint";
import { createMutationSafety } from "./mutation-safety";
import {
  type DeviceReadCoordinator,
  type DeviceReadTarget,
  localContentSnapshot,
  mergeContentSnapshots,
} from "./read-coordinator";

const WORKSPACES = `
  SELECT id, name, slug, organization_id, visibility, created_at, updated_at
  FROM workspaces
  UNION ALL
  SELECT id, name, slug, organization_id, visibility, created_at, updated_at
  FROM local_workspaces
`;
const RESOURCES = `
  SELECT resource.id, resource.workspace_id, resource.name, resource.icon,
    resource.position, resource.parent_id, resource.resource_type_id,
    resource.schema_version, resource.created_at, resource.updated_at,
    (SELECT slot.backing_id FROM workspace_storage_slots slot
      WHERE slot.resource_id = resource.id AND slot.name = 'content' AND slot.kind = 'yjs'
      LIMIT 1) AS yjs_backing_id,
    COALESCE((SELECT json_group_object(slot.name, json_object('kind', slot.kind, 'storageId', slot.id))
      FROM workspace_storage_slots slot WHERE slot.resource_id = resource.id), '{}') AS storage
  FROM workspace_resources resource
  WHERE NOT EXISTS (
    SELECT 1 FROM workspace_resource_trash trash WHERE trash.id = resource.id
  )
  UNION ALL
  SELECT resource.id, resource.workspace_id, resource.name, resource.icon,
    resource.position, resource.parent_id, resource.resource_type_id,
    resource.schema_version, resource.created_at, resource.updated_at,
    (SELECT slot.backing_id FROM local_workspace_storage_slots slot
      WHERE slot.resource_id = resource.id AND slot.name = 'content' AND slot.kind = 'yjs'
      LIMIT 1) AS yjs_backing_id,
    COALESCE((SELECT json_group_object(slot.name, json_object('kind', slot.kind, 'storageId', slot.id))
      FROM local_workspace_storage_slots slot WHERE slot.resource_id = resource.id), '{}') AS storage
  FROM local_workspace_resources resource
  WHERE NOT EXISTS (
    SELECT 1 FROM local_workspace_resource_trash trash WHERE trash.id = resource.id
  )
`;
const STORAGE_SLOTS = `
  SELECT id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at
  FROM workspace_storage_slots slot
  WHERE slot.resource_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM workspace_resource_trash trash WHERE trash.id = slot.resource_id
  )
  UNION ALL
  SELECT id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at
  FROM local_workspace_storage_slots slot
  WHERE slot.resource_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM local_workspace_resource_trash trash WHERE trash.id = slot.resource_id
  )
`;
const STORAGE_VALUES = `
  SELECT id, storage_id, workspace_id, key, value, created_at, updated_at
  FROM workspace_storage_values
  UNION ALL
  SELECT id, storage_id, workspace_id, key, value, created_at, updated_at
  FROM local_workspace_storage_values
`;
const DOCUMENTS = `
  SELECT id, workspace_id, created_at, updated_at
  FROM yjs_documents
  UNION ALL
  SELECT id, workspace_id, created_at, updated_at
  FROM local_yjs_documents
`;
const DOCUMENT_UPDATES = `
  SELECT id, document_id, updated_at
  FROM yjs_document_updates
  UNION ALL
  SELECT id, document_id, updated_at
  FROM local_yjs_document_updates
`;
interface WorkspaceRow {
  created_at: string;
  id: string;
  name: string;
  organization_id: string;
  slug: string;
  updated_at: string;
  visibility: Workspace["visibility"];
}

interface ResourceRow {
  created_at: string;
  icon: string | null;
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  resource_type_id: string;
  schema_version: number;
  storage: string;
  updated_at: string;
  workspace_id: string;
  yjs_backing_id: string | null;
}

type PluginOperationRequest = Parameters<
  PendingAwareControlClient["executePluginOperation"]
>[5];

interface DocumentRow {
  id: string;
  last_update_at: string | null;
  updated_at: string;
  workspace_id: string;
}

interface StorageSlotRow {
  backing_id: string | null;
  created_at: string;
  id: string;
  kind: "file" | "key-value" | "yjs";
  metadata: string | null;
  name: string;
  plugin_id: string | null;
  resource_id: string | null;
  updated_at: string;
  workspace_id: string;
}

interface PluginResourceRequirement {
  errorCode: string;
  errorMessage: string;
  pluginId: string;
}

interface PluginYjsDocumentRequirement {
  errorCode: string;
  errorMessage: string;
}

export interface DeviceContentServiceOptions {
  activeOrganizationId?: () => string | null | undefined;
  actorId?: () => string | null | undefined;
  organizationSnapshot?: () => ContentSnapshot;
  organizations?: () => Organization[];
  readCoordinator?: DeviceReadCoordinator;
}

async function withYjsDocument<T>(
  database: DatabaseOrTx,
  documentId: string,
  run: (doc: Doc) => Promise<T> | T
): Promise<T> {
  const updates = await getYjsDocumentUpdates(database, documentId);
  const doc = new Doc();
  try {
    applyYjsDocumentUpdates(doc, updates);
    return await run(doc);
  } finally {
    doc.destroy();
  }
}

export function createDeviceContentClient(
  db: AbstractPowerSyncDatabase,
  options: DeviceContentServiceOptions = {}
): LunarisContentClient {
  const synchronize = (
    target: DeviceReadTarget,
    request?: ContentRequestOptions
  ) =>
    options.readCoordinator?.resolve(target, request) ??
    Promise.resolve(unknownContentSnapshot());
  const synchronizeOrganization = (
    organizationId: string,
    target: DeviceReadTarget,
    request?: ContentRequestOptions
  ) => {
    if (
      options.activeOrganizationId &&
      options.activeOrganizationId() !== organizationId
    ) {
      if (request?.consistency === "cached") {
        return Promise.resolve(unknownContentSnapshot());
      }
      throw incompleteSyncError(
        "Desktop sync is not active for this organization"
      );
    }
    return synchronize(target, request);
  };

  const getWorkspaceRowFor = async (
    organizationId: string,
    workspaceId: string,
    target: DeviceReadTarget,
    request?: ContentRequestOptions
  ) => {
    requireCachedOrganization(options, organizationId);
    const local = await db.getOptional<WorkspaceRow>(
      "SELECT * FROM local_workspaces WHERE id = ? AND organization_id = ? LIMIT 1",
      [workspaceId, organizationId]
    );
    if (local) {
      return { row: local, snapshot: localContentSnapshot() };
    }
    const snapshot = await synchronizeOrganization(
      organizationId,
      target,
      request
    );
    const shared = await db.getOptional<WorkspaceRow>(
      "SELECT * FROM workspaces WHERE id = ? AND organization_id = ? LIMIT 1",
      [workspaceId, organizationId]
    );
    if (!shared) {
      throw missingReadError(
        "WORKSPACE_NOT_FOUND",
        "Workspace not found",
        request,
        snapshot
      );
    }
    return { row: shared, snapshot };
  };

  const getWorkspaceRow = (
    organizationId: string,
    workspaceId: string,
    request?: ContentRequestOptions
  ) =>
    getWorkspaceRowFor(
      organizationId,
      workspaceId,
      { kind: "workspaces" },
      request
    );

  const getIndexedWorkspaceRow = async (
    organizationId: string,
    workspaceId: string,
    request?: ContentRequestOptions
  ) =>
    getWorkspaceRowFor(
      organizationId,
      workspaceId,
      { kind: "organization-resources" },
      request
    );

  const getWorkspaceContent = async (
    organizationId: string,
    workspaceId: string,
    request?: ContentRequestOptions
  ) => {
    const workspace = await getWorkspaceRow(
      organizationId,
      workspaceId,
      request
    );
    if (workspace.row.visibility === "local") {
      return workspace;
    }
    const contentSnapshot = await synchronizeOrganization(
      organizationId,
      { kind: "workspace-content", workspaceId },
      request
    );
    return {
      row: workspace.row,
      snapshot: mergeContentSnapshots(workspace.snapshot, contentSnapshot),
    };
  };

  const getDocument = async (
    organizationId: string,
    workspaceId: string,
    documentId: string,
    request?: ContentRequestOptions
  ) => {
    const workspace = await getWorkspaceContent(
      organizationId,
      workspaceId,
      request
    );
    const document = await db.getOptional<DocumentRow>(
      `SELECT documents.*, MAX(updates.updated_at) AS last_update_at
         FROM (${DOCUMENTS}) documents
         LEFT JOIN (${DOCUMENT_UPDATES}) updates ON updates.document_id = documents.id
         WHERE documents.id = ? AND documents.workspace_id = ?
         GROUP BY documents.id, documents.workspace_id, documents.created_at, documents.updated_at
         LIMIT 1`,
      [documentId, workspaceId]
    );
    if (!document) {
      throw missingReadError(
        "DOCUMENT_NOT_FOUND",
        "Document not found",
        request,
        workspace.snapshot
      );
    }
    const compiled = await compileYjsDocumentJson(db, documentId);
    const data =
      compiled && typeof compiled === "object" && !Array.isArray(compiled)
        ? (compiled as Record<string, unknown>)
        : { $root: compiled };
    const revision = await fingerprintValue(data);
    return {
      data,
      document,
      workspace: workspace.row,
      revision,
      snapshot: workspace.snapshot,
      updatedAt: latestTimestamp(document.updated_at, document.last_update_at),
    };
  };

  const resolveResourceStorage = async (
    organizationId: string,
    workspaceId: string,
    storageId: string,
    kind: StorageSlotRow["kind"],
    request?: ContentRequestOptions
  ) => {
    const workspace = await getWorkspaceContent(
      organizationId,
      workspaceId,
      request
    );
    const slot = await db.getOptional<StorageSlotRow>(
      `SELECT * FROM (${STORAGE_SLOTS}) slot
       WHERE id = ? AND workspace_id = ? AND kind = ? AND resource_id IS NOT NULL
       LIMIT 1`,
      [storageId, workspaceId, kind]
    );
    if (!slot?.resource_id || (kind !== "key-value" && !slot.backing_id)) {
      throw missingReadError(
        "STORAGE_NOT_FOUND",
        `${kind} storage not found`,
        request,
        workspace.snapshot
      );
    }
    const resource = await requireResourceRow(
      db,
      workspaceId,
      slot.resource_id,
      request,
      workspace.snapshot
    );
    return { workspace, resource, slot };
  };

  const client: LunarisContentClient = {
    async listWorkspaces(organizationId, input: PaginationInput = {}, request) {
      requireCachedOrganization(options, organizationId);
      const snapshot = await synchronizeOrganization(
        organizationId,
        { kind: "workspaces" },
        request
      );
      const rows = await db.getAll<WorkspaceRow>(
        `SELECT * FROM (${WORKSPACES}) workspaces WHERE organization_id = ? ORDER BY updated_at DESC, id ASC`,
        [organizationId]
      );
      return page(
        rows.map(toWorkspace),
        input,
        (row) => withWorkspaceProvenance(row, snapshot),
        snapshot
      );
    },

    async getWorkspace(organizationId, workspaceId, request) {
      const workspace = await getWorkspaceRow(
        organizationId,
        workspaceId,
        request
      );
      return withWorkspaceProvenance(
        toWorkspace(workspace.row),
        workspace.snapshot
      );
    },

    async listWorkspaceResources(
      organizationId,
      workspaceId,
      input: WorkspaceResourceFilters = {},
      request
    ) {
      const workspace = await getIndexedWorkspaceRow(
        organizationId,
        workspaceId,
        request
      );
      const rows = await db.getAll<ResourceRow>(
        `SELECT * FROM (${RESOURCES}) items WHERE workspace_id = ? ORDER BY position ASC, created_at ASC, id ASC`,
        [workspaceId]
      );
      const filtered = rows.filter((row) => {
        if (
          input.name &&
          !row.name.toLocaleLowerCase().includes(input.name.toLocaleLowerCase())
        ) {
          return false;
        }
        if (
          input.resourceTypeId &&
          row.resource_type_id !== input.resourceTypeId
        ) {
          return false;
        }
        if (input.parentId !== undefined && row.parent_id !== input.parentId) {
          return false;
        }
        return true;
      });
      return page(
        filtered.map(toResource),
        input,
        (row) => ({
          ...row,
          provenance: contentProvenance(
            workspace.row.visibility,
            row.updatedAt,
            workspace.snapshot
          ),
        }),
        workspace.snapshot
      );
    },

    async getWorkspaceResource(
      organizationId,
      workspaceId,
      resourceId,
      request
    ) {
      const workspace = await getIndexedWorkspaceRow(
        organizationId,
        workspaceId,
        request
      );
      const row = await requireResourceRow(
        db,
        workspaceId,
        resourceId,
        request,
        workspace.snapshot
      );
      const item = toResource(row);
      return {
        ...item,
        provenance: contentProvenance(
          workspace.row.visibility,
          item.updatedAt,
          workspace.snapshot
        ),
      };
    },

    async searchResources(
      organizationId,
      input: WorkspaceResourceSearchInput,
      request
    ) {
      requireCachedOrganization(options, organizationId);
      const snapshot = input.workspaceId
        ? (
            await getIndexedWorkspaceRow(
              organizationId,
              input.workspaceId,
              request
            )
          ).snapshot
        : await synchronizeOrganization(
            organizationId,
            { kind: "organization-resources" },
            request
          );
      const workspaces = await db.getAll<WorkspaceRow>(
        `SELECT * FROM (${WORKSPACES}) workspaces WHERE organization_id = ?`,
        [organizationId]
      );
      const byId = new Map(
        workspaces.map((workspace) => [workspace.id, workspace])
      );
      const rows = await db.getAll<ResourceRow>(
        `SELECT * FROM (${RESOURCES}) items ORDER BY name ASC, id ASC`,
        []
      );
      const needle = input.search.toLocaleLowerCase();
      const results = rows
        .filter((row) => {
          const workspace = byId.get(row.workspace_id);
          return (
            workspace &&
            (!input.workspaceId || row.workspace_id === input.workspaceId) &&
            (row.name.toLocaleLowerCase().includes(needle) ||
              workspace.name.toLocaleLowerCase().includes(needle))
          );
        })
        .map((row): WorkspaceResourceSearchResult => {
          const workspace = byId.get(row.workspace_id)!;
          return {
            ...toResource(row),
            workspaceName: workspace.name,
            provenance: contentProvenance(
              workspace.visibility,
              row.updated_at,
              snapshot
            ),
          };
        });
      return page(results, input, undefined, snapshot);
    },

    async getYjsStorageJson(
      organizationId,
      workspaceId,
      storageId,
      request
    ): Promise<YjsStorageJson> {
      const storage = await resolveResourceStorage(
        organizationId,
        workspaceId,
        storageId,
        "yjs",
        request
      );
      const value = await getDocument(
        organizationId,
        workspaceId,
        storage.slot.backing_id!,
        request
      );
      return {
        resourceTypeId: storage.resource.resource_type_id,
        data: value.data,
        resourceId: storage.resource.id,
        provenance: contentProvenance(
          value.workspace.visibility,
          value.updatedAt,
          value.snapshot
        ),
        revision: value.revision,
        storageId,
        updatedAt: value.updatedAt,
      };
    },
  };

  return client;
}

export function createDeviceControlClient(
  db: AbstractPowerSyncDatabase,
  options: DeviceContentServiceOptions = {}
): PendingAwareControlClient {
  const content = createDeviceContentClient(db, options);
  const safety = createMutationSafety(
    db,
    () => options.actorId?.() ?? "desktop-local"
  );

  const cloudRequired = async (): Promise<never> => {
    throw localError(
      "CLOUD_UNAVAILABLE",
      "Cloud connectivity is required for this operation",
      503
    );
  };
  const requireWorkspace = async (
    organizationId: string,
    workspaceId: string,
    request?: ContentRequestOptions,
    database: DatabaseOrTx = db
  ) => {
    requireCachedOrganization(options, organizationId);
    const local = await database.getOptional<WorkspaceRow>(
      "SELECT * FROM local_workspaces WHERE id = ? AND organization_id = ? LIMIT 1",
      [workspaceId, organizationId]
    );
    if (local) {
      return { row: local, snapshot: localContentSnapshot() };
    }
    if (
      options.activeOrganizationId &&
      options.activeOrganizationId() !== organizationId
    ) {
      if (request?.consistency !== "cached") {
        throw incompleteSyncError(
          "Desktop sync is not active for this organization"
        );
      }
      const workspace = await database.getOptional<WorkspaceRow>(
        "SELECT * FROM workspaces WHERE id = ? AND organization_id = ? LIMIT 1",
        [workspaceId, organizationId]
      );
      if (!workspace) {
        throw incompleteSyncError(
          "Required Desktop content has not finished syncing"
        );
      }
      return { row: workspace, snapshot: unknownContentSnapshot() };
    }
    const catalogSnapshot =
      (await options.readCoordinator?.resolve(
        { kind: "workspaces" },
        request
      )) ?? unknownContentSnapshot();
    const workspace = await database.getOptional<WorkspaceRow>(
      "SELECT * FROM workspaces WHERE id = ? AND organization_id = ? LIMIT 1",
      [workspaceId, organizationId]
    );
    if (!workspace) {
      throw missingReadError(
        "WORKSPACE_NOT_FOUND",
        "Workspace not found",
        request,
        catalogSnapshot
      );
    }
    const contentSnapshot =
      (await options.readCoordinator?.resolve(
        { kind: "workspace-content", workspaceId },
        request
      )) ?? unknownContentSnapshot();
    return {
      row: workspace,
      snapshot: mergeContentSnapshots(catalogSnapshot, contentSnapshot),
    };
  };
  const requireRevision = (actual: string, expected: string) => {
    if (actual !== expected) {
      throw localError(
        "REVISION_CHANGED",
        "Resource changed since it was read",
        409
      );
    }
  };
  const requirePluginResource = async (
    database: DatabaseOrTx,
    workspaceId: string,
    resourceId: string,
    request: ContentRequestOptions | undefined,
    snapshot: ContentSnapshot,
    requirement: PluginResourceRequirement
  ) => {
    const item = await requireResourceRow(
      database,
      workspaceId,
      resourceId,
      request,
      snapshot
    );
    if (
      item.resource_type_id !== requirement.pluginId ||
      !item.yjs_backing_id
    ) {
      throw localError(requirement.errorCode, requirement.errorMessage, 404);
    }
    return { ...item, yjsBackingId: item.yjs_backing_id };
  };
  const requireKanbanBoard = (
    database: DatabaseOrTx,
    workspaceId: string,
    boardId: string,
    request: ContentRequestOptions | undefined,
    snapshot: ContentSnapshot
  ) =>
    requirePluginResource(database, workspaceId, boardId, request, snapshot, {
      errorCode: "KANBAN_BOARD_NOT_FOUND",
      errorMessage: "Kanban board not found",
      pluginId: KANBAN_PLUGIN_ID,
    });
  const requireRichTextResource = (
    database: DatabaseOrTx,
    workspaceId: string,
    documentResourceId: string,
    request: ContentRequestOptions | undefined,
    snapshot: ContentSnapshot
  ) =>
    requirePluginResource(
      database,
      workspaceId,
      documentResourceId,
      request,
      snapshot,
      {
        errorCode: "RICH_TEXT_DOCUMENT_NOT_FOUND",
        errorMessage: "Rich Text document not found",
        pluginId: RICH_TEXT_PLUGIN_ID,
      }
    );
  const requirePluginYjsDocument = async (
    database: DatabaseOrTx,
    workspaceId: string,
    documentId: string,
    requirement: PluginYjsDocumentRequirement
  ) => {
    const document = await database.getOptional<{
      id: string;
      updated_at: string;
    }>(
      `SELECT id, updated_at FROM (${DOCUMENTS}) documents
       WHERE id = ? AND workspace_id = ?
       LIMIT 1`,
      [documentId, workspaceId]
    );
    if (!document) {
      throw localError(requirement.errorCode, requirement.errorMessage, 404);
    }
    return document;
  };
  const persistYjsUpdate = async (
    database: DatabaseOrTx,
    params: {
      documentId: string;
      workspaceId: string;
      updateB64: string;
      updatedAt?: string;
      visibility: Parameters<typeof resolveWorkspaceScopedTables>[0];
    }
  ) => {
    const updatedAt = params.updatedAt ?? new Date().toISOString();
    const tables = resolveWorkspaceScopedTables(params.visibility);
    await database.execute(
      `INSERT INTO ${tables.yjsDocumentUpdates}
       (id, document_id, workspace_id, user_id, update_b64, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        params.documentId,
        params.workspaceId,
        options.actorId?.() ?? null,
        params.updateB64,
        updatedAt,
        updatedAt,
      ]
    );
    await database.execute(
      `UPDATE ${tables.yjsDocuments} SET updated_at = ? WHERE id = ? AND julianday(?) > COALESCE(julianday(updated_at), 0)`,
      [updatedAt, params.documentId, updatedAt]
    );
    await recordActivity(
      database,
      { documentId: params.documentId },
      updatedAt
    );
    return updatedAt;
  };
  const replaceRichTextBlocks = async (
    doc: Doc,
    blocks: Parameters<typeof replaceRichTextDocument>[1]
  ) => {
    try {
      return await replaceRichTextDocument(doc, blocks);
    } catch (error) {
      if (error instanceof RichTextMcpInputError) {
        throw localError(error.code, error.message, error.status);
      }
      throw error;
    }
  };
  const readRichTextGuide = async (
    organizationId: string,
    workspaceId: string,
    operationInput: Record<string, unknown>,
    request: PluginOperationRequest
  ) => {
    const parsed = richTextReadMeOperationInputSchema.safeParse(operationInput);
    if (!parsed.success) {
      throw localError(
        "INVALID_RICH_TEXT_GUIDE_REQUEST",
        "Invalid Rich Text guide request",
        400
      );
    }
    await requireWorkspace(organizationId, workspaceId, request);
    return { guide: RICH_TEXT_BLOCK_GUIDE };
  };
  const readRichTextDocument = async (
    organizationId: string,
    workspaceId: string,
    operationInput: Record<string, unknown>,
    request: PluginOperationRequest
  ): Promise<RichTextDocumentOutput> => {
    const parsed =
      richTextGetDocumentOperationInputSchema.safeParse(operationInput);
    if (!parsed.success) {
      throw localError(
        "INVALID_RICH_TEXT_DOCUMENT_REQUEST",
        "Invalid Rich Text document request",
        400
      );
    }
    const workspace = await requireWorkspace(
      organizationId,
      workspaceId,
      request
    );
    const item = await requireRichTextResource(
      db,
      workspaceId,
      parsed.data.documentResourceId,
      request,
      workspace.snapshot
    );
    const document = await requirePluginYjsDocument(
      db,
      workspaceId,
      item.yjsBackingId,
      {
        errorCode: "RICH_TEXT_DOCUMENT_CONTENT_NOT_FOUND",
        errorMessage: "Rich Text document content not found",
      }
    );
    return withYjsDocument(db, document.id, async (doc) => ({
      documentResourceId: item.id,
      ...(await getRichTextDocument(doc)),
      revision: document.updated_at,
    }));
  };
  const updateRichTextDocument = async (
    organizationId: string,
    workspaceId: string,
    operationInput: Record<string, unknown>,
    request: PluginOperationRequest
  ): Promise<RichTextDocumentOutput> => {
    const parsed =
      richTextUpdateDocumentOperationInputSchema.safeParse(operationInput);
    if (!parsed.success) {
      throw localError(
        "INVALID_RICH_TEXT_DOCUMENT_UPDATE",
        "Invalid Rich Text document update",
        400
      );
    }
    const input = parsed.data;
    return safety.idempotent<RichTextDocumentOutput>(
      `${RICH_TEXT_PLUGIN_ID}:update_document`,
      request?.idempotencyKey,
      { input, pluginId: RICH_TEXT_PLUGIN_ID, workspaceId, organizationId },
      async (database) => {
        const read = mutationReadOptions(request);
        const workspace = await requireWorkspace(
          organizationId,
          workspaceId,
          read,
          database
        );
        const item = await requireRichTextResource(
          database,
          workspaceId,
          input.documentResourceId,
          read,
          workspace.snapshot
        );
        const document = await requirePluginYjsDocument(
          database,
          workspaceId,
          item.yjsBackingId,
          {
            errorCode: "RICH_TEXT_DOCUMENT_CONTENT_NOT_FOUND",
            errorMessage: "Rich Text document content not found",
          }
        );
        if (document.updated_at !== input.expectedRevision) {
          throw localError(
            "REVISION_CHANGED",
            "Rich Text document revision does not match",
            409
          );
        }
        return withYjsDocument(database, document.id, async (doc) => {
          const before = encodeStateVector(doc);
          const content = await replaceRichTextBlocks(doc, input.blocks);
          const now = await persistYjsUpdate(database, {
            documentId: document.id,
            workspaceId,
            updateB64: Uint8ArrayTob64(encodeStateAsUpdateV2(doc, before)),
            visibility: workspace.row.visibility,
          });
          return {
            documentResourceId: item.id,
            ...content,
            revision: now,
          };
        });
      }
    );
  };
  const applyKanbanTaskProperties = (
    doc: Doc,
    taskId: string,
    properties: KanbanTaskProperties | undefined,
    allowedPersonIds: ReadonlySet<string> | undefined
  ) => {
    try {
      return updateKanbanTaskProperties(doc, taskId, properties, {
        allowedPersonIds,
      });
    } catch (error) {
      if (error instanceof KanbanMcpInputError) {
        throw localError(error.code, error.message, error.status);
      }
      throw error;
    }
  };
  const getOrganizationMemberIds = async (
    database: DatabaseOrTx,
    organizationId: string
  ) => {
    const rows = await database.getAll<{ user_id: string }>(
      "SELECT user_id FROM member WHERE organization_id = ?",
      [organizationId]
    );
    return new Set(rows.map(({ user_id }) => user_id));
  };
  const getAllowedPersonIds = async (
    database: DatabaseOrTx,
    organizationId: string,
    doc: Doc,
    properties: KanbanTaskProperties | undefined
  ) =>
    kanbanTaskPropertiesIncludePeople(doc, properties)
      ? getOrganizationMemberIds(database, organizationId)
      : undefined;
  const readKanbanBoardProperties = async (
    organizationId: string,
    workspaceId: string,
    operationInput: Record<string, unknown>,
    request: PluginOperationRequest
  ) => {
    const parsed =
      kanbanGetBoardPropertiesOperationInputSchema.safeParse(operationInput);
    if (!parsed.success) {
      throw localError(
        "INVALID_KANBAN_BOARD_PROPERTY_REQUEST",
        "Invalid Kanban board property request",
        400
      );
    }
    const workspace = await requireWorkspace(
      organizationId,
      workspaceId,
      request
    );
    const board = await requireKanbanBoard(
      db,
      workspaceId,
      parsed.data.boardId,
      request,
      workspace.snapshot
    );
    const document = await requirePluginYjsDocument(
      db,
      workspaceId,
      board.yjsBackingId,
      {
        errorCode: "KANBAN_BOARD_DOCUMENT_NOT_FOUND",
        errorMessage: "Kanban board document not found",
      }
    );
    return withYjsDocument(
      db,
      document.id,
      (doc) =>
        ({
          boardId: board.id,
          properties: getKanbanBoardProperties(doc),
        }) satisfies KanbanGetBoardPropertiesOutput
    );
  };
  const createKanbanTask = async (
    organizationId: string,
    workspaceId: string,
    operationInput: Record<string, unknown>,
    request: PluginOperationRequest
  ) => {
    const parsed =
      kanbanCreateTaskOperationInputSchema.safeParse(operationInput);
    if (!parsed.success) {
      throw localError(
        "INVALID_KANBAN_TASK_CREATION",
        "Invalid Kanban task creation",
        400
      );
    }
    const input = parsed.data;

    return safety.idempotent<KanbanCreateTaskOutput>(
      `${KANBAN_PLUGIN_ID}:create_task`,
      request?.idempotencyKey,
      {
        input,
        pluginId: KANBAN_PLUGIN_ID,
        workspaceId,
        organizationId,
      },
      async (database) => {
        const read = mutationReadOptions(request);
        const workspace = await requireWorkspace(
          organizationId,
          workspaceId,
          read,
          database
        );
        const board = await requireKanbanBoard(
          database,
          workspaceId,
          input.boardId,
          read,
          workspace.snapshot
        );
        const tables = resolveWorkspaceScopedTables(workspace.row.visibility);
        const taskId = createId("res");
        const taskDocumentId = createId("yjs");
        let properties: Record<string, KanbanPropertyValue> = {};
        let updateB64: string | undefined;
        if (input.properties && Object.keys(input.properties).length > 0) {
          const updates = await getYjsDocumentUpdates(
            database,
            board.yjsBackingId
          );
          const doc = new Doc();
          try {
            applyYjsDocumentUpdates(doc, updates);
            const before = encodeStateVector(doc);
            properties = applyKanbanTaskProperties(
              doc,
              taskId,
              input.properties,
              await getAllowedPersonIds(
                database,
                organizationId,
                doc,
                input.properties
              )
            );
            updateB64 = Uint8ArrayTob64(encodeStateAsUpdateV2(doc, before));
          } finally {
            doc.destroy();
          }
        }
        const position =
          input.position ??
          ((
            await database.getOptional<{ value: number | null }>(
              `SELECT MAX(position) AS value FROM ${tables.workspaceResources} WHERE workspace_id = ? AND parent_id IS ?`,
              [workspaceId, board.id]
            )
          )?.value ?? -1) + 1;
        const now = new Date().toISOString();
        await database.execute(
          `INSERT INTO ${tables.yjsDocuments} (id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
          [taskDocumentId, workspaceId, now, now]
        );
        await database.execute(
          `INSERT INTO ${tables.workspaceResources} (id, workspace_id, name, icon, position, parent_id, resource_type_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId,
            workspaceId,
            input.name,
            null,
            position,
            board.id,
            KANBAN_TASK_RESOURCE_TYPE_ID,
            1,
            now,
            now,
          ]
        );
        await database.execute(
          `INSERT INTO ${tables.workspaceStorageSlots} (id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at) VALUES (?, ?, ?, NULL, 'content', 'yjs', ?, NULL, ?, ?)`,
          [createId("storage"), workspaceId, taskId, taskDocumentId, now, now]
        );
        await recordActivity(database, { resourceId: taskId }, now);
        if (updateB64) {
          await persistYjsUpdate(database, {
            documentId: board.yjsBackingId,
            workspaceId,
            updateB64,
            updatedAt: now,
            visibility: workspace.row.visibility,
          });
        }
        return {
          boardId: board.id,
          name: input.name,
          position,
          properties,
          taskId,
          updatedAt: now,
        };
      }
    );
  };
  const updateKanbanTask = async (
    organizationId: string,
    workspaceId: string,
    operationInput: Record<string, unknown>,
    request: PluginOperationRequest
  ) => {
    const parsed =
      kanbanUpdateTaskOperationInputSchema.safeParse(operationInput);
    if (!parsed.success) {
      throw localError(
        "INVALID_KANBAN_TASK_UPDATE",
        "Invalid Kanban task update",
        400
      );
    }
    const input = parsed.data;
    const propertiesChanged = Object.keys(input.properties ?? {}).length > 0;
    if (!(input.name || propertiesChanged)) {
      throw localError(
        "INVALID_KANBAN_TASK_UPDATE",
        "Task update requires a name or at least one property",
        400
      );
    }
    if (input.name && !input.expectedRevision) {
      throw localError(
        "INVALID_KANBAN_TASK_UPDATE",
        "expectedRevision is required when changing the task name",
        400
      );
    }

    return safety.idempotent<KanbanUpdateTaskOutput>(
      `${KANBAN_PLUGIN_ID}:update_task`,
      request?.idempotencyKey,
      {
        input,
        pluginId: KANBAN_PLUGIN_ID,
        workspaceId,
        organizationId,
      },
      async (database) => {
        const read = mutationReadOptions(request);
        const workspace = await requireWorkspace(
          organizationId,
          workspaceId,
          read,
          database
        );
        const board = await requireKanbanBoard(
          database,
          workspaceId,
          input.boardId,
          read,
          workspace.snapshot
        );
        const task = await requireResourceRow(
          database,
          workspaceId,
          input.taskId,
          read,
          workspace.snapshot
        );
        if (
          task.resource_type_id !== KANBAN_TASK_RESOURCE_TYPE_ID ||
          task.parent_id !== board.id
        ) {
          throw localError(
            "KANBAN_TASK_NOT_FOUND",
            "Kanban task not found on this board",
            404
          );
        }
        if (
          input.expectedRevision &&
          task.updated_at !== input.expectedRevision
        ) {
          throw localError(
            "REVISION_CHANGED",
            "Task revision does not match",
            409
          );
        }

        const updates = await getYjsDocumentUpdates(
          database,
          board.yjsBackingId
        );
        const doc = new Doc();
        try {
          applyYjsDocumentUpdates(doc, updates);
          const before = encodeStateVector(doc);
          const properties = applyKanbanTaskProperties(
            doc,
            task.id,
            input.properties,
            await getAllowedPersonIds(
              database,
              organizationId,
              doc,
              input.properties
            )
          );
          const now = new Date().toISOString();
          if (propertiesChanged) {
            await persistYjsUpdate(database, {
              documentId: board.yjsBackingId,
              workspaceId,
              updateB64: Uint8ArrayTob64(encodeStateAsUpdateV2(doc, before)),
              updatedAt: now,
              visibility: workspace.row.visibility,
            });
          }
          const tables = resolveWorkspaceScopedTables(workspace.row.visibility);
          await database.execute(
            `UPDATE ${tables.workspaceResources} SET name = ?, updated_at = ? WHERE id = ?`,
            [input.name ?? task.name, now, task.id]
          );
          await recordActivity(database, { resourceId: task.id }, now);
          return {
            boardId: board.id,
            name: input.name ?? task.name,
            properties,
            taskId: task.id,
            updatedAt: now,
          };
        } finally {
          doc.destroy();
        }
      }
    );
  };
  const organizationProvenance = (): ContentProvenance => {
    const snapshot =
      options.organizationSnapshot?.() ?? unknownContentSnapshot();
    return {
      asOf: snapshot.confirmedAt ?? new Date(0).toISOString(),
      source: "cloud-cache",
      syncState: snapshot.syncState,
    };
  };
  return {
    ...content,
    async pendingContentChanges() {
      const changes: PendingContentChanges = {
        complete: true,
        deletes: {},
        storageIds: [],
        upserts: {},
      };
      const batch = await db.getCrudBatch(100_000);
      if (!batch) {
        return changes;
      }
      changes.complete = !batch.haveMore;
      const pending = new Map<
        PendingContentTable,
        Map<string, "delete" | "upsert">
      >();
      const storageIds = new Set<string>();
      for (const entry of batch.crud) {
        if (
          entry.table === "yjs_document_updates" &&
          typeof entry.opData?.document_id === "string"
        ) {
          const slot = await db.getOptional<{ id: string }>(
            `SELECT id FROM (${STORAGE_SLOTS}) WHERE kind = 'yjs' AND backing_id = ? LIMIT 1`,
            [entry.opData.document_id]
          );
          if (slot) {
            storageIds.add(slot.id);
          }
        }
        if (entry.table === "workspace_storage_slots") {
          storageIds.add(entry.id);
        }
        if (!isPendingContentTable(entry.table)) {
          continue;
        }
        const table =
          pending.get(entry.table) ?? new Map<string, "delete" | "upsert">();
        table.set(
          entry.id,
          entry.op.toUpperCase() === "DELETE" ? "delete" : "upsert"
        );
        pending.set(entry.table, table);
      }
      for (const [table, entries] of pending) {
        for (const [id, operation] of entries) {
          const target =
            operation === "delete" ? changes.deletes : changes.upserts;
          (target[table] ??= []).push(id);
        }
      }
      changes.storageIds = [...storageIds];
      return changes;
    },
    async createWorkspace(organizationId, input, request) {
      requireCachedOrganization(options, organizationId);
      return safety.idempotent(
        "create_workspace",
        request?.idempotencyKey,
        {
          input,
          organizationId,
        },
        async (database) => {
          const visibility = input.visibility ?? "shared";
          let snapshot = localContentSnapshot();
          if (visibility !== "local") {
            requireActiveCloudOrganization(options, organizationId);
            snapshot =
              (await options.readCoordinator?.resolve(
                { kind: "workspaces" },
                mutationReadOptions(request)
              )) ?? unknownContentSnapshot();
          }
          const duplicate = await database.getOptional<{ id: string }>(
            `SELECT id FROM (${WORKSPACES}) workspaces WHERE organization_id = ? AND slug = ? LIMIT 1`,
            [organizationId, input.slug]
          );
          if (duplicate) {
            throw localError(
              "WORKSPACE_SLUG_CONFLICT",
              "Workspace slug already exists",
              409
            );
          }
          const id = createId("workspace");
          const now = new Date().toISOString();
          const table = resolveWorkspaceScopedTables(visibility).workspaces;
          await database.execute(
            `INSERT INTO ${table} (id, name, slug, organization_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, input.name, input.slug, organizationId, visibility, now, now]
          );
          const row: WorkspaceRow = {
            created_at: now,
            id,
            name: input.name,
            organization_id: organizationId,
            slug: input.slug,
            updated_at: now,
            visibility,
          };
          return {
            ...toWorkspace(row),
            provenance: contentProvenance(row.visibility, now, snapshot),
          };
        }
      );
    },
    async createWorkspaceResource(organizationId, workspaceId, input, request) {
      return safety.idempotent(
        "create_resource",
        request?.idempotencyKey,
        {
          expectedParentResourceTypeId: request?.expectedParentResourceTypeId,
          input,
          workspaceId,
          organizationId,
        },
        async (database) => {
          const read = mutationReadOptions(request);
          const workspace = await requireWorkspace(
            organizationId,
            workspaceId,
            read,
            database
          );
          if (request?.expectedParentResourceTypeId && !input.parentId) {
            throw localError(
              "RESOURCE_NOT_FOUND",
              "Parent workspace resource not found",
              404
            );
          }
          if (input.parentId) {
            const parent = await requireResourceRow(
              database,
              workspaceId,
              input.parentId,
              read,
              workspace.snapshot
            );
            assertExpectedResourceTypeId(
              parent.resource_type_id,
              request?.expectedParentResourceTypeId
            );
          }
          const tables = resolveWorkspaceScopedTables(workspace.row.visibility);
          const id = createId("res");
          const resourceTypeId = input.resourceTypeId;
          const now = new Date().toISOString();
          const position =
            input.position ??
            ((
              await database.getOptional<{ value: number | null }>(
                `SELECT MAX(position) AS value FROM ${tables.workspaceResources} WHERE workspace_id = ? AND parent_id IS ?`,
                [workspaceId, input.parentId ?? null]
              )
            )?.value ?? -1) + 1;
          await database.execute(
            `INSERT INTO ${tables.workspaceResources} (id, workspace_id, name, icon, position, parent_id, resource_type_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              workspaceId,
              input.name,
              input.icon ?? null,
              position,
              input.parentId ?? null,
              resourceTypeId,
              input.schemaVersion,
              now,
              now,
            ]
          );
          const storage: WorkspaceResource["storage"] = {};
          let yjsBackingId: string | null = null;
          for (const [name, definition] of Object.entries(input.storage)) {
            const storageId = createId("storage");
            const backingId =
              definition.kind === "yjs"
                ? createId("yjs")
                : definition.kind === "file"
                  ? createId("file")
                  : null;
            if (definition.kind === "yjs") {
              if (name === "content") {
                yjsBackingId = backingId;
              }
              await database.execute(
                `INSERT INTO ${tables.yjsDocuments} (id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
                [backingId, workspaceId, now, now]
              );
            }
            await database.execute(
              `INSERT INTO ${tables.workspaceStorageSlots} (id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
              [
                storageId,
                workspaceId,
                id,
                name,
                definition.kind,
                backingId,
                now,
                now,
              ]
            );
            storage[name] = { kind: definition.kind, storageId };
          }
          const row: ResourceRow = {
            created_at: now,
            icon: input.icon ?? null,
            id,
            name: input.name,
            parent_id: input.parentId ?? null,
            resource_type_id: resourceTypeId,
            schema_version: input.schemaVersion,
            storage: JSON.stringify(storage),
            position,
            workspace_id: workspaceId,
            updated_at: now,
            yjs_backing_id: yjsBackingId,
          };
          await recordActivity(database, { resourceId: id }, now);
          const item = toResource(row);
          return {
            ...item,
            provenance: contentProvenance(
              workspace.row.visibility,
              item.updatedAt,
              workspace.snapshot
            ),
          };
        }
      );
    },
    async deleteWorkspace(organizationId, workspaceId, previewToken, request) {
      return safety.idempotent(
        "delete_workspace",
        request?.idempotencyKey,
        {
          previewToken,
          workspaceId,
          organizationId,
        },
        async (database) => {
          const workspace = await requireWorkspace(
            organizationId,
            workspaceId,
            mutationReadOptions(request),
            database
          );
          const tables = resolveWorkspaceScopedTables(workspace.row.visibility);
          const state = await workspacePreviewState(
            database,
            workspace.row.visibility,
            workspaceId
          );
          await safety.consumePreview(
            database,
            previewToken,
            "delete_workspace",
            organizationId,
            workspaceId,
            state.fingerprint
          );
          await database.execute(
            `DELETE FROM ${tables.workspaceStorageValues} WHERE workspace_id = ?`,
            [workspaceId]
          );
          await database.execute(
            `DELETE FROM ${tables.workspaceStorageSlots} WHERE workspace_id = ?`,
            [workspaceId]
          );
          await database.execute(
            `DELETE FROM ${tables.workspaceExtensions} WHERE workspace_id = ?`,
            [workspaceId]
          );
          await database.execute(
            `DELETE FROM ${tables.workspaceResources} WHERE workspace_id = ?`,
            [workspaceId]
          );
          await database.execute(
            `DELETE FROM ${tables.yjsDocumentUpdates} WHERE workspace_id = ?`,
            [workspaceId]
          );
          await database.execute(
            `DELETE FROM ${tables.yjsDocuments} WHERE workspace_id = ?`,
            [workspaceId]
          );
          await database.execute(
            `DELETE FROM ${tables.workspaces} WHERE id = ?`,
            [workspaceId]
          );
          return { id: workspaceId };
        }
      );
    },
    async deleteWorkspaceResource(
      organizationId,
      workspaceId,
      resourceId,
      previewToken,
      request
    ) {
      return safety.idempotent(
        "delete_resource",
        request?.idempotencyKey,
        {
          expectedResourceTypeId: request?.expectedResourceTypeId,
          resourceId,
          previewToken,
          workspaceId,
          organizationId,
        },
        async (database) => {
          const read = mutationReadOptions(request);
          const workspace = await requireWorkspace(
            organizationId,
            workspaceId,
            read,
            database
          );
          const item = await requireResourceRow(
            database,
            workspaceId,
            resourceId,
            read,
            workspace.snapshot
          );
          assertExpectedResourceTypeId(
            item.resource_type_id,
            request?.expectedResourceTypeId
          );
          const tables = resolveWorkspaceScopedTables(workspace.row.visibility);
          const state = await itemPreviewState(
            database,
            workspace.row.visibility,
            workspaceId,
            resourceId
          );
          await safety.consumePreview(
            database,
            previewToken,
            "delete_resource",
            organizationId,
            resourceId,
            state.fingerprint
          );
          const descendants = await database.getAll<{ id: string }>(
            `WITH RECURSIVE descendants(id, depth) AS (
               SELECT id, 0 FROM ${tables.workspaceResources} WHERE id = ? AND workspace_id = ?
               UNION ALL
               SELECT child.id, parent.depth + 1 FROM ${tables.workspaceResources} child
               JOIN descendants parent ON child.parent_id = parent.id
             ) SELECT id FROM descendants ORDER BY depth DESC, id ASC`,
            [resourceId, workspaceId]
          );
          await recordActivity(database, { resourceId });
          const descendantIds = descendants.map((row) => row.id);
          const trashedAt = new Date().toISOString();
          const purgeAt = new Date(
            Date.parse(trashedAt) + 30 * 24 * 60 * 60 * 1000
          ).toISOString();
          for (const id of descendantIds) {
            const updated = await database.execute(
              `UPDATE ${tables.workspaceResourceTrash}
             SET workspace_id = ?, trash_root_id = ?, trashed_at = ?, purge_at = ?
             WHERE id = ?`,
              [workspaceId, resourceId, trashedAt, purgeAt, id]
            );
            if ((updated.rowsAffected ?? 0) === 0) {
              await database.execute(
                `INSERT INTO ${tables.workspaceResourceTrash}
               (id, workspace_id, trash_root_id, trashed_at, purge_at)
               VALUES (?, ?, ?, ?, ?)`,
                [id, workspaceId, resourceId, trashedAt, purgeAt]
              );
            }
          }
          return { id: resourceId };
        }
      );
    },
    async executePluginOperation(
      organizationId,
      workspaceId,
      pluginId,
      operation,
      operationInput,
      request
    ) {
      if (pluginId === KANBAN_PLUGIN_ID) {
        if (operation === "get_board_properties") {
          return readKanbanBoardProperties(
            organizationId,
            workspaceId,
            operationInput,
            request
          );
        }
        if (operation === "create_task") {
          return createKanbanTask(
            organizationId,
            workspaceId,
            operationInput,
            request
          );
        }
        if (operation === "update_task") {
          return updateKanbanTask(
            organizationId,
            workspaceId,
            operationInput,
            request
          );
        }
      }
      if (pluginId === RICH_TEXT_PLUGIN_ID) {
        if (operation === "read_me") {
          return readRichTextGuide(
            organizationId,
            workspaceId,
            operationInput,
            request
          );
        }
        if (operation === "get_document") {
          return readRichTextDocument(
            organizationId,
            workspaceId,
            operationInput,
            request
          );
        }
        if (operation === "update_document") {
          return updateRichTextDocument(
            organizationId,
            workspaceId,
            operationInput,
            request
          );
        }
      }
      throw localError(
        "PLUGIN_OPERATION_NOT_FOUND",
        "Built-in extension operation not found",
        404
      );
    },
    async getYjsStorageState(
      organizationId,
      workspaceId,
      storageId,
      stateVectorB64,
      request
    ) {
      const storage = await resolveStorageSlot(
        db,
        organizationId,
        workspaceId,
        storageId,
        "yjs",
        request,
        options
      );
      const json = await content.getYjsStorageJson(
        organizationId,
        workspaceId,
        storageId,
        request
      );
      const updates = await getYjsDocumentUpdates(db, storage.backing_id!);
      const doc = new Doc();
      try {
        applyYjsDocumentUpdates(doc, updates);
        const vector = stateVectorB64
          ? b64ToUint8Array(stateVectorB64)
          : undefined;
        return {
          encoding: "yjs-update-v2" as const,
          provenance: json.provenance,
          resourceId: storage.resource_id!,
          stateVectorB64: Uint8ArrayTob64(encodeStateVector(doc)),
          storageId,
          updateB64: Uint8ArrayTob64(encodeStateAsUpdateV2(doc, vector)),
          updatedAt: json.updatedAt,
        };
      } finally {
        doc.destroy();
      }
    },
    async getFileDownloadUrl(organizationId, workspaceId, storageId, request) {
      const workspace = await requireWorkspace(
        organizationId,
        workspaceId,
        request
      );
      const slot = await resolveStorageSlot(
        db,
        organizationId,
        workspaceId,
        storageId,
        "file",
        request,
        options
      );
      const metadata = parseStorageMetadata(slot.metadata);
      const storedFile = await db.getOptional<{
        filename: string;
        local_uri: string | null;
        media_type: string | null;
      }>(
        `SELECT filename, local_uri, media_type FROM attachments
         WHERE id = ? AND json_extract(meta_data, '$.workspaceId') = ? LIMIT 1`,
        [slot.backing_id, workspaceId]
      );
      if (!storedFile?.local_uri) {
        throw localError(
          "INCOMPLETE_SYNC",
          "Cached file bytes are unavailable",
          409
        );
      }
      const storage = new IndexedDbFileStorageAdapter(
        getFileStorageDatabaseName(workspaceId)
      );
      try {
        const blob = await storage.readBlob(storedFile.local_uri);
        // The existing desktop agent bridge caps cached downloads at 25 MB.
        // Check before allocating its legacy base64 response buffer.
        if (blob.size > 25_000_000) {
          throw localError(
            "RESPONSE_TOO_LARGE",
            "Cached attachment exceeds the size limit",
            413
          );
        }
        const bytes = await blob.arrayBuffer();
        return {
          $download: {
            dataB64: Uint8ArrayTob64(new Uint8Array(bytes)),
            resource: storedFile.media_type ?? "application/octet-stream",
            filename:
              typeof metadata.filename === "string"
                ? metadata.filename
                : storedFile.filename,
          },
          provenance: contentProvenance(
            workspace.row.visibility,
            new Date().toISOString(),
            workspace.snapshot
          ),
        } as unknown as { downloadUrl: string };
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "RESPONSE_TOO_LARGE"
        ) {
          throw error;
        }
        throw localError(
          "INCOMPLETE_SYNC",
          "Cached attachment bytes are unavailable",
          409
        );
      } finally {
        await storage.close();
      }
    },
    async listKeyValueStorage(organizationId, workspaceId, storageId, request) {
      const workspace = await requireWorkspace(
        organizationId,
        workspaceId,
        request
      );
      const slot = await resolveStorageSlot(
        db,
        organizationId,
        workspaceId,
        storageId,
        "key-value",
        request,
        options
      );
      const rows = await db.getAll<{
        key: string;
        updated_at: string;
        value: string;
      }>(
        `SELECT key, value, updated_at FROM (${STORAGE_VALUES})
         WHERE workspace_id = ? AND storage_id = ? ORDER BY key ASC`,
        [workspaceId, storageId]
      );
      return {
        items: rows.map((row) => ({
          key: row.key,
          updatedAt: row.updated_at,
          value: row.value,
        })),
        provenance: contentProvenance(
          workspace.row.visibility,
          rows.reduce(
            (latest, row) => latestTimestamp(latest, row.updated_at),
            workspace.row.updated_at
          ),
          workspace.snapshot
        ),
        resourceId: slot.resource_id!,
        storageId,
      };
    },
    async getOrganization(organizationId) {
      const organization = options
        .organizations?.()
        .find((candidate) => candidate.id === organizationId);
      if (!organization) {
        throw localError(
          "ORGANIZATION_NOT_FOUND",
          "Organization not cached",
          404
        );
      }
      return { ...organization, provenance: organizationProvenance() };
    },
    inviteOrganizationMember: cloudRequired,
    listOrganizationMembers: cloudRequired,
    async listOrganizations(input = {}) {
      const organizations = [...(options.organizations?.() ?? [])].sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
      return page(
        organizations,
        input,
        (organization) => ({
          ...organization,
          provenance: organizationProvenance(),
        }),
        options.organizationSnapshot?.()
      );
    },
    async previewDeleteWorkspace(organizationId, workspaceId, request) {
      const workspace = await requireWorkspace(
        organizationId,
        workspaceId,
        mutationReadOptions(request)
      );
      const state = await workspacePreviewState(
        db,
        workspace.row.visibility,
        workspaceId
      );
      return safety.preview(
        "delete_workspace",
        organizationId,
        workspaceId,
        state.impact,
        state.fingerprint
      );
    },
    async previewDeleteWorkspaceResource(
      organizationId,
      workspaceId,
      resourceId,
      request
    ) {
      const read = mutationReadOptions(request);
      const workspace = await requireWorkspace(
        organizationId,
        workspaceId,
        read
      );
      const item = await content.getWorkspaceResource(
        organizationId,
        workspaceId,
        resourceId,
        read
      );
      assertExpectedResourceTypeId(
        item.resourceTypeId,
        request?.expectedResourceTypeId
      );
      const state = await itemPreviewState(
        db,
        workspace.row.visibility,
        workspaceId,
        resourceId
      );
      return safety.preview(
        "delete_resource",
        organizationId,
        resourceId,
        state.impact,
        state.fingerprint
      );
    },
    previewRemoveOrganizationMember: cloudRequired,
    removeOrganizationMember: cloudRequired,
    async updateWorkspace(organizationId, workspaceId, input, request) {
      return safety.idempotent(
        "update_workspace",
        request?.idempotencyKey,
        {
          input,
          workspaceId,
          organizationId,
        },
        async (database) => {
          const read = mutationReadOptions(request);
          const workspace = await requireWorkspace(
            organizationId,
            workspaceId,
            read,
            database
          );
          requireRevision(workspace.row.updated_at, input.expectedRevision);
          const table = resolveWorkspaceScopedTables(
            workspace.row.visibility
          ).workspaces;
          const now = new Date().toISOString();
          if (input.slug && input.slug !== workspace.row.slug) {
            const duplicate = await database.getOptional<{ id: string }>(
              `SELECT id FROM (${WORKSPACES}) workspaces
               WHERE organization_id = ? AND slug = ? AND id <> ? LIMIT 1`,
              [organizationId, input.slug, workspaceId]
            );
            if (duplicate) {
              throw localError(
                "WORKSPACE_SLUG_CONFLICT",
                "Workspace slug already exists",
                409
              );
            }
          }
          const row: WorkspaceRow = {
            ...workspace.row,
            name: input.name ?? workspace.row.name,
            slug: input.slug ?? workspace.row.slug,
            updated_at: now,
          };
          await database.execute(
            `UPDATE ${table} SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
            [row.name, row.slug, now, workspaceId]
          );
          return {
            ...toWorkspace(row),
            provenance: contentProvenance(
              row.visibility,
              now,
              workspace.snapshot
            ),
          };
        }
      );
    },
    async updateWorkspaceResource(
      organizationId,
      workspaceId,
      resourceId,
      input,
      request
    ) {
      return safety.idempotent(
        "update_resource",
        request?.idempotencyKey,
        {
          input,
          resourceId,
          workspaceId,
          organizationId,
        },
        async (database) => {
          const read = mutationReadOptions(request);
          const workspace = await requireWorkspace(
            organizationId,
            workspaceId,
            read,
            database
          );
          const item = await requireResourceRow(
            database,
            workspaceId,
            resourceId,
            read,
            workspace.snapshot
          );
          requireRevision(item.updated_at, input.expectedRevision);
          if (input.parentId) {
            if (input.parentId === resourceId) {
              throw localError(
                "INVALID_PARENT",
                "A workspace resource cannot be its own parent",
                400
              );
            }
            await requireResourceRow(
              database,
              workspaceId,
              input.parentId,
              read,
              workspace.snapshot
            );
            const descendant = await database.getOptional<{ id: string }>(
              `WITH RECURSIVE descendants(id) AS (
               SELECT id FROM ${resolveWorkspaceScopedTables(workspace.row.visibility).workspaceResources} WHERE parent_id = ?
               UNION ALL
               SELECT child.id FROM ${resolveWorkspaceScopedTables(workspace.row.visibility).workspaceResources} child
               JOIN descendants parent ON child.parent_id = parent.id
             ) SELECT id FROM descendants WHERE id = ? LIMIT 1`,
              [resourceId, input.parentId]
            );
            if (descendant) {
              throw localError(
                "INVALID_PARENT",
                "A workspace resource cannot move below its descendant",
                400
              );
            }
          }
          const table = resolveWorkspaceScopedTables(
            workspace.row.visibility
          ).workspaceResources;
          const now = new Date().toISOString();
          await recordActivity(database, { resourceId }, now);
          const row: ResourceRow = {
            ...item,
            icon: input.icon === undefined ? item.icon : input.icon,
            name: input.name ?? item.name,
            parent_id:
              input.parentId === undefined ? item.parent_id : input.parentId,
            position: input.position ?? item.position,
            updated_at: now,
          };
          await database.execute(
            `UPDATE ${table} SET name = ?, icon = ?, parent_id = ?, position = ?, updated_at = ? WHERE id = ?`,
            [row.name, row.icon, row.parent_id, row.position, now, resourceId]
          );
          await recordActivity(database, { resourceId }, now);
          const result = toResource(row);
          return {
            ...result,
            provenance: contentProvenance(
              workspace.row.visibility,
              result.updatedAt,
              workspace.snapshot
            ),
          };
        }
      );
    },
    updateOrganization: cloudRequired,
  };
}

function isPendingContentTable(value: string): value is PendingContentTable {
  return [
    "workspace_resources",
    "workspace_storage_slots",
    "workspace_storage_values",
    "workspaces",
  ].includes(value);
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    organizationId: row.organization_id,
    slug: row.slug,
    updatedAt: row.updated_at,
    visibility: row.visibility,
  };
}

function toResource(row: ResourceRow): WorkspaceResource {
  return {
    createdAt: row.created_at,
    icon: row.icon,
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    resourceTypeId: row.resource_type_id,
    schemaVersion: row.schema_version,
    position: row.position,
    workspaceId: row.workspace_id,
    storage: parseResourceStorage(row.storage),
    updatedAt: row.updated_at,
  };
}

function parseResourceStorage(value: string): WorkspaceResource["storage"] {
  try {
    const parsed = JSON.parse(value) as Record<
      string,
      { kind?: unknown; storageId?: unknown }
    >;
    const storage: WorkspaceResource["storage"] = {};
    for (const [name, handle] of Object.entries(parsed)) {
      if (
        handle &&
        typeof handle.storageId === "string" &&
        (handle.kind === "file" ||
          handle.kind === "key-value" ||
          handle.kind === "yjs")
      ) {
        storage[name] = { kind: handle.kind, storageId: handle.storageId };
      }
    }
    return storage;
  } catch {
    return {};
  }
}

function parseStorageMetadata(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function resolveStorageSlot(
  database: DatabaseOrTx,
  organizationId: string,
  workspaceId: string,
  storageId: string,
  kind: StorageSlotRow["kind"],
  request: ContentRequestOptions | undefined,
  options: DeviceContentServiceOptions
) {
  requireCachedOrganization(options, organizationId);
  const workspace = await database.getOptional<{ id: string }>(
    `SELECT id FROM (${WORKSPACES}) WHERE id = ? AND organization_id = ? LIMIT 1`,
    [workspaceId, organizationId]
  );
  const slot = workspace
    ? await database.getOptional<StorageSlotRow>(
        `SELECT * FROM (${STORAGE_SLOTS})
         WHERE id = ? AND workspace_id = ? AND kind = ? AND resource_id IS NOT NULL
         LIMIT 1`,
        [storageId, workspaceId, kind]
      )
    : null;
  if (!slot?.resource_id || (kind !== "key-value" && !slot.backing_id)) {
    throw localError(
      "STORAGE_NOT_FOUND",
      `${kind} storage not found${request?.consistency === "cached" ? " in cache" : ""}`,
      404
    );
  }
  return slot;
}

function withWorkspaceProvenance(
  workspace: Workspace,
  snapshot: ContentSnapshot
): Workspace {
  return {
    ...workspace,
    provenance: contentProvenance(
      workspace.visibility,
      workspace.updatedAt,
      snapshot
    ),
  };
}

function contentProvenance(
  visibility: Workspace["visibility"],
  asOf: string,
  snapshot: ContentSnapshot
): ContentProvenance {
  return {
    asOf,
    source: visibility === "local" ? "device-local" : "cloud-cache",
    syncState: visibility === "local" ? "current" : snapshot.syncState,
  };
}

async function requireResourceRow(
  database: DatabaseOrTx,
  workspaceId: string,
  resourceId: string,
  request: ContentRequestOptions | undefined,
  snapshot: ContentSnapshot
) {
  const item = await database.getOptional<ResourceRow>(
    `SELECT * FROM (${RESOURCES}) items
     WHERE id = ? AND workspace_id = ?
     LIMIT 1`,
    [resourceId, workspaceId]
  );
  if (!item) {
    throw missingReadError(
      "RESOURCE_NOT_FOUND",
      "Workspace resource not found",
      request,
      snapshot
    );
  }
  return item;
}

function assertExpectedResourceTypeId(
  actualPluginId: string | null,
  expectedResourceTypeId: string | undefined
) {
  if (
    expectedResourceTypeId !== undefined &&
    actualPluginId !== expectedResourceTypeId
  ) {
    throw localError("RESOURCE_NOT_FOUND", "Workspace resource not found", 404);
  }
}

function page<T, R = T>(
  values: T[],
  input: PaginationInput,
  map: (value: T) => R = (value) => value as unknown as R,
  snapshot?: ContentSnapshot
): Page<R> {
  const offset = decodeCursor(input.cursor)?.offset ?? 0;
  const limit = input.limit ?? 50;
  const items = values.slice(offset, offset + limit).map(map);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor:
      nextOffset < values.length ? encodeCursor({ offset: nextOffset }) : null,
    ...(snapshot ? { snapshot } : {}),
  };
}

function encodeCursor(value: { offset: number }) {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
}

function decodeCursor(cursor?: string) {
  if (!cursor) {
    return;
  }
  try {
    const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const parsed = JSON.parse(atob(normalized)) as {
      offset?: unknown;
    };
    if (!Number.isInteger(parsed.offset) || (parsed.offset as number) < 0) {
      throw new Error("Invalid cursor");
    }
    return {
      offset: parsed.offset as number,
    };
  } catch {
    throw localError("INVALID_CURSOR", "Invalid content cursor", 400);
  }
}

function localError(code: string, message: string, status: number) {
  return Object.assign(new Error(message), {
    code,
    exposeToAgent: true,
    status,
  });
}

function missingReadError(
  code: string,
  message: string,
  request: ContentRequestOptions | undefined,
  snapshot: ContentSnapshot
) {
  return request?.consistency === "cached" &&
    snapshot.completeness === "partial"
    ? incompleteSyncError("Required Desktop content has not finished syncing")
    : localError(code, message, 404);
}

function incompleteSyncError(message: string) {
  return localError("INCOMPLETE_SYNC", message, 409);
}

function unknownContentSnapshot(): ContentSnapshot {
  return {
    completeness: "partial",
    confirmedAt: null,
    syncState: "unknown",
  };
}

function requireCachedOrganization(
  options: DeviceContentServiceOptions,
  organizationId: string
) {
  const organizations = options.organizations?.();
  if (
    organizations &&
    !organizations.some((organization) => organization.id === organizationId)
  ) {
    throw localError("ORGANIZATION_NOT_FOUND", "Organization not cached", 404);
  }
}

function requireActiveCloudOrganization(
  options: DeviceContentServiceOptions,
  organizationId: string
) {
  if (
    options.activeOrganizationId &&
    options.activeOrganizationId() !== organizationId
  ) {
    throw incompleteSyncError(
      "Desktop sync is not active for this organization"
    );
  }
}

function mutationReadOptions(
  request?: ContentRequestOptions
): ContentRequestOptions {
  return {
    consistency: "cached",
    ...(request?.signal ? { signal: request.signal } : {}),
  };
}

async function workspacePreviewState(
  database: DatabaseOrTx,
  visibility: Workspace["visibility"],
  workspaceId: string
) {
  const tables = resolveWorkspaceScopedTables(visibility);
  const [workspace, items, documents, extensions, slots, values] =
    await Promise.all([
      database.getOptional<Record<string, unknown>>(
        `SELECT * FROM ${tables.workspaces} WHERE id = ? LIMIT 1`,
        [workspaceId]
      ),
      database.getAll<Record<string, unknown>>(
        `SELECT * FROM ${tables.workspaceResources} WHERE workspace_id = ? ORDER BY id ASC`,
        [workspaceId]
      ),
      database.getAll<Record<string, unknown>>(
        `SELECT * FROM ${tables.yjsDocuments} WHERE workspace_id = ? ORDER BY id ASC`,
        [workspaceId]
      ),
      database.getAll<Record<string, unknown>>(
        `SELECT * FROM ${tables.workspaceExtensions} WHERE workspace_id = ? ORDER BY id ASC`,
        [workspaceId]
      ),
      database.getAll<Record<string, unknown>>(
        `SELECT * FROM ${tables.workspaceStorageSlots} WHERE workspace_id = ? ORDER BY id ASC`,
        [workspaceId]
      ),
      database.getAll<Record<string, unknown>>(
        `SELECT * FROM ${tables.workspaceStorageValues} WHERE workspace_id = ? ORDER BY id ASC`,
        [workspaceId]
      ),
    ]);
  return {
    fingerprint: await fingerprintValue({
      documents,
      extensions,
      items,
      workspace,
      slots,
      values,
    }),
    impact: {
      documents: documents.length,
      resources: items.length,
      members: 0,
      workspaces: 1,
    },
  };
}

async function itemPreviewState(
  database: DatabaseOrTx,
  visibility: Workspace["visibility"],
  workspaceId: string,
  resourceId: string
) {
  const table = resolveWorkspaceScopedTables(visibility).workspaceResources;
  const descendants = await database.getAll<Record<string, unknown>>(
    `WITH RECURSIVE descendants AS (
       SELECT * FROM ${table} WHERE id = ? AND workspace_id = ?
       UNION ALL
       SELECT child.* FROM ${table} child
       JOIN descendants parent ON child.parent_id = parent.id
     ) SELECT * FROM descendants ORDER BY id ASC`,
    [resourceId, workspaceId]
  );
  return {
    fingerprint: await fingerprintValue(descendants),
    impact: {
      documents: 0,
      resources: descendants.length,
      members: 0,
      workspaces: 0,
    },
  };
}

function latestTimestamp(left: string, right?: string | null) {
  return right && right > left ? right : left;
}
