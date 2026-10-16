import {
  type AttachmentData,
  type AttachmentRecord,
  AttachmentState,
  type Transaction,
  type WatchedAttachmentItem,
} from "@powersync/common";
import { createId } from "@repo/utils";
import { log, parseError } from "evlog";
import type { Database } from "../../core";
import type { ApiClient } from "../../http";
import { IndexedDbFileStorageAdapter } from "../../storage/indexeddb-file-storage";
import { getAttachmentStorageDatabaseName } from "./constants";
import {
  CAPACITY_EVENT,
  TRANSFER_EVENT,
  errorStatus,
  type FileTransferState,
  uploadChunks,
} from "./chunked-upload";
import type { WatchAttachments } from "./services";

/** Application-owned transfer loop; PowerSync still owns attachment metadata and observation. */
export class ChunkedAttachmentQueue {
  readonly localStorage: IndexedDbFileStorageAdapter;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly options: {
    api: ApiClient;
    db: Database;
    workspaceId: string;
    watchAttachments: WatchAttachments;
  };

  constructor(options: ChunkedAttachmentQueue["options"]) {
    this.options = options;
    this.localStorage = new IndexedDbFileStorageAdapter(
      getAttachmentStorageDatabaseName(options.workspaceId)
    );
  }
  async generateAttachmentId() {
    return createId("att");
  }

  async saveFile(params: {
    data: AttachmentData | Blob;
    fileExtension: string;
    mediaType?: string;
    metaData?: string;
    id?: string;
    updateHook?: (
      tx: Transaction,
      attachment: AttachmentRecord
    ) => Promise<void>;
  }): Promise<AttachmentRecord> {
    const id = params.id ?? (await this.generateAttachmentId());
    const filename = `${id}.${params.fileExtension}`;
    const localUri = this.localStorage.getLocalUri(filename);
    const size = await this.localStorage.saveFile(localUri, params.data);
    const attachment: AttachmentRecord = {
      id,
      filename,
      localUri,
      size,
      mediaType: params.mediaType,
      metaData: params.metaData,
      state: AttachmentState.QUEUED_UPLOAD,
      hasSynced: false,
      timestamp: Date.now(),
    };
    try {
      await this.options.db.writeTransaction(async (tx) => {
        await params.updateHook?.(tx, attachment);
        await this.upsert(tx, attachment);
      });
    } catch (error) {
      await this.localStorage.deleteFile(localUri).catch(() => undefined);
      throw error;
    }
    void this.tick();
    return attachment;
  }

