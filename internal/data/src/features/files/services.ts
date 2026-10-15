import { createId } from "@repo/utils";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { type Database, type DatabaseOrTx, ensureTx } from "../../core";
import type { ApiClient } from "../../http";
import { IndexedDbFileStorageAdapter } from "../../storage/indexeddb-file-storage";
import {
  ATTACHMENTS_TABLE,
  AttachmentState,
  getAttachmentQueue,
  getFileStorageDatabaseName,
  parseAttachmentMetadata,
  type WatchAttachments,
} from "../attachments";
import {
  createWorkspaceResource,
  getWorkspaceResource,
  LOCAL_WORKSPACE_RESOURCES_TABLE,
  WORKSPACE_RESOURCES_TABLE,
} from "../workspace-resources";
import { resolveWorkspaceVisibility } from "../workspaces";
import {
  getResourceStorageSlots,
  getStorageSlot,
  LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE,
  WORKSPACE_STORAGE_SLOTS_TABLE,
  setFileStorageMetadata,
} from "../workspace-storage-slots";
import {
  FILE_PLUGIN_ID,
  getFileExtension,
  getFileMediaType,
} from "./constants";
import type { FileAttachmentRow, FileMetadata } from "./types";

export {
  FILE_ACCEPT,
  FILE_PLUGIN_ID,
  getFileExtension,
  getFileMediaType,
} from "./constants";
export type { FileAttachmentRow, FileMetadata };

interface FileAttachmentReconciliationRow {
  attachment_id: string;
  has_live_item: number;
  has_synced: number | null;
  local_uri: string | null;
  state: number | null;
  value: string | null;
}

const WORKSPACE_RESOURCES_UNION = `SELECT id, workspace_id, resource_type_id FROM ${WORKSPACE_RESOURCES_TABLE}
      UNION ALL
      SELECT id, workspace_id, resource_type_id FROM ${LOCAL_WORKSPACE_RESOURCES_TABLE}`;
const WORKSPACE_STORAGE_SLOTS_UNION = `SELECT * FROM ${WORKSPACE_STORAGE_SLOTS_TABLE}
      UNION ALL
      SELECT * FROM ${LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE}`;

function parseFileMetadata(value: string | null | undefined): FileMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FileMetadata & { fileId?: string };
    const attachmentId = parsed.attachmentId ?? parsed.fileId;
    return attachmentId ? { ...parsed, attachmentId } : null;
  } catch {
    return null;
  }
}

function getAttachmentFilename(attachmentId: string, fileExtension: string) {
  return `${attachmentId}.${fileExtension}`;
}

function serializeAttachmentMetadata(
  metadata: Pick<FileMetadata, "fileExtension" | "filename" | "mediaType">,
  workspaceId: string
) {
  return JSON.stringify({
    fileExtension: metadata.fileExtension,
    filename: metadata.filename,
    mediaType: metadata.mediaType,
    workspaceId,
  });
}

export function createFileAttachmentWatcher(params: {
  db: Database;
  workspaceId: string;
}): WatchAttachments {
  const { db, workspaceId } = params;
  return (onUpdate, signal) => {
    void (async () => {
      for await (const result of db.watch(
        `SELECT DISTINCT slot.metadata AS value
          FROM (${WORKSPACE_RESOURCES_UNION}) pi
          JOIN (${WORKSPACE_STORAGE_SLOTS_UNION}) slot
            ON slot.resource_id = pi.id
           AND slot.kind = 'file'
          LEFT JOIN ${ATTACHMENTS_TABLE} a
            ON a.id = COALESCE(
              json_extract(slot.metadata, '$.fileId'),
              json_extract(slot.metadata, '$.attachmentId')
            )
          WHERE pi.workspace_id = ?
            AND slot.metadata IS NOT NULL
            AND (a.state IS NULL OR a.state != ?)`,
        [
          workspaceId,
          AttachmentState.ARCHIVED,
        ]
      )) {
        if (signal.aborted) return;
        const rows = result.rows?._array ?? [];
        const attachments = rows.flatMap((row: { value?: string }) => {
          if (!row.value) return [];
          try {
            const metadata = parseFileMetadata(row.value);
            if (!metadata) return [];
            return [
              {
                fileExtension: metadata.fileExtension,
                id: metadata.attachmentId,
                metaData: serializeAttachmentMetadata(metadata, workspaceId),
              },
            ];
          } catch {
            return [];
          }
        });
        await onUpdate(attachments);
      }
    })();
  };
}

