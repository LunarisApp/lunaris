/** @vitest-environment node */
import "fake-indexeddb/auto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { AttachmentState, type WatchedAttachmentItem } from "@powersync/common";
import type { Database } from "../../core";
import type { ApiClient } from "../../http";
import { ChunkedAttachmentQueue } from "./chunked-attachment-queue";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) {
    await close();
  }
  vi.unstubAllGlobals();
});

function harness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE attachments (id TEXT PRIMARY KEY, filename TEXT, local_uri TEXT,
    size INTEGER, media_type TEXT, meta_data TEXT, has_synced INTEGER, state INTEGER, timestamp INTEGER)`);
  const workspaceId = `workspace-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ workspaceId });
  let observe!: (items: WatchedAttachmentItem[]) => Promise<void>;
  let beforeWrite = () => {};
  const tx = {
    getAll: async (sql: string, params: SQLInputValue[] = []) =>
      sqlite.prepare(sql).all(...params),
    execute: async (sql: string, params: SQLInputValue[] = []) =>
      sqlite.prepare(sql).run(...params),
  };
  const db = {
    ...tx,
    writeTransaction: async (run: (value: typeof tx) => Promise<void>) => {
      beforeWrite();
      await run(tx);
    },
  } as unknown as Database;
  const api = {
    get: vi.fn(async () => ({ downloadUrl: "https://storage.test/file" })),
  };
  const queue = new ChunkedAttachmentQueue({
    db,
    api: api as unknown as ApiClient,
    workspaceId,
    watchAttachments: (update) => {
      observe = async (items) => {
        await update(items);
      };
    },
  });
  const insert = (state: AttachmentState, localUri: string | null = null) => {
    sqlite
      .prepare("INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "file",
        "file.bin",
        localUri,
        3,
        "application/octet-stream",
        metadata,
        0,
        state,
        1
      );
  };
  const row = () =>
    sqlite.prepare("SELECT * FROM attachments WHERE id = 'file'").get();
  cleanup.push(async () => {
    await queue.stopSync();
    await queue.localStorage.close();
    sqlite.close();
  });
  return {
    queue,
    api,
    insert,
    row,
    observe: () =>
      observe([{ id: "file", fileExtension: "bin", metaData: metadata }]),
    beforeWrite: (run: () => void) => {
      beforeWrite = run;
    },
  };
}

it.each(["api", "provider"])(
  "retries %s 404 when metadata arrives before uploaded bytes",
  async (source) => {
    const h = harness();
    h.insert(AttachmentState.QUEUED_DOWNLOAD);
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetch);
    if (source === "api") {
      h.api.get.mockRejectedValueOnce(
        Object.assign(new Error("Pending upload"), { status: 404 })
      );
    } else {
      fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    }
    await h.queue.startSync();
    await vi.waitFor(() => expect(h.api.get).toHaveBeenCalledTimes(1));
    await h.queue.stopSync();
    expect(h.row()?.state).toBe(AttachmentState.QUEUED_DOWNLOAD);
    await h.queue.startSync();
    await vi.waitFor(() => expect(h.row()?.state).toBe(AttachmentState.SYNCED));
    expect(h.row()?.size).toBe(3);
  }
);

it("does not overwrite local bytes committed while observation waits for its transaction", async () => {
  const h = harness();
  await h.queue.startSync();
  h.beforeWrite(() => h.insert(AttachmentState.QUEUED_UPLOAD, "local-pending"));
  await h.observe();
  await h.queue.stopSync();
  expect(h.row()?.local_uri).toBe("local-pending");
  expect(h.row()?.state).toBe(AttachmentState.QUEUED_UPLOAD);
});
