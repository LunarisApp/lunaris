import { latestTimestamp } from "../activity/time";
import { recordActivity } from "../activity/services";
import {
  type AdditionalOptions,
  type QuerySyncStreamOptions,
  useQuery,
  useSuspenseQuery,
} from "@powersync/react";
import { createId, type JsonObject, parseUTCTimestamp } from "@repo/utils";
import { v4 as uuidv4 } from "uuid";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { buildUnionAllQuery, resolveWorkspaceScopedTables } from "../workspace-storage";
import {
  resolveWorkspaceVisibility,
  WORKSPACE_INDEX_SYNC_STREAMS,
} from "../workspaces/services";
import {
  LOCAL_WORKSPACES_TABLE,
  WORKSPACES_TABLE,
} from "../workspaces/table";
import { Uint8ArrayTob64 } from "../yjs/utils";
import {
  LOCAL_WORKSPACE_RESOURCES_TABLE,
  WORKSPACE_RESOURCES_TABLE,
  type WorkspaceResourceEntity,
} from "./table";
import {
  LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE,
  WORKSPACE_RESOURCE_TRASH_TABLE,
} from "./trash-table";

const WORKSPACE_RESOURCES_ORDER_BY = "position ASC, created_at ASC, id ASC";
const WORKSPACE_RESOURCES_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_RESOURCES_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_RESOURCES_TABLE}`
);
const WORKSPACES_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACES_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACES_TABLE}`
);
const WORKSPACE_RESOURCE_TRASH_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_RESOURCE_TRASH_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE}`,
);

export function getWorkspaceResourcesSyncStreams(): QuerySyncStreamOptions[] {
  return WORKSPACE_INDEX_SYNC_STREAMS;
}

function buildWorkspaceResourcesQuery(whereClause: string) {
  return `SELECT * FROM (${WORKSPACE_RESOURCES_UNION_QUERY}) workspace_resources
    WHERE ${whereClause}
      AND NOT EXISTS (
        SELECT 1 FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
        WHERE trash.id = workspace_resources.id
      )`;
}

export interface OrganizationWorkspaceResourceUsage {
  localCount: number;
  syncedCount: number;
}

export type OrganizationWorkspaceResourceEntity = WorkspaceResourceEntity & {
  workspace_name: string | null;
  workspace_slug: string | null;
  workspace_visibility: string | null;
};

export function useOrganizationWorkspaceResourcesQuery(
  organizationId: string,
  options?: AdditionalOptions
) {
  return useQuery<OrganizationWorkspaceResourceEntity>(
    `SELECT workspace_resources.*, workspaces.name AS workspace_name, workspaces.slug AS workspace_slug,
            workspaces.visibility AS workspace_visibility
     FROM (${WORKSPACE_RESOURCES_UNION_QUERY}) workspace_resources
     INNER JOIN (${WORKSPACES_UNION_QUERY}) workspaces
       ON workspaces.id = workspace_resources.workspace_id
     WHERE workspaces.organization_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
         WHERE trash.id = workspace_resources.id
       )
     ORDER BY workspaces.name COLLATE NOCASE ASC, ${WORKSPACE_RESOURCES_ORDER_BY}`,
    [organizationId],
    options
  );
}

export async function getOrganizationWorkspaceResourceUsage(params: {
  db: DatabaseOrTx;
  organizationId: string;
}): Promise<OrganizationWorkspaceResourceUsage> {
  const { db, organizationId } = params;
  const result = await db.getOptional<{
    local_count: number;
    synced_count: number;
  }>(
    `SELECT
       (
         SELECT COUNT(*)
         FROM (${WORKSPACE_RESOURCES_UNION_QUERY}) workspace_resources
         INNER JOIN (${WORKSPACES_UNION_QUERY}) workspaces
           ON workspaces.id = workspace_resources.workspace_id
         WHERE workspaces.organization_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
             WHERE trash.id = workspace_resources.id
           )
       ) AS local_count,
       (
         SELECT COUNT(*)
         FROM ${WORKSPACE_RESOURCES_TABLE} workspace_resources
         INNER JOIN (${WORKSPACES_UNION_QUERY}) workspaces
           ON workspaces.id = workspace_resources.workspace_id
         WHERE workspaces.organization_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM ${WORKSPACE_RESOURCE_TRASH_TABLE} trash
             WHERE trash.id = workspace_resources.id
           )
       ) AS synced_count`,
    [organizationId, organizationId]
  );
  return {
    localCount: result?.local_count ?? 0,
    syncedCount: result?.synced_count ?? 0,
  };
}

function buildParentWhereClause(parentId: string | null) {
  if (parentId === null) {
    return {
      params: [] as unknown[],
      sql: "parent_id IS NULL",
    };
  }

  return {
    params: [parentId] as unknown[],
    sql: "parent_id = ?",
  };
}

async function getNextSiblingPosition(params: {
  db: DatabaseOrTx;
  parentId: string | null;
  workspaceId: string;
}) {
  const { db, parentId, workspaceId } = params;
  const parentFilter = buildParentWhereClause(parentId);
  const result = await db.getOptional<{ max_pos: number | null }>(
    `SELECT MAX(position) as max_pos FROM (${buildUnionAllQuery(
      `SELECT id, position, workspace_id, parent_id FROM ${WORKSPACE_RESOURCES_TABLE}`,
      `SELECT id, position, workspace_id, parent_id FROM ${LOCAL_WORKSPACE_RESOURCES_TABLE}`,
    )}) workspace_resources WHERE workspace_id = ? AND ${parentFilter.sql}
      AND NOT EXISTS (
        SELECT 1 FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
        WHERE trash.id = workspace_resources.id
      )`,
    [workspaceId, ...parentFilter.params],
  );
  return (result?.max_pos ?? -1) + 1;
}

export function useWorkspaceResourcesQuery(
  workspaceId: string,
  options?: AdditionalOptions
) {
  return useQuery<WorkspaceResourceEntity>(
    `${buildWorkspaceResourcesQuery("workspace_id = ?")} ORDER BY ${WORKSPACE_RESOURCES_ORDER_BY}`,
    [workspaceId],
    options
  );
}

export function useWorkspaceResourcesSuspenseQuery(
  workspaceId: string,
  options?: AdditionalOptions
) {
  return useSuspenseQuery<WorkspaceResourceEntity>(
    `${buildWorkspaceResourcesQuery("workspace_id = ?")} ORDER BY ${WORKSPACE_RESOURCES_ORDER_BY}`,
    [workspaceId],
    options
  );
}

export function useWorkspaceResourceTimestamps(resourceId: string | undefined) {
  const { data, isLoading } = useQuery<
    Pick<WorkspaceResourceEntity, "created_at" | "updated_at" | "last_activity_at">
  >(
    `${buildWorkspaceResourcesQuery("id = ?")} LIMIT 1`,
    [resourceId ?? ""]
  );
  const resource = data.at(0);

  return {
    createdAt: resource?.created_at ? parseUTCTimestamp(resource.created_at) : null,
    isLoading: Boolean(resourceId) && isLoading,
    updatedAt: resource ? latestTimestamp(resource.updated_at, resource.last_activity_at) : null,
  };
}

export async function createWorkspaceResource(params: {
  db: DatabaseOrTx;
  icon?: string;
  name: string;
  initialPayload?: JsonObject;
  parentId: string | null;
  resourceTypeId: string;
  schemaVersion?: number;
  position?: number;
  workspaceId: string;
  storage: Readonly<
    Record<
      string,
      | { kind: "file" }
      | {
          initialize?: (context: {
            createdAt: string;
            initialPayload?: JsonObject;
            parentId: string | null;
            resourceId: string;
            userId: string | null;
          }) => JsonObject | Promise<JsonObject>;
          kind: "key-value";
        }
      | {
          initialize?: (
            doc: Doc,
            context: {
              createdAt: string;
              initialPayload?: JsonObject;
              parentId: string | null;
              resourceId: string;
              userId: string | null;
            },
          ) => Promise<void> | void;
          kind: "yjs";
        }
    >
  >;
  userId?: string | null;
}) {
  const {
    db,
    workspaceId,
    name,
    parentId,
    resourceTypeId,
    storage,
    icon,
    position,
    schemaVersion = 1,
    userId = null,
    initialPayload,
  } = params;
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const id = createId("res");
  const now = new Date().toISOString();
  const tables = resolveWorkspaceScopedTables(visibility);
  const handles: Record<string, { kind: "file" | "key-value" | "yjs"; storageId: string }> = {};

  const pos =
    position ?? (await getNextSiblingPosition({ db, workspaceId, parentId }));

  await ensureTx(db, async (tx) => {
    await tx.execute(
      `INSERT INTO ${tables.workspaceResources} (id, workspace_id, name, icon, position, parent_id, resource_type_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        workspaceId,
        name,
        icon ?? null,
        pos,
        parentId,
        resourceTypeId,
        schemaVersion,
        now,
        now,
      ]
    );

    for (const [slotName, definition] of Object.entries(storage)) {
      const storageId = createId("storage");
      handles[slotName] = { kind: definition.kind, storageId };
      let backingId: string | null = null;
      if (definition.kind === "yjs") {
        backingId = createId("yjs");
        await tx.execute(
          `INSERT INTO ${tables.yjsDocuments} (id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
          [backingId, workspaceId, now, now],
        );
      } else if (definition.kind === "file") {
        backingId = createId("file");
      }
      await tx.execute(
        `INSERT INTO ${tables.workspaceStorageSlots}
          (id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
        [storageId, workspaceId, id, slotName, definition.kind, backingId, now, now],
      );

      const context = { createdAt: now, initialPayload, parentId, resourceId: id, userId };
      if (definition.kind === "key-value" && definition.initialize) {
        const values = await definition.initialize(context);
        for (const [key, value] of Object.entries(values)) {
          await tx.execute(
            `INSERT INTO ${tables.workspaceStorageValues}
              (id, storage_id, workspace_id, key, value, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [createId("storage-value"), storageId, workspaceId, key, JSON.stringify(value), now, now],
          );
        }
      }
      if (definition.kind === "yjs" && backingId && definition.initialize) {
        const doc = new Doc();
        try {
          await definition.initialize(doc, context);
          const update = encodeStateAsUpdateV2(doc);
          await tx.execute(
            `INSERT INTO ${tables.yjsDocumentUpdates} (id, document_id, workspace_id, user_id, update_b64, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), backingId, workspaceId, userId, Uint8ArrayTob64(update), now, now],
          );
        } finally {
          doc.destroy();
        }
      }
    }
    await recordActivity(tx, { resourceId: id }, now);
  });

  return { id, name, storage: handles };
}

