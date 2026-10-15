import { recordActivity } from "../activity/services";
import {
  type AdditionalOptions,
  useQuery,
  useSuspenseQuery,
} from "@powersync/react";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { buildUnionAllQuery, resolveWorkspaceScopedTables } from "../workspace-storage";
import { resolveWorkspaceVisibility } from "../workspaces/services";
import {
  LOCAL_WORKSPACE_RESOURCES_TABLE,
  WORKSPACE_RESOURCES_TABLE,
  type WorkspaceResourceEntity,
} from "./table";
import {
  LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE,
  WORKSPACE_RESOURCE_TRASH_TABLE,
  type WorkspaceResourceTrashEntity,
} from "./trash-table";

export const RESOURCE_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const WORKSPACE_RESOURCE_TRASH_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_RESOURCE_TRASH_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE}`,
);
const WORKSPACE_RESOURCES_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_RESOURCES_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_RESOURCES_TABLE}`,
);

export type WorkspaceResourceTrashRoot = WorkspaceResourceEntity &
  WorkspaceResourceTrashEntity & { descendant_count: number };

export function useWorkspaceResourceTrashQuery(
  workspaceId: string,
  options?: AdditionalOptions,
) {
  return useQuery<WorkspaceResourceTrashEntity>(
    `SELECT * FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
     WHERE workspace_id = ? ORDER BY purge_at ASC, id ASC`,
    [workspaceId],
    options,
  );
}

export function useWorkspaceResourceTrashSuspenseQuery(
  workspaceId: string,
  options?: AdditionalOptions,
) {
  return useSuspenseQuery<WorkspaceResourceTrashEntity>(
    `SELECT * FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
     WHERE workspace_id = ? ORDER BY purge_at ASC, id ASC`,
    [workspaceId],
    options,
  );
}

export function useWorkspaceResourceTrashRootsQuery(
  workspaceId: string,
  options?: AdditionalOptions,
) {
  return useQuery<WorkspaceResourceTrashRoot>(
    `SELECT resources.*, trash.trash_root_id, trash.trashed_at, trash.purge_at,
            (SELECT COUNT(*) - 1 FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) descendants
             WHERE descendants.workspace_id = trash.workspace_id
               AND descendants.trash_root_id = trash.id) AS descendant_count
     FROM (${WORKSPACE_RESOURCE_TRASH_UNION_QUERY}) trash
     INNER JOIN (${WORKSPACE_RESOURCES_UNION_QUERY}) resources ON resources.id = trash.id
     WHERE trash.workspace_id = ? AND trash.trash_root_id = trash.id
     ORDER BY trash.purge_at ASC, trash.id ASC`,
    [workspaceId],
    options,
  );
}

