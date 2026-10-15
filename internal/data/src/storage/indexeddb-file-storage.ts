import type { AttachmentData, LocalStorageAdapter } from "@powersync/common";

const STORE_NAME = "files";
const CHUNKS = "chunks";
const TRANSFERS = "transfers";
export const FILE_CHUNK_BYTES = 16 * 1024 * 1024;
interface ChunkManifest {
  chunks: number;
  size: number;
  type: string;
  version: string;
}

/** Chunked, durable file storage. */
export class IndexedDbFileStorageAdapter implements LocalStorageAdapter {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly databaseName: string;

  constructor(databaseName = "PowerSyncFiles") {
    this.databaseName = databaseName;
  }

  initialize(): Promise<void> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, 2);
        request.onupgradeneeded = () => {
          for (const name of [STORE_NAME, CHUNKS, TRANSFERS]) {
            if (!request.result.objectStoreNames.contains(name))
              request.result.createObjectStore(name);
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            this.databasePromise = null;
          };
          resolve(request.result);
        };
        request.onerror = () => {
          this.databasePromise = null;
          reject(request.error);
        };
      });
    }
    return this.databasePromise.then(() => undefined);
  }

  async close(): Promise<void> {
    const database = await this.databasePromise;
    database?.close();
    this.databasePromise = null;
  }

  async clear(): Promise<void> {
    const database = await this.database();
    const tx = database.transaction([STORE_NAME, CHUNKS, TRANSFERS], "readwrite");
    const done = transactionDone(tx);
    for (const name of [STORE_NAME, CHUNKS, TRANSFERS]) tx.objectStore(name).clear();
    await done;
  }

  getLocalUri(filename: string) {
    return `indexeddb://${this.databaseName}/${STORE_NAME}/${filename}`;
  }

  async saveFile(filePath: string, data: AttachmentData | Blob): Promise<number> {
    const blob =
      data instanceof Blob
        ? data
        : new Blob([typeof data === "string" ? decodeBase64(data) : data]);
    return this.saveStream(filePath, blob.stream(), blob.type);
  }

  async saveStream(
    filePath: string,
    stream: ReadableStream<Uint8Array>,
    type = "application/octet-stream",
  ) {
    const version = crypto.randomUUID();
    const previous = await this.readValue<unknown>(STORE_NAME, filePath);
    const reader = stream.getReader();
    let chunks = 0;
    let size = 0;
    let pending: Uint8Array<ArrayBuffer>[] = [];
    let pendingSize = 0;
    const flush = async () => {
      if (!pendingSize) return;
      await this.writeValue(CHUNKS, `${version}/${chunks++}`, new Blob(pending));
      pending = [];
      pendingSize = 0;
    };
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        let offset = 0;
        while (offset < next.value.byteLength) {
          const length = Math.min(FILE_CHUNK_BYTES - pendingSize, next.value.byteLength - offset);
          pending.push(new Uint8Array(next.value.subarray(offset, offset + length)));
          pendingSize += length;
          size += length;
          offset += length;
          if (pendingSize === FILE_CHUNK_BYTES) await flush();
        }
      }
      await flush();
      await this.writeValue(STORE_NAME, filePath, {
        version,
        chunks,
        size,
        type,
      } satisfies ChunkManifest);
      // Publishing the new manifest is the commit point. A stale-chunk cleanup
      // failure must never remove bytes referenced by that committed manifest.
      if (isManifest(previous)) await this.deleteChunks(previous.version).catch(() => undefined);
      return size;
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      await this.deleteChunks(version).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async readBlob(filePath: string): Promise<Blob> {
    const value = await this.readValue<unknown>(STORE_NAME, filePath);
    if (!isManifest(value)) throw new Error("File not found");
    const parts: Blob[] = [];
    for (let index = 0; index < value.chunks; index++) {
      const blob = await this.readValue<Blob>(CHUNKS, `${value.version}/${index}`);
      if (!(blob instanceof Blob)) throw new Error("Local file chunk is missing");
      parts.push(blob);
    }
    return new Blob(parts, { type: value.type });
  }

  /** PowerSync adapter API; transfer, ingestion, preview and export use readBlob. */
  async readFile(filePath: string): Promise<ArrayBuffer> {
    return (await this.readBlob(filePath)).arrayBuffer();
  }

  async deleteFile(filePath: string): Promise<void> {
    const value = await this.readValue<unknown>(STORE_NAME, filePath);
    await this.deleteValue(STORE_NAME, filePath);
    if (isManifest(value)) await this.deleteChunks(value.version);
  }

  async fileExists(filePath: string) {
    return isManifest(await this.readValue<unknown>(STORE_NAME, filePath));
  }
  async makeDir(_path: string) {}
  async rmDir(path: string) {
    const database = await this.database();
    const tx = database.transaction(STORE_NAME);
    const keys = await requestAsPromise(
      tx.objectStore(STORE_NAME).getAllKeys(IDBKeyRange.bound(`${path}/`, `${path}/\uffff`)),
    );
    for (const key of keys) await this.deleteFile(String(key));
  }

  readTransfer<T>(id: string) {
    return this.readValue<T>(TRANSFERS, id);
  }
  writeTransfer<T>(id: string, value: T) {
    return this.writeValue(TRANSFERS, id, value);
  }
  deleteTransfer(id: string) {
    return this.deleteValue(TRANSFERS, id);
  }

  private async database() {
    await this.initialize();
    const database = await this.databasePromise;
    if (!database) throw new Error("Attachment storage is not initialized");
    return database;
  }
  private async readValue<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    const database = await this.database();
    return requestAsPromise(database.transaction(store).objectStore(store).get(key));
  }
  private async writeValue<T>(store: string, key: IDBValidKey, value: T) {
    const database = await this.database();
    const tx = database.transaction(store, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(store).put(value, key);
    await done;
  }
  private async deleteValue(store: string, key: IDBValidKey | IDBKeyRange) {
    const database = await this.database();
    const tx = database.transaction(store, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(store).delete(key);
    await done;
  }
  private deleteChunks(version: string) {
    return this.deleteValue(CHUNKS, IDBKeyRange.bound(`${version}/`, `${version}/\uffff`));
  }
}

function isManifest(value: unknown): value is ChunkManifest {
  return !!value && typeof value === "object" && "version" in value && "chunks" in value;
}
function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Local storage transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Local storage transaction failed"));
  });
}