export async function repairFileAttachmentPointers(params: {
  db: Database;
  workspaceId: string;
}) {
  if (typeof indexedDB === "undefined") return;

  const { db, workspaceId } = params;
  const storage = new IndexedDbFileStorageAdapter(
    getFileStorageDatabaseName(workspaceId)
  );
  await storage.initialize();
  await deleteUnattributedOrphanDownloads(db);
  const rows = await db.getAll<FileAttachmentReconciliationRow>(
    `SELECT
        a.id AS attachment_id,
        a.local_uri,
        a.state,
        a.has_synced,
        MAX(slot.metadata) AS value,
        MAX(CASE WHEN slot_resource.id IS NOT NULL THEN 1 ELSE 0 END) AS has_live_item
      FROM ${ATTACHMENTS_TABLE} a
      LEFT JOIN (${WORKSPACE_STORAGE_SLOTS_UNION}) slot
        ON slot.workspace_id = ?
       AND slot.kind = 'file'
       AND a.id = COALESCE(
         json_extract(slot.metadata, '$.fileId'),
         json_extract(slot.metadata, '$.attachmentId')
       )
      LEFT JOIN (${WORKSPACE_RESOURCES_UNION}) slot_resource
        ON slot_resource.id = slot.resource_id
      WHERE json_extract(a.meta_data, '$.workspaceId') = ?
         OR slot.workspace_id = ?
      GROUP BY a.id, a.local_uri, a.state, a.has_synced`,
    [
      workspaceId,
      workspaceId,
      workspaceId,
    ]
  );

  for (const row of rows) {
    await reconcileFileAttachment({ db, row, storage });
  }
}

function deleteUnattributedOrphanDownloads(db: Database) {
  return db.execute(
    `DELETE FROM ${ATTACHMENTS_TABLE}
      WHERE state = ?
        AND (local_uri IS NULL OR local_uri = '')
        AND json_extract(meta_data, '$.workspaceId') IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM (${WORKSPACE_STORAGE_SLOTS_UNION}) slot
          WHERE slot.kind = 'file'
            AND ${ATTACHMENTS_TABLE}.id = COALESCE(
              json_extract(slot.metadata, '$.fileId'),
              json_extract(slot.metadata, '$.attachmentId')
            )
        )`,
    [AttachmentState.QUEUED_DOWNLOAD]
  );
}

async function reconcileFileAttachment(params: {
  db: Database;
  row: FileAttachmentReconciliationRow;
  storage: IndexedDbFileStorageAdapter;
}) {
  const { db, row, storage } = params;
  if (row.has_live_item === 0) {
    await queueOrphanFileDeletion(db, row.attachment_id);
    return;
  }

  const metadata = parseAttachmentMetadata<FileMetadata>(row.value);
  if (!metadata?.attachmentId || !metadata.fileExtension) return;

  if (row.local_uri) {
    await restoreArchivedFileAttachment({ db, metadata, row, storage });
    return;
  }

  await repairMissingLocalFile({ db, metadata, row, storage });
}

function queueOrphanFileDeletion(db: Database, attachmentId: string) {
  return db.execute(
    `UPDATE ${ATTACHMENTS_TABLE}
      SET state = ?, has_synced = 0
      WHERE id = ?`,
    [AttachmentState.QUEUED_DELETE, attachmentId]
  );
}

