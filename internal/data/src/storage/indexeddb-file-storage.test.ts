/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IndexedDbFileStorageAdapter } from "./indexeddb-file-storage";

describe("IndexedDbFileStorageAdapter", () => {
  it("preserves bytes and supports deletion", async () => {
    const adapter = new IndexedDbFileStorageAdapter(
      `files-${crypto.randomUUID()}`
    );
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    await adapter.initialize();
    await expect(adapter.saveFile("workspace/file", bytes)).resolves.toBe(3);
    await expect(adapter.fileExists("workspace/file")).resolves.toBe(true);
    await expect(adapter.readFile("workspace/file")).resolves.toEqual(bytes);

    await adapter.deleteFile("workspace/file");
    await expect(adapter.fileExists("workspace/file")).resolves.toBe(false);
  });

  it("decodes base64 attachment data", async () => {
    const adapter = new IndexedDbFileStorageAdapter(
      `files-${crypto.randomUUID()}`
    );

    await adapter.initialize();
    await expect(adapter.saveFile("encoded", "AQID")).resolves.toBe(3);
    await expect(adapter.readFile("encoded")).resolves.toEqual(
      new Uint8Array([1, 2, 3]).buffer
    );
  });
});

it("rejects old ArrayBuffer records and allows chunked replacements", async () => {
  const name = `legacy-${crypto.randomUUID()}`;
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("files");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("files", "readwrite");
      tx.objectStore("files").put(new Uint8Array([4, 5, 6]).buffer, "legacy");
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
    };
  });
  const storage = new IndexedDbFileStorageAdapter(name);
  try {
    await expect(storage.fileExists("legacy")).resolves.toBe(false);
    await expect(storage.readFile("legacy")).rejects.toThrow("File not found");
    await expect(
      storage.saveFile("legacy", new Uint8Array([7, 8]).buffer)
    ).resolves.toBe(2);
    await expect(storage.fileExists("legacy")).resolves.toBe(true);
    expect(new Uint8Array(await storage.readFile("legacy"))).toEqual(
      new Uint8Array([7, 8])
    );
  } finally {
    await storage.close();
  }
});

it("ingests chunks without calling whole-file arrayBuffer and resumes with a new adapter", async () => {
  const name = `chunked-${crypto.randomUUID()}`;
  const storage = new IndexedDbFileStorageAdapter(name);
  const file = new Blob([
    new Uint8Array(16 * 1024 * 1024),
    new Uint8Array([7, 8, 9]),
  ]);
  Object.defineProperty(file, "arrayBuffer", {
    value: () => {
      throw new Error("Whole file buffer forbidden");
    },
  });
  // Node's Blob.stream calls arrayBuffer internally; use a browser-like chunk source to enforce bounded reads.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(16 * 1024 * 1024));
      controller.enqueue(new Uint8Array([7, 8, 9]));
      controller.close();
    },
  });
  expect(await storage.saveStream("large", stream)).toBe(file.size);
  await storage.writeTransfer("large", {
    id: "session",
    uploadedBytes: 16 * 1024 * 1024,
  });
  const restarted = new IndexedDbFileStorageAdapter(name);
  const loaded = await restarted.readBlob("large");
  expect(loaded.size).toBe(file.size);
  expect(new Uint8Array(await loaded.slice(-3).arrayBuffer())).toEqual(
    new Uint8Array([7, 8, 9])
  );
  expect(await restarted.readTransfer("large")).toEqual({
    id: "session",
    uploadedBytes: 16 * 1024 * 1024,
  });
});

it("preserves the previous local file when ingestion fails", async () => {
  const storage = new IndexedDbFileStorageAdapter(
    `full-${crypto.randomUUID()}`
  );
  await storage.saveFile("file", new Uint8Array([1]).buffer);
  const failed = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new DOMException("Disk full", "QuotaExceededError"));
    },
  });
  await expect(storage.saveStream("file", failed)).rejects.toThrow("Disk full");
  expect(new Uint8Array(await storage.readFile("file"))).toEqual(
    new Uint8Array([1])
  );
});

it("keeps committed replacement bytes when stale-chunk cleanup fails", async () => {
  const storage = new IndexedDbFileStorageAdapter(
    `cleanup-${crypto.randomUUID()}`
  );
  await storage.saveFile("file", new Uint8Array([1]).buffer);
  const deletion = vi
    .spyOn(IDBObjectStore.prototype, "delete")
    .mockImplementationOnce(() => {
      throw new DOMException("Cleanup interrupted", "AbortError");
    });
  try {
    await expect(
      storage.saveFile("file", new Uint8Array([2]).buffer)
    ).resolves.toBe(1);
    expect(new Uint8Array(await storage.readFile("file"))).toEqual(
      new Uint8Array([2])
    );
  } finally {
    deletion.mockRestore();
    await storage.close();
  }
});
