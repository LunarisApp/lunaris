import { recordActivity } from "../activity/services";
import type {
  AbstractPowerSyncDatabase,
  SQLWatchOptions,
} from "@powersync/common";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { createId } from "@repo/utils";
import { log } from "evlog";
import { v4 as uuidv4 } from "uuid";
import { applyUpdateV2, Doc } from "yjs";
import {
  buildUnionAllQuery,
  resolveWorkspaceScopedTables,
} from "../workspace-storage";
import { resolveWorkspaceVisibility } from "../workspaces/services";
import type { YjsPowersyncProvider } from "./provider";
import {
  LOCAL_YJS_DOCUMENT_UPDATES_TABLE,
  LOCAL_YJS_DOCUMENTS_TABLE,
  YJS_DOCUMENT_UPDATES_TABLE,
  YJS_DOCUMENTS_TABLE,
} from "./table";
import { b64ToUint8Array } from "./utils";

export type YjsProvider = YjsPowersyncProvider;

const UNNAMED_ROOT_KEY = "";
const DEBUGGER_UNNAMED_ROOT_KEY = "$root";
const YJS_DOCUMENTS_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${YJS_DOCUMENTS_TABLE}`,
  `SELECT * FROM ${LOCAL_YJS_DOCUMENTS_TABLE}`
);
const YJS_DOCUMENT_UPDATES_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${YJS_DOCUMENT_UPDATES_TABLE}`,
  `SELECT * FROM ${LOCAL_YJS_DOCUMENT_UPDATES_TABLE}`
);

interface SharedRoot {
  _length: number;
  _map: Map<string, unknown>;
  _start: {
    content?: {
      getRef?: () => number;
      type?: {
        constructor?: {
          name?: string;
        };
      };
    };
  } | null;
}

/**
 * Create a Yjs Document in the database via PowerSync.
 * @param db
 * @param workspaceId
 */
