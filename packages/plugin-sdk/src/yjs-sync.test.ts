import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createYjsReplicaSync } from "./yjs-sync";
describe("incremental Yjs replica synchronization", () => {
  it("does not lose a revision queued while the previous request finishes", async () => {
    const host = new Y.Doc(),
      replica = new Y.Doc();
    const fetch = vi.fn(async (vector: ArrayBuffer) => ({
      update: Y.encodeStateAsUpdateV2(host, new Uint8Array(vector)).buffer,
      stateVector: Y.encodeStateVector(host).buffer,
    }));
    let first = true;
    const sync = createYjsReplicaSync(
      replica,
      fetch,
      () => {
        if (first) {
          first = false;
          queueMicrotask(() => {
            host.getMap("cells").set("late", 7);
            void sync.request();
          });
        }
      },
      (error) => {
        throw error;
      },
    );
    await sync.request();
    await vi.waitFor(() => expect(replica.getMap("cells").get("late")).toBe(7));
    expect(fetch).toHaveBeenCalledTimes(2);
    sync.dispose();
    host.destroy();
    replica.destroy();
  });
  it("resends deletion-only edits after a failed upload with equal state vectors", async () => {
    const host = new Y.Doc(),
      replica = new Y.Doc();
    host.getMap("cells").set("a", 1);
    let rejectUpload = true;
    const failed = vi.fn();
    const sync = createYjsReplicaSync(
      replica,
      async (vector) => ({
        update: Y.encodeStateAsUpdateV2(host, new Uint8Array(vector)).buffer,
        stateVector: Y.encodeStateVector(host).buffer,
      }),
      () => {},
      failed,
      async (update) => {
        if (rejectUpload) throw new Error("Disconnected");
        Y.applyUpdateV2(host, new Uint8Array(update));
      },
    );
    await sync.request();
    replica.getMap("cells").delete("a");
    expect(Y.encodeStateVector(replica)).toEqual(Y.encodeStateVector(host));
    await sync.request();
    expect(failed).toHaveBeenCalledOnce();
    expect(host.getMap("cells").has("a")).toBe(true);
    rejectUpload = false;
    await sync.request();
    expect(host.getMap("cells").has("a")).toBe(false);
    sync.dispose();
  });
  it("hydrates, transfers a small delta, and retains unsent local edits", async () => {
    const host = new Y.Doc(),
      replica = new Y.Doc();
    host.transact(() => {
      for (let i = 0; i < 20_000; i++) host.getMap("cells").set(String(i), i);
    });
    const sizes: number[] = [];
    const fetch = vi.fn(async (vector) => {
      const update = Y.encodeStateAsUpdateV2(host, new Uint8Array(vector));
      sizes.push(update.byteLength);
      return {
        update: update.buffer,
        stateVector: Y.encodeStateVector(host).buffer,
      };
    });
    const failed = vi.fn();
    const sync = createYjsReplicaSync(
      replica,
      fetch,
      () => {},
      failed,
      async (update) => Y.applyUpdateV2(host, new Uint8Array(update)),
    );
    await sync.request();
    replica.getMap("cells").set("local", 42);
    host.getMap("cells").set("0", 99);
    await sync.request();
    expect(replica.getMap("cells").get("local")).toBe(42);
    expect(replica.getMap("cells").get("0")).toBe(99);
    expect(host.getMap("cells").get("local")).toBe(42);
    expect(sizes[1]).toBeLessThan(100);
    expect(sizes[0]).toBeGreaterThan(100_000);
    expect(failed).not.toHaveBeenCalled();
    sync.dispose();
  });
  it("coalesces revisions and ignores responses after disposal", async () => {
    const doc = new Y.Doc();
    let resolve!: (value: ArrayBuffer) => void;
    const fetch = vi.fn(
      () =>
        new Promise<ArrayBuffer>((r) => {
          resolve = r;
        }),
    );
    const ready = vi.fn();
    const failed = vi.fn();
    const sync = createYjsReplicaSync(doc, fetch, ready, failed);
    const pending = sync.request();
    void sync.request();
    void sync.request();
    expect(fetch).toHaveBeenCalledTimes(1);
    sync.dispose();
    resolve(Uint8Array.from(Y.encodeStateAsUpdateV2(new Y.Doc())).buffer);
    await pending;
    expect(ready).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