  async startSync() {
    if (this.abort) {
      return;
    }
    await this.localStorage.initialize();
    this.abort = new AbortController();
    this.options.watchAttachments(
      (items) => this.observe(items),
      this.abort.signal
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    if (typeof window !== "undefined") {
      window.addEventListener(CAPACITY_EVENT, this.retryBlocked);
    }
    void this.tick();
  }
  async stopSync() {
    this.abort?.abort();
    this.abort = undefined;
    clearInterval(this.timer);
    if (typeof window !== "undefined") {
      window.removeEventListener(CAPACITY_EVENT, this.retryBlocked);
    }
    await this.running;
  }

  readonly retryBlocked = async () => {
    for (const attachment of await this.rows()) {
      const state = await this.localStorage.readTransfer<FileTransferState>(
        attachment.id
      );
      if (state?.state === "blocked") {
        await this.localStorage.writeTransfer(attachment.id, {
          ...state,
          state: "uploading",
          error: undefined,
        });
      }
    }
    void this.tick();
  };

  private async observe(items: WatchedAttachmentItem[]) {
    if (!this.abort || this.abort.signal.aborted) {
      return;
    }
    const watched = new Set(items.map((item) => item.id));
    await this.options.db.writeTransaction(async (tx) => {
      const current = new Map(
        (await this.rows(tx)).map((row) => [row.id, row])
      );
      for (const item of items) {
        const existing = current.get(item.id);
        if (!existing) {
          await this.upsert(tx, {
            id: item.id,
            filename: item.filename ?? `${item.id}.${item.fileExtension}`,
            metaData: item.metaData,
            mediaType: item.mediaType,
            state: AttachmentState.QUEUED_DOWNLOAD,
            hasSynced: false,
            timestamp: Date.now(),
          });
        } else if (existing.state === AttachmentState.ARCHIVED) {
          await this.upsert(tx, {
            ...existing,
            state: existing.hasSynced
              ? AttachmentState.SYNCED
              : existing.localUri
                ? AttachmentState.QUEUED_UPLOAD
                : AttachmentState.QUEUED_DOWNLOAD,
          });
        }
      }
      for (const row of current.values()) {
        if (
          !watched.has(row.id) &&
          row.state !== AttachmentState.ARCHIVED &&
          row.state !== AttachmentState.QUEUED_DELETE &&
          !(row.state === AttachmentState.QUEUED_UPLOAD && !row.hasSynced)
        ) {
          await this.upsert(tx, { ...row, state: AttachmentState.ARCHIVED });
        }
      }
    });
    void this.tick();
  }

  private tick(): Promise<void> {
    if (!this.abort || this.running) {
      return this.running ?? Promise.resolve();
    }
    const signal = this.abort.signal;
    const run = async () => {
      for (const attachment of await this.rows()) {
        if (signal.aborted) {
          break;
        }
        try {
          await this.transfer(attachment, signal);
        } catch (error) {
          if (
            attachment.state === AttachmentState.QUEUED_DOWNLOAD &&
            [404, 410].includes(errorStatus(error) ?? 0)
          ) {
            // Metadata can synchronize before the uploading device finishes.
            // Keep retrying while the file remains referenced.
            continue;
          }
          if (!signal.aborted) {
            log.warn({
              context: "FileTransfer",
              message: "File transfer interrupted",
              workspaceId: this.options.workspaceId,
              fileId: attachment.id,
              error: parseError(error),
            });
          }
        }
      }
    };
    // Prevent two browser tabs from operating the same durable session concurrently.
    this.running = (
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request(
            `lunaris-file-transfer:${this.options.workspaceId}`,
            { signal },
            run
          )
        : run()
    )
      .catch((error) => {
        if (!signal.aborted) {
          log.error({
            context: "FileTransfer",
            message: "File queue failed",
            error: parseError(error),
          });
        }
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async transfer(attachment: AttachmentRecord, signal: AbortSignal) {
    const { api, workspaceId, db } = this.options;
    if (
      attachment.state === AttachmentState.QUEUED_UPLOAD &&
      attachment.localUri
    ) {
      const saved = await this.localStorage.readTransfer<FileTransferState>(
        attachment.id
      );
      if (saved?.state === "blocked") {
        return;
      }
      const blob = await this.localStorage.readBlob(attachment.localUri);
      if (
        !(await uploadChunks({
          api,
          storage: this.localStorage,
          workspaceId,
          attachment,
          blob,
          signal,
        }))
      ) {
        return;
      }
      await db.execute(
        "UPDATE attachments SET state = ?, has_synced = 1 WHERE id = ? AND state = ?",
        [AttachmentState.SYNCED, attachment.id, AttachmentState.QUEUED_UPLOAD]
      );
    } else if (attachment.state === AttachmentState.QUEUED_DOWNLOAD) {
      const { downloadUrl } = await api.get<{ downloadUrl: string }>(
        `/v1/files/${attachment.id}/download-url`,
        {
          params: { filename: attachment.filename, workspaceId },
          signal,
        }
      );
      const response = await fetch(downloadUrl, { signal });
      if (!(response.ok && response.body)) {
        if (response.status === 404 || response.status === 410) {
          return;
        }
        throw new Error("File download failed");
      }
      const localUri = this.localStorage.getLocalUri(attachment.filename);
      const size = await this.localStorage.saveStream(
        localUri,
        response.body,
        attachment.mediaType
      );
      await db.execute(
        "UPDATE attachments SET state = ?, has_synced = 1, local_uri = ?, size = ? WHERE id = ? AND state = ?",
        [
          AttachmentState.SYNCED,
          localUri,
          size,
          attachment.id,
          AttachmentState.QUEUED_DOWNLOAD,
        ]
      );
    } else if (attachment.state === AttachmentState.QUEUED_DELETE) {
      const state = await this.localStorage.readTransfer<FileTransferState>(
        attachment.id
      );
      if (state && state.state !== "completed") {
        try {
          await api.post(`/v1/files/upload-sessions/${state.id}/cancel`, {
            signal,
          });
        } catch (error) {
          if (![404, 410].includes(errorStatus(error) ?? 0)) {
            throw error;
          }
        }
      }
      try {
        await api.delete(`/v1/files/${attachment.id}`, {
          params: { filename: attachment.filename, workspaceId },
          signal,
        });
      } catch (error) {
        if (![404, 410].includes(errorStatus(error) ?? 0)) {
          throw error;
        }
      }
      if (attachment.localUri) {
        await this.localStorage.deleteFile(attachment.localUri);
      }
      await this.localStorage.deleteTransfer(attachment.id);
      await db.execute("DELETE FROM attachments WHERE id = ? AND state = ?", [
        attachment.id,
        AttachmentState.QUEUED_DELETE,
      ]);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(TRANSFER_EVENT, { detail: { workspaceId } })
        );
      }
    }
  }

  private rows(
    db: Pick<Database, "getAll"> = this.options.db
  ): Promise<AttachmentRecord[]> {
    return db.getAll<AttachmentRecord>(
      `SELECT id, filename, local_uri AS localUri, size,
      media_type AS mediaType, meta_data AS metaData, has_synced AS hasSynced, state, timestamp
      FROM attachments WHERE json_extract(meta_data, '$.workspaceId') = ? ORDER BY timestamp`,
      [this.options.workspaceId]
    );
  }
  private upsert(tx: Transaction, attachment: AttachmentRecord) {
    return tx.execute(
      `INSERT OR REPLACE INTO attachments
      (id, filename, local_uri, size, media_type, meta_data, has_synced, state, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attachment.id,
        attachment.filename,
        attachment.localUri ?? null,
        attachment.size ?? null,
        attachment.mediaType ?? null,
        attachment.metaData ?? null,
        attachment.hasSynced ? 1 : 0,
        attachment.state,
        attachment.timestamp ?? Date.now(),
      ]
    );
  }
}
