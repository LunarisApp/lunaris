import { recordActivity } from "../activity/services";
import { useQuery } from "@powersync/react";
import { createId } from "@repo/utils";
import { useCallback, useMemo } from "react";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { buildUnionAllQuery, resolveWorkspaceScopedTables } from "../workspace-storage";
export { resolveWorkspaceScopedTables } from "../workspace-storage";
import { resolveWorkspaceVisibility } from "../workspaces/services";
import {
  LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE,
  LOCAL_WORKSPACE_STORAGE_VALUES_TABLE,
  WORKSPACE_STORAGE_SLOTS_TABLE,
  WORKSPACE_STORAGE_VALUES_TABLE,
  type WorkspaceStorageSlotEntity,
  type WorkspaceStorageValueEntity,
} from "./table";

const SLOT_UNION = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_STORAGE_SLOTS_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE}`,
);
const VALUE_UNION = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_STORAGE_VALUES_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_STORAGE_VALUES_TABLE}`,
);

export function useResourceStorageSlots(resourceId: string) {
  return useQuery<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots WHERE resource_id = ? ORDER BY name ASC`,
    [resourceId],
  );
}

export function useWorkspaceStorageSlots(workspaceId: string) {
  return useQuery<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots WHERE workspace_id = ? ORDER BY resource_id, name ASC`,
    [workspaceId],
  );
}

export function useStorageSlot(storageId: string) {
  return useQuery<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots WHERE id = ? LIMIT 1`,
    [storageId],
  );
}

export function getStorageSlot(db: DatabaseOrTx, storageId: string) {
  return db.getOptional<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots WHERE id = ? LIMIT 1`,
    [storageId],
  );
}