async function restoreArchivedFileAttachment(params: {
  db: Database;
  metadata: FileMetadata;
  row: FileAttachmentReconciliationRow;
  storage: IndexedDbFileStorageAdapter;
}) {
  const { db, metadata, row, storage } = params;
  if (
    row.state !== AttachmentState.ARCHIVED ||
    !row.local_uri ||
    !(await storage.fileExists(row.local_uri))
  ) {
    return;
  }

  await db.execute(
    `UPDATE ${ATTACHMENTS_TABLE}
      SET state = ?
      WHERE id = ? AND state = ?`,
    [AttachmentState.SYNCED, metadata.attachmentId, AttachmentState.ARCHIVED]
  );
}

async function repairMissingLocalFile(params: {
  db: Database;
  metadata: FileMetadata;
  row: FileAttachmentReconciliationRow;
  storage: IndexedDbFileStorageAdapter;
}) {
  const { db, metadata, row, storage } = params;

  const expectedUri = storage.getLocalUri(
    getAttachmentFilename(metadata.attachmentId, metadata.fileExtension)
  );
  if (await storage.fileExists(expectedUri)) {
    await db.execute(
      `UPDATE ${ATTACHMENTS_TABLE}
        SET local_uri = ?, state = ?
        WHERE id = ? AND (local_uri IS NULL OR local_uri = '')`,
      [expectedUri, AttachmentState.SYNCED, metadata.attachmentId]
    );
    return;
  }

  if (row.state === AttachmentState.SYNCED && row.has_synced === 1) {
    await db.execute(
      `UPDATE ${ATTACHMENTS_TABLE}
        SET local_uri = NULL, state = ?
        WHERE id = ? AND (local_uri IS NULL OR local_uri = '')`,
      [AttachmentState.QUEUED_DOWNLOAD, metadata.attachmentId]
    );
  }
}

export async function queueFileAttachmentDeletion(params: {
  db: DatabaseOrTx;
  metadata: FileMetadata;
  workspaceId: string;
}) {
  const { db, metadata, workspaceId } = params;

  await db.execute(
    `INSERT OR IGNORE INTO ${ATTACHMENTS_TABLE}
      (id, filename, local_uri, timestamp, size, media_type, state, has_synced, meta_data)
      VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?)`,
    [
      metadata.attachmentId,
      getAttachmentFilename(metadata.attachmentId, metadata.fileExtension),
      Date.now(),
      metadata.size,
      metadata.mediaType,
      AttachmentState.QUEUED_DELETE,
      serializeAttachmentMetadata(metadata, workspaceId),
    ]
  );
  await db.execute(
    `UPDATE ${ATTACHMENTS_TABLE}
      SET state = ?, has_synced = 0, meta_data = ?
      WHERE id = ?`,
    [
      AttachmentState.QUEUED_DELETE,
      serializeAttachmentMetadata(metadata, workspaceId),
      metadata.attachmentId,
    ]
  );
}