/** Atomically mutates a local payload and advances its resource schema version. */
export async function compareAndSetWorkspaceResourceVersion(params: {
  db: DatabaseOrTx;
  expectedVersion: number;
  mutatePayload: (tx: DatabaseOrTx) => Promise<void>;
  nextVersion: number;
  workspaceId: string;
  resourceId: string;
}): Promise<boolean> {
  const {
    db,
    expectedVersion,
    mutatePayload,
    nextVersion,
    workspaceId,
    resourceId,
  } = params;
  return ensureTx(db, async (tx) => {
    const visibility = await resolveWorkspaceVisibility(tx, workspaceId);
    const table = resolveWorkspaceScopedTables(visibility).workspaceResources;
    const result = await tx.execute(
      `UPDATE ${table} SET schema_version = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND schema_version = ?`,
      [nextVersion, new Date().toISOString(), resourceId, workspaceId, expectedVersion],
    );
    if (result.rowsAffected !== 1) return false;
    await mutatePayload(tx);
    await recordActivity(tx, { resourceId });
    return true;
  });
}

export async function createWorkspaceFolder(params: {
  db: DatabaseOrTx;
  icon?: string;
  name: string;
  parentId: string | null;
  position?: number;
  workspaceId: string;
}) {
  return ensureTx(params.db, async (db) => {
    const {
      workspaceId,
      name,
      parentId,
      icon,
      position,
    } = params;
    const visibility = await resolveWorkspaceVisibility(db, workspaceId);
    const id = createId("res");
    const now = new Date().toISOString();
    const tableName = resolveWorkspaceScopedTables(visibility).workspaceResources;

    const pos =
      position ?? (await getNextSiblingPosition({ db, workspaceId, parentId }));

    await db.execute(
      `INSERT INTO ${tableName} (id, workspace_id, name, icon, position, parent_id, resource_type_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, name, icon ?? null, pos, parentId, "lunaris.folder", 1, now, now]
    );

    await recordActivity(db, { resourceId: id }, now);
    return id;
  });
}

export async function renameWorkspaceResource(params: {
  db: DatabaseOrTx;
  id: string;
  name: string;
}) {
  return ensureTx(params.db, async (db) => {
    const { id, name } = params;
    const now = new Date().toISOString();
    await Promise.all([
      db.execute(
        `UPDATE ${WORKSPACE_RESOURCES_TABLE} SET name = ?, updated_at = ? WHERE id = ?`,
        [name, now, id]
      ),
      db.execute(
        `UPDATE ${LOCAL_WORKSPACE_RESOURCES_TABLE} SET name = ?, updated_at = ? WHERE id = ?`,
        [name, now, id]
      ),
    ]);
    await recordActivity(db, { resourceId: id }, now);
  });
}

export async function deleteWorkspaceResource(params: {
  db: DatabaseOrTx;
  id: string;
}) {
  return ensureTx(params.db, async (db) => {
    const { id } = params;
    await recordActivity(db, { resourceId: id });
    await Promise.all([
      db.execute(`DELETE FROM ${WORKSPACE_RESOURCE_TRASH_TABLE} WHERE id = ?`, [id]),
      db.execute(`DELETE FROM ${LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE} WHERE id = ?`, [id]),
      db.execute(`DELETE FROM ${WORKSPACE_RESOURCES_TABLE} WHERE id = ?`, [id]),
      db.execute(`DELETE FROM ${LOCAL_WORKSPACE_RESOURCES_TABLE} WHERE id = ?`, [id]),
    ]);
  });
}

export async function deleteWorkspaceResources(params: {
  db: DatabaseOrTx;
  ids: string[];
}) {
  return ensureTx(params.db, async (db) => {
    const { ids } = params;
    if (ids.length === 0) return;
    for (const id of ids) await recordActivity(db, { resourceId: id });
    const placeholders = ids.map(() => "?").join(",");
    await Promise.all([
      db.execute(
        `DELETE FROM ${WORKSPACE_RESOURCE_TRASH_TABLE} WHERE id IN (${placeholders})`,
        ids,
      ),
      db.execute(
        `DELETE FROM ${LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE} WHERE id IN (${placeholders})`,
        ids,
      ),
      db.execute(`DELETE FROM ${WORKSPACE_RESOURCES_TABLE} WHERE id IN (${placeholders})`, ids),
      db.execute(
        `DELETE FROM ${LOCAL_WORKSPACE_RESOURCES_TABLE} WHERE id IN (${placeholders})`,
        ids
      ),
    ]);
  });
}

export async function reorderWorkspaceResources(params: {
  db: DatabaseOrTx;
  orderedIds: string[];
}) {
  const { db, orderedIds } = params;
  const now = new Date().toISOString();
  await ensureTx(db, async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await recordActivity(tx, { resourceId: orderedIds[i]! }, now);
      await Promise.all([
        tx.execute(
          `UPDATE ${WORKSPACE_RESOURCES_TABLE} SET position = ?, updated_at = ? WHERE id = ?`,
          [i, now, orderedIds[i]]
        ),
        tx.execute(
          `UPDATE ${LOCAL_WORKSPACE_RESOURCES_TABLE} SET position = ?, updated_at = ? WHERE id = ?`,
          [i, now, orderedIds[i]]
        ),
      ]);
    }
  });
}

export async function touchWorkspaceResource(params: {
  db: DatabaseOrTx;
  id: string;
}) {
  return ensureTx(params.db, async (db) => {
    const { id } = params;
    const now = new Date().toISOString();
    await Promise.all([
      db.execute(`UPDATE ${WORKSPACE_RESOURCES_TABLE} SET updated_at = ? WHERE id = ?`, [
        now,
        id,
      ]),
      db.execute(
        `UPDATE ${LOCAL_WORKSPACE_RESOURCES_TABLE} SET updated_at = ? WHERE id = ?`,
        [now, id]
      ),
    ]);
    await recordActivity(db, { resourceId: id }, now);
  });
}

export async function moveWorkspaceResource(params: {
  db: DatabaseOrTx;
  id: string;
  newParentId: string | null;
  newPosition: number;
}) {
  return ensureTx(params.db, async (db) => {
    const { id, newParentId, newPosition } = params;
    const now = new Date().toISOString();
    await recordActivity(db, { resourceId: id }, now);
    await Promise.all([
      db.execute(
        `UPDATE ${WORKSPACE_RESOURCES_TABLE} SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?`,
        [newParentId, newPosition, now, id]
      ),
      db.execute(
        `UPDATE ${LOCAL_WORKSPACE_RESOURCES_TABLE} SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?`,
        [newParentId, newPosition, now, id]
      ),
    ]);
    await recordActivity(db, { resourceId: id }, now);
  });
}

export function getWorkspaceResource(params: { db: DatabaseOrTx; id: string }) {
  const { db, id } = params;
  return db.getOptional<WorkspaceResourceEntity>(buildWorkspaceResourcesQuery("id = ?"), [id]);
}

export function getWorkspaceResourceChildren(params: {
  db: DatabaseOrTx;
  parentId: string | null;
  workspaceId: string;
}) {
  const { db, workspaceId, parentId } = params;
  const parentFilter = buildParentWhereClause(parentId);
  return db.getAll<WorkspaceResourceEntity>(
    `${buildWorkspaceResourcesQuery(`workspace_id = ? AND ${parentFilter.sql}`)} ORDER BY ${WORKSPACE_RESOURCES_ORDER_BY}`,
    [workspaceId, ...parentFilter.params]
  );
}

export async function getWorkspaceResourceDescendants(params: {
  db: DatabaseOrTx;
  resourceId: string;
  workspaceId: string;
}): Promise<WorkspaceResourceEntity[]> {
  const { db, workspaceId, resourceId } = params;
  const descendants: WorkspaceResourceEntity[] = [];
  const visited = new Set<string>();
  const queue = [resourceId];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const children = await db.getAll<WorkspaceResourceEntity>(
      `${buildWorkspaceResourcesQuery("workspace_id = ? AND parent_id = ?")} ORDER BY ${WORKSPACE_RESOURCES_ORDER_BY}`,
      [workspaceId, parentId]
    );
    for (const child of children) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}
