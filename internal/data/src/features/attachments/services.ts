import { type FileTransferState, TRANSFER_EVENT } from "./chunked-upload";
import { ChunkedAttachmentQueue } from "./chunked-attachment-queue";
import {
  type AttachmentErrorHandler,
  type AttachmentQueue,
  AttachmentState,
} from "@powersync/common";
import { log, parseError } from "evlog";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Database, type DatabaseOrTx, usePowerSync } from "../../core";
import type { ApiClient } from "../../http";
import { IndexedDbFileStorageAdapter } from "../../storage/indexeddb-file-storage";
import { getAllWorkspaces } from "../workspaces";
import { getAttachmentStorageDatabaseName } from "./constants";
import type {
  AttachmentRow,
  AttachmentRowWithValue,
  StoredAttachmentMetadata,
} from "./types";

export { ATTACHMENTS_TABLE, getFileStorageDatabaseName } from "./constants";
export type { AttachmentRow, AttachmentRowWithValue, StoredAttachmentMetadata };
export { AttachmentState };

export type WatchAttachments = ConstructorParameters<
  typeof AttachmentQueue
>[0]["watchAttachments"];

interface QueueKey {
  db: Database;
  queueId?: string;
  workspaceId: string;
}

interface AttachmentQueryDb {
  getOptional<T>(query: string, params?: unknown[]): Promise<T | null>;
}

const queues = new WeakMap<Database, Map<string, ChunkedAttachmentQueue>>();

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return;
  }
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
}

function isMissingRemoteFileError(error: unknown) {
  const status = getErrorStatus(error);
  return status === 404 || status === 410;
}

export function createAttachmentErrorHandler(): AttachmentErrorHandler {
  return {
    onDeleteError: async () => true,
    onDownloadError: async (_attachment, error) =>
      !isMissingRemoteFileError(error),
    onUploadError: async () => true,
  };
}

function getQueueMap(db: Database) {
  let map = queues.get(db);
  if (!map) {
    map = new Map();
    queues.set(db, map);
  }
  return map;
}

function getQueueKey(workspaceId: string, queueId?: string) {
  return queueId ? `${workspaceId}:${queueId}` : workspaceId;
}

export function parseAttachmentMetadata<T>(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function getFileStorageWorkspaceIds(db: DatabaseOrTx) {
  const workspaces = await getAllWorkspaces({ db });
  return workspaces.map((workspace) => workspace.id);
}

export async function deleteFileStorageDatabases(workspaceIds: string[]) {
  if (typeof indexedDB === "undefined" || workspaceIds.length === 0) {
    return;
  }

  await Promise.all(
    [...new Set(workspaceIds)].map((workspaceId) =>
      clearAndDeleteFileStorageDatabase(
        getAttachmentStorageDatabaseName(workspaceId)
      )
    )
  );
}

async function clearAndDeleteFileStorageDatabase(databaseName: string) {
  await clearFileStorageDatabase(databaseName);
  await deleteIndexedDbDatabase(databaseName);
}

function clearFileStorageDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(databaseName);
    } catch (error) {
      log.error({
        tag: "AttachmentStorage",
        msg: "attachment storage open threw before clear",
        databaseName,
        error: parseError(error),
      });
      resolve();
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("files")) {
        req.result.createObjectStore("files");
      }
    };
    req.onerror = () => {
      log.error({
        tag: "AttachmentStorage",
        msg: "attachment storage open failed before clear",
        databaseName,
        error: parseError(req.error ?? new Error("indexedDB open failed")),
      });
      resolve();
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const stores = Array.from(db.objectStoreNames);
        const tx = db.transaction(stores, "readwrite");
        for (const store of stores) {
          tx.objectStore(store).clear();
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          log.error({
            tag: "AttachmentStorage",
            msg: "attachment storage clear failed",
            databaseName,
            error: parseError(
              tx.error ?? new Error("attachment storage clear failed")
            ),
          });
          db.close();
          resolve();
        };
      } catch (error) {
        log.error({
          tag: "AttachmentStorage",
          msg: "attachment storage clear threw",
          databaseName,
          error: parseError(error),
        });
        db.close();
        resolve();
      }
    };
  });
}

function deleteIndexedDbDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.deleteDatabase(databaseName);
    } catch (error) {
      log.error({
        tag: "AttachmentStorage",
        msg: "attachment storage deleteDatabase threw",
        databaseName,
        error: parseError(error),
      });
      resolve();
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => {
      log.error({
        tag: "AttachmentStorage",
        msg: "attachment storage deleteDatabase failed",
        databaseName,
        error: parseError(req.error ?? new Error("deleteDatabase failed")),
      });
      resolve();
    };
    req.onblocked = () => {
      log.warn({
        tag: "AttachmentStorage",
        msg: "attachment storage deleteDatabase blocked",
        databaseName,
      });
      resolve();
    };
  });
}

export function createAttachmentQueue(params: {
  api: ApiClient;
  db: Database;
  workspaceId: string;
  watchAttachments: WatchAttachments;
}) {
  return new ChunkedAttachmentQueue(params);
}

export function getAttachmentQueue(params: {
  api: ApiClient;
  db: Database;
  workspaceId: string;
  queueId?: string;
  watchAttachments: WatchAttachments;
}) {
  const { api, db, workspaceId, queueId, watchAttachments } = params;
  const map = getQueueMap(db);
  const key = getQueueKey(workspaceId, queueId);
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const queue = createAttachmentQueue({
    api,
    db,
    workspaceId,
    watchAttachments,
  });
  map.set(key, queue);
  return queue;
}

export async function startAttachmentQueue(
  params: QueueKey & { api: ApiClient; watchAttachments: WatchAttachments }
) {
  const queue = getAttachmentQueue(params);
  await queue.startSync();
  return queue;
}

export async function stopAttachmentQueue(params: QueueKey) {
  const map = queues.get(params.db);
  const key = getQueueKey(params.workspaceId, params.queueId);
  const queue = map?.get(key);
  if (!queue) {
    return;
  }
  await queue.stopSync();
  map?.delete(key);
}

export async function readAttachmentFile(params: {
  localUri: string;
  mediaType?: string | null;
  workspaceId: string;
}) {
  const adapter = new IndexedDbFileStorageAdapter(
    getAttachmentStorageDatabaseName(params.workspaceId)
  );
  await adapter.initialize();
  return adapter.readFile(params.localUri);
}

export async function createAttachmentObjectUrl(params: {
  localUri: string;
  mediaType?: string | null;
  workspaceId: string;
}) {
  const storage = new IndexedDbFileStorageAdapter(
    getAttachmentStorageDatabaseName(params.workspaceId)
  );
  const buffer = await storage.readBlob(params.localUri);
  return URL.createObjectURL(
    new Blob([buffer], {
      type: params.mediaType ?? "application/octet-stream",
    })
  );
}