export async function trashWorkspaceResourceSubtrees(params: {
  db: DatabaseOrTx;
  workspaceId: string;
  rootIds: string[];
  now?: Date;
}) {
  const { db, workspaceId, rootIds, now = new Date() } = params;
  if (rootIds.length === 0) return [];
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const tables = resolveWorkspaceScopedTables(visibility);
  const trashedAt = now.toISOString();
  const purgeAt = new Date(now.getTime() + RESOURCE_TRASH_RETENTION_MS).toISOString();
  const trashedIds: string[] = [];

  await ensureTx(db, async (tx) => {
    for (const rootId of rootIds) {
      const rows = await tx.getAll<{ id: string }>(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id FROM ${tables.workspaceResources} WHERE id = ? AND workspace_id = ?
           UNION ALL
           SELECT child.id FROM ${tables.workspaceResources} child
           INNER JOIN subtree parent ON child.parent_id = parent.id
         ) SELECT id FROM subtree`,
        [rootId, workspaceId],
      );
      for (const { id } of rows) {
        const updated = await tx.execute(
          `UPDATE ${tables.workspaceResourceTrash}
           SET workspace_id = ?, trash_root_id = ?, trashed_at = ?, purge_at = ?
           WHERE id = ?`,
          [workspaceId, rootId, trashedAt, purgeAt, id],
        );
        if ((updated.rowsAffected ?? 0) === 0) {
          await tx.execute(
            `INSERT INTO ${tables.workspaceResourceTrash}
               (id, workspace_id, trash_root_id, trashed_at, purge_at)
             VALUES (?, ?, ?, ?, ?)`,
            [id, workspaceId, rootId, trashedAt, purgeAt],
          );
        }
        await recordActivity(tx, { resourceId: id }, trashedAt);
        trashedIds.push(id);
      }
    }
  });

  return trashedIds;
}

export async function restoreWorkspaceResourceSubtrees(params: {
  db: DatabaseOrTx;
  workspaceId: string;
  rootIds: string[];
  now?: Date;
}) {
  const { db, workspaceId, rootIds, now = new Date() } = params;
  if (rootIds.length === 0) return 0;
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const tables = resolveWorkspaceScopedTables(visibility);
  let restoredCount = 0;

  await ensureTx(db, async (tx) => {
    for (const rootId of rootIds) {
      const marker = await tx.getOptional<WorkspaceResourceTrashEntity>(
        `SELECT * FROM ${tables.workspaceResourceTrash}
         WHERE id = ? AND workspace_id = ? AND trash_root_id = ?`,
        [rootId, workspaceId, rootId],
      );
      if (
        !marker?.purge_at ||
        Date.parse(marker.purge_at) <= now.getTime()
      ) {
        continue;
      }

      const root = await tx.getOptional<{ parent_id: string | null }>(
        `SELECT parent_id FROM ${tables.workspaceResources} WHERE id = ? AND workspace_id = ?`,
        [rootId, workspaceId],
      );
      if (!root) continue;
      await recordActivity(tx, { resourceId: rootId }, now.toISOString());
      if (root.parent_id) {
        const parent = await tx.getOptional<{ id: string }>(
          `SELECT id FROM ${tables.workspaceResources} WHERE id = ? AND workspace_id = ?`,
          [root.parent_id, workspaceId],
        );
        const parentTrash = await tx.getOptional<{ trash_root_id: string }>(
          `SELECT trash_root_id FROM ${tables.workspaceResourceTrash} WHERE id = ?`,
          [root.parent_id],
        );
        const parentWillRestore = parentTrash
          ? rootIds.includes(parentTrash.trash_root_id)
          : false;
        if (!parent || (parentTrash && !parentWillRestore)) {
          const position = await tx.getOptional<{ next_position: number }>(
            `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
             FROM ${tables.workspaceResources} resources
             WHERE workspace_id = ? AND parent_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM ${tables.workspaceResourceTrash} trash WHERE trash.id = resources.id
               )`,
            [workspaceId],
          );
          await tx.execute(
            `UPDATE ${tables.workspaceResources} SET parent_id = NULL, position = ?, updated_at = ? WHERE id = ?`,
            [position?.next_position ?? 0, now.toISOString(), rootId],
          );
        }
      }

      const result = await tx.execute(
        `DELETE FROM ${tables.workspaceResourceTrash} WHERE workspace_id = ? AND trash_root_id = ?`,
        [workspaceId, rootId],
      );
      await recordActivity(tx, { resourceId: rootId }, now.toISOString());
      restoredCount += result.rowsAffected ?? 0;
    }
  });

  return restoredCount;
}

export async function getExpiredLocalTrashRootIds(params: {
  db: DatabaseOrTx;
  workspaceId: string;
  now?: Date;
}) {
  const { db, workspaceId, now = new Date() } = params;
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  if (visibility !== WORKSPACE_VISIBILITY.local) return [];
  const table = resolveWorkspaceScopedTables(visibility).workspaceResourceTrash;
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM ${table}
     WHERE workspace_id = ? AND trash_root_id = id AND purge_at <= ?
     ORDER BY purge_at ASC, id ASC`,
    [workspaceId, now.toISOString()],
  );
  return rows.map(({ id }) => id);
}

export async function getWorkspaceResourceTrashGroupIds(params: {
  db: DatabaseOrTx;
  workspaceId: string;
  rootId: string;
}) {
  const { db, workspaceId, rootId } = params;
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const table = resolveWorkspaceScopedTables(visibility).workspaceResourceTrash;
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM ${table} WHERE workspace_id = ? AND trash_root_id = ? ORDER BY id ASC`,
    [workspaceId, rootId],
  );
  return rows.map(({ id }) => id);
}