export async function createFileWorkspaceResource(params: {
  api: ApiClient;
  db: Database;
  file: File;
  parentId: string | null;
  workspaceId: string;
  pluginId?: string;
}) {
  const {
    api,
    db,
    file,
    parentId,
    workspaceId,
    pluginId = FILE_PLUGIN_ID,
  } = params;
  const queue = getAttachmentQueue({
    api,
    db,
    workspaceId,
    watchAttachments: createFileAttachmentWatcher({ db, workspaceId }),
  });
  await queue.localStorage.initialize();
  const mediaType = getFileMediaType(file.type, file.name);
  const fileExtension = getFileExtension(mediaType, file.name);
  const attachmentMetaData = serializeAttachmentMetadata(
    {
      fileExtension,
      filename: file.name,
      mediaType,
    },
    workspaceId
  );
  let resourceId: string | null = null;

  const attachment = await queue.saveFile({
    data: file,
    fileExtension,
    mediaType,
    metaData: attachmentMetaData,
    updateHook: async (tx, savedAttachment) => {
      const result = await createWorkspaceResource({
        db: tx as unknown as DatabaseOrTx,
        storage: { content: { kind: "file" } },
        name: file.name,
        parentId,
        resourceTypeId: pluginId,
        workspaceId,
      });
      resourceId = result.id;
      const metadata: FileMetadata = {
        attachmentId: savedAttachment.id,
        fileExtension,
        filename: file.name,
        mediaType,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      const content = result.storage.content;
      if (!content) throw new Error("File storage was not provisioned");
      await setFileStorageMetadata({
        backingId: savedAttachment.id,
        db: tx as unknown as DatabaseOrTx,
        metadata: { ...metadata, fileId: metadata.attachmentId },
        workspaceId,
        storageId: content.storageId,
      });
    },
  });

  if (!resourceId) throw new Error("File resource was not created");
  return { attachment, id: resourceId, name: file.name };
}

export async function createLocalFileWorkspaceResource(params: {
  db: DatabaseOrTx;
  file: File;
  parentId: string | null;
  position?: number;
  workspaceId: string;
  pluginId?: string;
}) {
  const {
    db,
    file,
    parentId,
    position,
    workspaceId,
    pluginId = FILE_PLUGIN_ID,
  } = params;
  const storage = new IndexedDbFileStorageAdapter(
    getFileStorageDatabaseName(workspaceId)
  );
  await storage.initialize();

  const mediaType = getFileMediaType(file.type, file.name);
  const fileExtension = getFileExtension(mediaType, file.name);
  const attachmentId = createId("att");
  const attachmentFilename = getAttachmentFilename(attachmentId, fileExtension);
  const localUri = storage.getLocalUri(attachmentFilename);
  const data = file;
  const size = await storage.saveFile(localUri, data);

  const result = await createWorkspaceResource({
    db,
    storage: { content: { kind: "file" } },
    name: file.name,
    parentId,
    resourceTypeId: pluginId,
    position,
    workspaceId,
  });
  const metadata: FileMetadata = {
    attachmentId,
    fileExtension,
    filename: file.name,
    mediaType,
    size,
    uploadedAt: new Date().toISOString(),
  };
  const attachmentMetaData = serializeAttachmentMetadata(metadata, workspaceId);

  await Promise.all([
    db.execute(
      `INSERT INTO ${ATTACHMENTS_TABLE} (id, filename, local_uri, timestamp, size, media_type, state, has_synced, meta_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attachmentId,
        attachmentFilename,
        localUri,
        Date.now(),
        size,
        mediaType,
        AttachmentState.QUEUED_UPLOAD,
        0,
        attachmentMetaData,
      ]
    ),
    setFileStorageMetadata({
      backingId: attachmentId,
      db,
      metadata: { ...metadata, fileId: metadata.attachmentId },
      workspaceId,
      storageId: result.storage.content!.storageId,
    }),
  ]);

  return { attachmentId, id: result.id, name: file.name };
}

export async function getFileMetadata(params: {
  db: DatabaseOrTx;
  resourceId: string;
  pluginId?: string;
  workspaceId: string;
}) {
  return params.db.getOptional<{ value: string }>(
    `SELECT slot.metadata AS value
      FROM (${WORKSPACE_RESOURCES_UNION}) resource
      JOIN (${WORKSPACE_STORAGE_SLOTS_UNION}) slot
        ON slot.resource_id = resource.id
       AND slot.name = 'content'
       AND slot.kind = 'file'
      WHERE resource.workspace_id = ? AND resource.id = ?
      LIMIT 1`,
    [params.workspaceId, params.resourceId]
  );
}

export async function getFileMetadataValue(params: {
  db: DatabaseOrTx;
  resourceId: string;
  pluginId?: string;
  workspaceId: string;
}) {
  return parseFileMetadata((await getFileMetadata(params))?.value);
}

export function buildFileAttachmentQuery(resourceId: string, storageId?: string) {
  return {
    params: [
      storageId ?? "",
      storageId ?? "",
      resourceId,
    ],
    query: `SELECT slot.metadata AS value,
        a.id, a.local_uri, a.state, a.has_synced, a.media_type
      FROM (${WORKSPACE_RESOURCES_UNION}) pi
      JOIN (${WORKSPACE_STORAGE_SLOTS_UNION}) slot
        ON slot.resource_id = pi.id
       AND slot.kind = 'file'
       AND (slot.id = ? OR (slot.name = 'content' AND ? = ''))
      LEFT JOIN ${ATTACHMENTS_TABLE} a
        ON a.id = COALESCE(
          json_extract(slot.metadata, '$.fileId'),
          json_extract(slot.metadata, '$.attachmentId')
        )
      WHERE pi.id = ?
      LIMIT 1`,
  };
}

export class FileAttachmentAlreadyExistsError extends Error {
  readonly resourceId: string;

  constructor(resourceId: string) {
    super("Workspace resource already has a file attachment");
    this.resourceId = resourceId;
    this.name = "FileAttachmentAlreadyExistsError";
  }
}

async function assertFileAttachmentUploadAvailable(params: {
  db: DatabaseOrTx;
  expectedAttachmentId?: string;
  resourceId: string;
  workspaceId: string;
  storageId: string;
}) {
  const { db, expectedAttachmentId, resourceId, workspaceId, storageId } = params;
  const resource = await getWorkspaceResource({ db, id: resourceId });
  const slot = await getStorageSlot(db, storageId);
  if (
    !resource ||
    resource.workspace_id !== workspaceId ||
    !slot ||
    slot.kind !== "file" ||
    slot.workspace_id !== workspaceId ||
    slot.resource_id !== resourceId
  ) {
    throw new Error("Attachment target resource changed during upload");
  }
  const metadata = parseFileMetadata(slot.metadata);
  if (metadata?.attachmentId !== expectedAttachmentId) {
    throw new FileAttachmentAlreadyExistsError(resourceId);
  }
}

export async function uploadFileAttachmentToWorkspaceResource(params: {
  api: ApiClient;
  db: Database;
  file: File;
  resourceId: string;
  workspaceId: string;
  replaceExisting?: boolean;
  storageId?: string;
}) {
  const { api, db, file, resourceId, workspaceId, replaceExisting = false } = params;
  const resource = await getWorkspaceResource({ db, id: resourceId });
  const pluginId = resource?.resource_type_id;
  if (!resource || resource.workspace_id !== workspaceId || !pluginId) {
    throw new Error("Attachment target resource was not found");
  }
  const slot = params.storageId
    ? await getStorageSlot(db, params.storageId)
    : (await getResourceStorageSlots(db, resourceId)).find(
        (candidate) => candidate.name === "content" && candidate.kind === "file",
      );
  if (
    !slot ||
    slot.kind !== "file" ||
    slot.workspace_id !== workspaceId ||
    slot.resource_id !== resourceId
  ) {
    throw new Error("File storage target was not found");
  }
  const existing = parseFileMetadata(slot.metadata);
  if (existing && !replaceExisting) {
    throw new FileAttachmentAlreadyExistsError(resourceId);
  }

  const mediaType = getFileMediaType(file.type, file.name);
  const fileExtension = getFileExtension(mediaType, file.name);
  const visibility = await resolveWorkspaceVisibility(db, workspaceId);
  if (visibility === WORKSPACE_VISIBILITY.local) {
    return uploadLocalFileAttachmentToWorkspaceResource({
      db,
      file,
      fileExtension,
      resourceId,
      mediaType,
      previousMetadata: existing,
      workspaceId,
      storageId: slot.id,
    });
  }

  const queue = getAttachmentQueue({
    api,
    db,
    workspaceId,
    watchAttachments: createFileAttachmentWatcher({ db, workspaceId }),
  });
  await queue.localStorage.initialize();
  const uploadedAt = new Date().toISOString();
  const attachmentId = await queue.generateAttachmentId();
  const localUri = queue.localStorage.getLocalUri(
    getAttachmentFilename(attachmentId, fileExtension)
  );
  let metadata: FileMetadata | null = null;

  try {
    await queue.saveFile({
      data: file,
      fileExtension,
      id: attachmentId,
      mediaType,
      metaData: JSON.stringify({
        fileExtension, filename: file.name, mediaType, workspaceId,
        replacementFileId: existing?.attachmentId, replacementStorageId: slot.id,
      }),
      updateHook: async (tx, savedAttachment) => {
        const transactionDb = tx as unknown as DatabaseOrTx;
        await assertFileAttachmentUploadAvailable({
          db: transactionDb,
          expectedAttachmentId: existing?.attachmentId,
          resourceId,
          workspaceId,
          storageId: slot.id,
        });

        metadata = {
          attachmentId: savedAttachment.id,
          fileExtension,
          filename: file.name,
          mediaType,
          size: file.size,
          uploadedAt,
        };
        await setFileStorageMetadata({
          backingId: savedAttachment.id,
          db: transactionDb,
          metadata: { ...metadata, fileId: savedAttachment.id },
          workspaceId,
          storageId: slot.id,
        });
      },
    });
  } catch (error) {
    await queue.localStorage.deleteFile(localUri).catch(() => undefined);
    throw error;
  }

  if (!metadata) throw new Error("File attachment metadata was not created");
  return metadata;
}

async function uploadLocalFileAttachmentToWorkspaceResource(params: {
  db: Database;
  file: File;
  fileExtension: string;
  resourceId: string;
  mediaType: string;
  previousMetadata: FileMetadata | null;
  workspaceId: string;
  storageId: string;
}) {
  const {
    db,
    file,
    fileExtension,
    resourceId,
    mediaType,
    previousMetadata,
    workspaceId,
    storageId,
  } = params;
  const attachmentId = createId("att");
  const storage = new IndexedDbFileStorageAdapter(
    getFileStorageDatabaseName(workspaceId)
  );
  await storage.initialize();
  const attachmentFilename = getAttachmentFilename(attachmentId, fileExtension);
  const localUri = storage.getLocalUri(attachmentFilename);
  const size = await storage.saveFile(localUri, file);
  const metadata: FileMetadata = {
    attachmentId,
    fileExtension,
    filename: file.name,
    mediaType,
    size,
    uploadedAt: new Date().toISOString(),
  };

  try {
    await ensureTx(db, async (tx) => {
      await assertFileAttachmentUploadAvailable({
        db: tx,
        expectedAttachmentId: previousMetadata?.attachmentId,
        resourceId,
        workspaceId,
        storageId,
      });

      await tx.execute(
        `INSERT INTO ${ATTACHMENTS_TABLE} (id, filename, local_uri, timestamp, size, media_type, state, has_synced, meta_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attachmentId,
          attachmentFilename,
          localUri,
          Date.now(),
          size,
          mediaType,
          AttachmentState.QUEUED_UPLOAD,
          0,
          serializeAttachmentMetadata(metadata, workspaceId),
        ]
      );
      if (previousMetadata) {
        await queueFileAttachmentDeletion({
          db: tx,
          metadata: previousMetadata,
          workspaceId,
        });
      }
      await setFileStorageMetadata({
        backingId: attachmentId,
        db: tx,
        metadata: { ...metadata, fileId: attachmentId },
        workspaceId,
        storageId,
      });
    });
  } catch (error) {
    await storage.deleteFile(localUri).catch(() => undefined);
    throw error;
  }

  return metadata;
}