export async function downloadAttachmentFile(params: {
  filename: string;
  localUri: string;
  mediaType: string;
  workspaceId: string;
}) {
  const url = await createAttachmentObjectUrl(params);
  const link = document.createElement("a");
  link.href = url;
  link.download = params.filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadAttachmentFromQuery<
  T extends StoredAttachmentMetadata,
>(params: {
  db: AttachmentQueryDb;
  metadataFromRow?: (row: AttachmentRowWithValue | undefined) => T | null;
  workspaceId: string;
  query: string;
  queryParams: unknown[];
}): Promise<boolean> {
  const row =
    (await params.db.getOptional<AttachmentRowWithValue>(
      params.query,
      params.queryParams
    )) ?? undefined;
  const metadata =
    params.metadataFromRow?.(row) ?? parseAttachmentMetadata<T>(row?.value);
  if (!(metadata && row?.local_uri)) {
    return false;
  }
  await downloadAttachmentFile({
    filename: metadata.filename,
    localUri: row.local_uri,
    mediaType: metadata.mediaType,
    workspaceId: params.workspaceId,
  });
  return true;
}

interface AttachmentQueryState<TMetadata> {
  attachment: AttachmentRow | null;
  metadata: TMetadata | null;
}

export function useAttachmentQueryState<TMetadata>(params: {
  metadataFromRow?: (
    row: AttachmentRowWithValue | undefined
  ) => TMetadata | null;
  query: string;
  queryParams: unknown[];
}) {
  const db = usePowerSync();
  const memoizedParams = useMemo(
    () => params.queryParams,
    [params.queryParams]
  );
  const [state, setState] = useState<AttachmentQueryState<TMetadata>>({
    attachment: null,
    metadata: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for await (const result of db.watch(params.query, memoizedParams)) {
        if (cancelled) {
          return;
        }
        const row = result.rows?._array[0] as
          | AttachmentRowWithValue
          | undefined;
        setState({
          attachment: row?.id ? row : null,
          metadata:
            params.metadataFromRow?.(row) ??
            parseAttachmentMetadata<TMetadata>(row?.value),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, params.metadataFromRow, params.query, memoizedParams]);

  return state;
}

export function useAttachmentObjectUrl(params: {
  attachment: AttachmentRow | null;
  resourceId?: string;
  mediaType?: string | null;
  workspaceId: string;
}) {
  const { attachment, resourceId, mediaType, workspaceId } = params;
  const [url, setUrl] = useState<string | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const loadedFileKeyRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
      currentUrlRef.current = null;
      loadedFileKeyRef.current = null;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    if (!attachment?.local_uri) {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
      currentUrlRef.current = null;
      loadedFileKeyRef.current = null;
      setUrl(null);
      return;
    }

    const fileKey = [
      workspaceId,
      attachment.id,
      attachment.local_uri,
      mediaType ?? "",
    ].join(":");
    if (loadedFileKeyRef.current === fileKey && currentUrlRef.current) {
      return;
    }

    createAttachmentObjectUrl({
      localUri: attachment.local_uri,
      mediaType,
      workspaceId,
    })
      .then((createdUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        const previousObjectUrl = currentUrlRef.current;
        currentUrlRef.current = createdUrl;
        loadedFileKeyRef.current = fileKey;
        setUrl(createdUrl);
        if (previousObjectUrl) {
          URL.revokeObjectURL(previousObjectUrl);
        }
      })
      .catch((error) => {
        log.error({
          tag: "AttachmentStorage",
          msg: "failed to load local attachment preview",
          error: parseError(error),
          resourceId,
          workspaceId,
          attachmentId: attachment.id,
        });
        if (cancelled) {
          return;
        }
        if (loadedFileKeyRef.current === fileKey && currentUrlRef.current) {
          return;
        }
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
        }
        currentUrlRef.current = null;
        loadedFileKeyRef.current = null;
        if (!cancelled) {
          setUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    attachment?.id,
    attachment?.local_uri,
    resourceId,
    mediaType,
    workspaceId,
  ]);

  return url;
}

export async function getFileTransferStates(db: Database, workspaceId: string) {
  const storage = new IndexedDbFileStorageAdapter(
    getAttachmentStorageDatabaseName(workspaceId)
  );
  try {
    const rows = await db.getAll<{
      id: string;
      filename: string;
      meta_data: string;
    }>(
      "SELECT id, filename, meta_data FROM attachments WHERE state = ? AND json_extract(meta_data, '$.workspaceId') = ?",
      [AttachmentState.QUEUED_UPLOAD, workspaceId]
    );
    const states = await Promise.all(
      rows.map(async (row) => {
        const state = await storage.readTransfer<FileTransferState>(row.id);
        const metadata = parseAttachmentMetadata<{ filename?: string }>(
          row.meta_data
        );
        return state
          ? {
              ...state,
              fileId: row.id,
              filename: metadata?.filename ?? row.filename,
            }
          : undefined;
      })
    );
    return states.filter(
      (
        state
      ): state is FileTransferState & { fileId: string; filename: string } =>
        !!state && state.state !== "completed"
    );
  } finally {
    await storage.close();
  }
}
export function subscribeFileTransfers(
  workspaceId: string,
  listener: () => void
) {
  const handler = (event: Event) => {
    if (
      (event as CustomEvent<{ workspaceId: string }>).detail.workspaceId ===
      workspaceId
    ) {
      listener();
    }
  };
  window.addEventListener(TRANSFER_EVENT, handler);
  return () => window.removeEventListener(TRANSFER_EVENT, handler);
}
export async function retryFileTransfers(db: Database, workspaceId: string) {
  for (const [key, queue] of queues.get(db) ?? []) {
    if (key === workspaceId || key.startsWith(`${workspaceId}:`)) {
      await queue.retryBlocked();
    }
  }
}