export function getResourceStorageSlots(db: DatabaseOrTx, resourceId: string) {
  return db.getAll<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots WHERE resource_id = ? ORDER BY name ASC`,
    [resourceId],
  );
}

export async function hasStorageBackingReference(
  db: DatabaseOrTx,
  kind: "file" | "yjs",
  backingId: string,
) {
  const reference = await db.getOptional<{ id: string }>(
    `SELECT id FROM (${SLOT_UNION}) slots
     WHERE kind = ? AND backing_id = ? LIMIT 1`,
    [kind, backingId],
  );
  return Boolean(reference);
}

export async function ensureWorkspaceStorageSlot(params: {
  db: DatabaseOrTx;
  name: string;
  pluginId: string;
  workspaceId: string;
}) {
  const existing = await params.db.getOptional<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots
     WHERE workspace_id = ? AND plugin_id = ? AND resource_id IS NULL AND name = ? LIMIT 1`,
    [params.workspaceId, params.pluginId, params.name],
  );
  if (existing) return existing;
  const visibility = await resolveWorkspaceVisibility(params.db, params.workspaceId);
  const table = resolveWorkspaceScopedTables(visibility).workspaceStorageSlots;
  const id = `storage_workspace:${params.workspaceId}:${params.pluginId}:${params.name}`;
  const now = new Date().toISOString();
  await params.db.execute(
    `INSERT OR IGNORE INTO ${table}
      (id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'key-value', NULL, NULL, ?, ?)`,
    [id, params.workspaceId, params.pluginId, params.name, now, now],
  );
  return params.db.getOptional<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots WHERE id = ? LIMIT 1`,
    [id],
  );
}

export function useWorkspaceStorageSlot(params: {
  name: string;
  pluginId: string;
  workspaceId: string;
}) {
  return useQuery<WorkspaceStorageSlotEntity>(
    `SELECT * FROM (${SLOT_UNION}) slots
     WHERE workspace_id = ? AND plugin_id = ? AND resource_id IS NULL AND name = ? LIMIT 1`,
    [params.workspaceId, params.pluginId, params.name],
  );
}

export function useStorageValue<T>(storageId: string, key: string) {
  const result = useQuery<WorkspaceStorageValueEntity>(
    `SELECT * FROM (${VALUE_UNION}) values_ WHERE storage_id = ? AND key = ? LIMIT 1`,
    [storageId, key],
  );
  const value = useMemo(() => {
    const raw = result.data[0]?.value;
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  }, [result.data]);
  return { ...result, value };
}

export function getStorageValues(db: DatabaseOrTx, storageId: string) {
  return db.getAll<WorkspaceStorageValueEntity>(
    `SELECT * FROM (${VALUE_UNION}) values_ WHERE storage_id = ? ORDER BY key ASC`,
    [storageId],
  );
}

export function useStorageValues(storageId: string) {
  return useQuery<WorkspaceStorageValueEntity>(
    `SELECT * FROM (${VALUE_UNION}) values_ WHERE storage_id = ? ORDER BY key ASC`,
    [storageId],
  );
}

export function getStorageValue(db: DatabaseOrTx, storageId: string, key: string) {
  return db.getOptional<WorkspaceStorageValueEntity>(
    `SELECT * FROM (${VALUE_UNION}) values_ WHERE storage_id = ? AND key = ? LIMIT 1`,
    [storageId, key],
  );
}

export async function deleteResourceStorage(
  db: DatabaseOrTx,
  resourceId: string,
) {
  return ensureTx(db, async (tx) => {
    const slots = await getResourceStorageSlots(tx, resourceId);
    if (slots.length) await recordActivity(tx, { resourceId });
    const ids = slots.map((slot) => slot.id);
    for (const storageId of ids) {
      await Promise.all([
        tx.execute(`DELETE FROM ${WORKSPACE_STORAGE_VALUES_TABLE} WHERE storage_id = ?`, [storageId]),
        tx.execute(`DELETE FROM ${LOCAL_WORKSPACE_STORAGE_VALUES_TABLE} WHERE storage_id = ?`, [storageId]),
      ]);
    }
    await Promise.all([
      tx.execute(`DELETE FROM ${WORKSPACE_STORAGE_SLOTS_TABLE} WHERE resource_id = ?`, [resourceId]),
      tx.execute(`DELETE FROM ${LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE} WHERE resource_id = ?`, [resourceId]),
    ]);
    return slots;
  });
}

export function createStorageValueService(
  db: DatabaseOrTx,
  workspaceId: string,
  storageId: string,
) {
  const assertStorage = async (tx: DatabaseOrTx) => {
    const slot = await getStorageSlot(tx, storageId);
    if (
      !slot ||
      slot.kind !== "key-value" ||
      slot.workspace_id !== workspaceId
    ) {
      throw new Error("Invalid key-value storage handle");
    }
  };
  const set = async (key: string, value: unknown) => {
    return ensureTx(db, async (tx) => {
      await assertStorage(tx);
      const visibility = await resolveWorkspaceVisibility(tx, workspaceId);
      const table = resolveWorkspaceScopedTables(visibility).workspaceStorageValues;
      const existing = await tx.getOptional<{ id: string; value: string | null }>(
        `SELECT id, value FROM (${VALUE_UNION}) values_ WHERE storage_id = ? AND key = ? LIMIT 1`,
        [storageId, key],
      );
      const serialized = JSON.stringify(value);
      if (existing?.value === serialized) return;
      const now = new Date().toISOString();
      if (existing) {
        await tx.execute(
          `UPDATE ${table} SET value = ?, updated_at = ? WHERE id = ?`,
          [serialized, now, existing.id],
        );
        await recordActivity(tx, { storageId }, now);
        return;
      }
      await tx.execute(
        `INSERT INTO ${table} (id, storage_id, workspace_id, key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [createId("storage-value"), storageId, workspaceId, key, serialized, now, now],
      );
      await recordActivity(tx, { storageId }, now);
    });
  };
  const remove = async (key: string) => {
    return ensureTx(db, async (tx) => {
      await assertStorage(tx);
      const existing = await getStorageValue(tx, storageId, key);
      if (!existing) return;
      await recordActivity(tx, { storageId });
      await Promise.all([
        tx.execute(
          `DELETE FROM ${WORKSPACE_STORAGE_VALUES_TABLE} WHERE storage_id = ? AND key = ?`,
          [storageId, key],
        ),
        tx.execute(
          `DELETE FROM ${LOCAL_WORKSPACE_STORAGE_VALUES_TABLE} WHERE storage_id = ? AND key = ?`,
          [storageId, key],
        ),
      ]);
    });
  };
  return { remove, set };
}

export async function setFileStorageMetadata(params: {
  backingId: string;
  db: DatabaseOrTx;
  metadata: unknown;
  workspaceId: string;
  storageId: string;
}) {
  return ensureTx(params.db, async (db) => {
    const visibility = await resolveWorkspaceVisibility(db, params.workspaceId);
    const table = resolveWorkspaceScopedTables(visibility).workspaceStorageSlots;
    const existing = await getStorageSlot(db, params.storageId);
    if (!existing || existing.workspace_id !== params.workspaceId || existing.kind !== "file") return;
    const metadata = JSON.stringify(params.metadata);
    if (existing.backing_id === params.backingId && existing.metadata === metadata) return;
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE ${table} SET backing_id = ?, metadata = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND kind = 'file'`,
      [
        params.backingId,
        metadata,
        now,
        params.storageId,
        params.workspaceId,
      ],
    );
    await recordActivity(db, { storageId: params.storageId }, now);
  });
}

export function useStorageValueActions(
  db: DatabaseOrTx,
  workspaceId: string,
  storageId: string,
) {
  const service = useMemo(
    () => createStorageValueService(db, workspaceId, storageId),
    [db, workspaceId, storageId],
  );
  return {
    remove: useCallback((key: string) => service.remove(key), [service]),
    set: useCallback((key: string, value: unknown) => service.set(key, value), [service]),
  };
}