export async function createYjsDocument(db: DatabaseOrTx, workspaceId: string) {
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const yjsDocumentId = createId("yjs");
  const createdAt = new Date().toISOString();
  const tableName = resolveWorkspaceScopedTables(visibility).yjsDocuments;
  await db.execute(
    `INSERT INTO ${tableName} (id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [yjsDocumentId, workspaceId, createdAt, createdAt]
  );
  return yjsDocumentId;
}

/**
 * Create a Yjs Document with a specific ID in the database.
 * Used when the document ID is provided by the caller (e.g., from hierarchy items).
 * @param db
 * @param documentId - The specific document ID to use
 * @param workspaceId
 */
export async function createYjsDocumentWithId(
  db: DatabaseOrTx,
  documentId: string,
  workspaceId: string
): Promise<void> {
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const createdAt = new Date().toISOString();
  const tableName = resolveWorkspaceScopedTables(visibility).yjsDocuments;
  await db.execute(
    `INSERT INTO ${tableName} (id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [documentId, workspaceId, createdAt, createdAt]
  );
}

/**
 * Watch for Yjs document updates in the database.
 * @param db
 * @param documentId
 * @param signal
 */
export function watchYjsDocumentUpdates(
  db: AbstractPowerSyncDatabase,
  documentId: string,
  options?: SQLWatchOptions
) {
  return db.watch(
    `SELECT * FROM (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) yjs_document_updates WHERE document_id = ?`,
    [documentId],
    options
  );
}

/**
 * Insert a Yjs document update into the database.
 * @param db
 * @param documentId
 * @param workspaceId
 * @param updateB64
 */
export async function insertYjsDocumentUpdate(
  db: DatabaseOrTx,
  documentId: string,
  workspaceId: string,
  updateB64: string,
  userId?: string | null
) {
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  const docUpdateId = uuidv4();
  const createdAt = new Date().toISOString();
  const tableName = resolveWorkspaceScopedTables(visibility).yjsDocumentUpdates;
  await ensureTx(db, async (tx) => {
    await tx.execute(
      `INSERT INTO ${tableName} (id, document_id, workspace_id, user_id, update_b64, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        docUpdateId,
        documentId,
        workspaceId,
        userId ?? null,
        updateB64,
        createdAt,
        createdAt,
      ]
    );
    await tx.execute(
      `UPDATE ${resolveWorkspaceScopedTables(visibility).yjsDocuments} SET updated_at = ?
       WHERE id = ? AND julianday(?) > COALESCE(julianday(updated_at), 0)`,
      [createdAt, documentId, createdAt]
    );
    await recordActivity(tx, { documentId }, createdAt);
  });
  return docUpdateId;
}

/**
 * Delete all updates for a Yjs document from the database.
 * @param db
 * @param documentId
 */
export async function deleteYjsDocumentUpdates(
  db: DatabaseOrTx,
  documentId: string
) {
  await Promise.all([
    db.execute(
      `DELETE FROM ${YJS_DOCUMENT_UPDATES_TABLE} WHERE document_id = ?`,
      [documentId]
    ),
    db.execute(
      `DELETE FROM ${LOCAL_YJS_DOCUMENT_UPDATES_TABLE} WHERE document_id = ?`,
      [documentId]
    ),
  ]);
}

/**
 * Delete a Yjs document and all its updates from the database.
 * @param db
 * @param documentId
 * @returns True if successful, false otherwise
 */
export async function deleteYjsDocument(
  db: DatabaseOrTx,
  documentId: string
): Promise<boolean> {
  try {
    await Promise.all([
      db.execute(`DELETE FROM ${YJS_DOCUMENTS_TABLE} WHERE id = ?`, [
        documentId,
      ]),
      db.execute(`DELETE FROM ${LOCAL_YJS_DOCUMENTS_TABLE} WHERE id = ?`, [
        documentId,
      ]),
    ]);
    await deleteYjsDocumentUpdates(db, documentId);
    return true;
  } catch (error) {
    log.error({
      tag: "Yjs",
      msg: "Failed to delete document",
      documentId,
      error,
    });
    return false;
  }
}

/**
 * Get all Yjs document updates for a document, ordered by creation time.
 * Accepts the minimal query interface needed by the data-layer implementation.
 */
export async function getYjsDocumentUpdates(
  db: { getAll: <T>(sql: string, params: unknown[]) => Promise<T[]> },
  documentId: string
): Promise<{ update_b64: string }[]> {
  return db.getAll<{ update_b64: string }>(
    `SELECT update_b64 FROM (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) yjs_document_updates WHERE document_id = ? ORDER BY created_at ASC`,
    [documentId]
  );
}

export function applyYjsDocumentUpdates(
  doc: Doc,
  updates: ReadonlyArray<{ update_b64: string }>
): void {
  for (const { update_b64 } of updates) {
    applyUpdateV2(doc, b64ToUint8Array(update_b64));
  }
}

export interface YjsDocumentUpdateRow {
  created_at: string;
  id: string;
  update_b64: string;
  user_id: string | null;
}

export async function getYjsDocumentUpdateRows(
  db: { getAll: <T>(sql: string, params: unknown[]) => Promise<T[]> },
  documentId: string
): Promise<YjsDocumentUpdateRow[]> {
  return db.getAll<YjsDocumentUpdateRow>(
    `SELECT id, user_id, update_b64, created_at FROM (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) yjs_document_updates WHERE document_id = ? ORDER BY created_at ASC, id ASC`,
    [documentId]
  );
}

export async function getYjsDocumentUpdateCount(
  db: {
    getOptional: <T>(sql: string, params: unknown[]) => Promise<T | null>;
  },
  documentId: string
): Promise<number> {
  const result = await db.getOptional<{ count: number | null }>(
    `SELECT COUNT(*) as count FROM (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) yjs_document_updates WHERE document_id = ?`,
    [documentId]
  );
  return result?.count ?? 0;
}

export async function compileYjsDocumentJson(
  db: {
    getAll: <T>(sql: string, params: unknown[]) => Promise<T[]>;
  },
  documentId: string
): Promise<unknown> {
  const updates = await getYjsDocumentUpdates(db, documentId);
  if (updates.length === 0) {
    return {};
  }

  const doc = new Doc();
  try {
    applyYjsDocumentUpdates(doc, updates);

    const entries = [...doc.share.keys()].map((key) => ({
      key,
      value: resolveSharedTypeJson(doc, key),
    }));

    if (entries.length === 1 && entries[0]?.key === UNNAMED_ROOT_KEY) {
      return entries[0].value;
    }

    return Object.fromEntries(
      entries.map(({ key, value }) => [
        key === UNNAMED_ROOT_KEY ? DEBUGGER_UNNAMED_ROOT_KEY : key,
        value,
      ])
    );
  } finally {
    doc.destroy();
  }
}

function resolveSharedTypeJson(doc: Doc, key: string): unknown {
  const shared = doc.share.get(key) as SharedRoot | undefined;
  if (!shared) {
    return undefined;
  }

  if (key === UNNAMED_ROOT_KEY) {
    return doc.getXmlFragment().toJSON();
  }

  if (shared._map.size > 0) {
    return doc.getMap(key).toJSON();
  }

  const contentRef = shared._start?.content?.getRef?.();
  if (contentRef === 7) {
    const nestedTypeName = shared._start?.content?.type?.constructor?.name;
    if (nestedTypeName?.startsWith("YXml")) {
      return doc.getXmlFragment(key).toJSON();
    }
    return doc.getArray(key).toJSON();
  }
  if (contentRef === 4 || contentRef === 6) {
    return doc.getText(key).toJSON();
  }

  return doc.getArray(key).toJSON();
}

/**
 * Check if a Yjs document exists in the database.
 * @param db
 * @param documentId
 * @returns True if the document exists, false otherwise
 */
export async function yjsDocumentExists(
  db: AbstractPowerSyncDatabase,
  documentId: string
): Promise<boolean> {
  const result = await db.getOptional<{ id: string }>(
    `SELECT id FROM (${YJS_DOCUMENTS_UNION_QUERY}) yjs_documents WHERE id = ?`,
    [documentId]
  );
  return result != null;
}
