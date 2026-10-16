import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YjsUpdateJournal } from "./yjs-journal";
import { createYjsReplicaSync } from "./yjs-sync";

const vector = (doc: Y.Doc) => Uint8Array.from(Y.encodeStateVector(doc)).buffer;

describe("bounded Yjs update history", () => {
  it("keeps edits small in both directions after 50,000 historical replacements", async () => {
    const host = new Y.Doc(),
      replica = new Y.Doc();
    host.transact(() => {
      for (let i = 0; i < 100_000; i++) {
        host.getMap("cells").set(String(i), i);
      }
    });
    host.transact(() => {
      for (let i = 0; i < 100_000; i += 2) {
        host.getMap("cells").set(String(i), -i);
      }
    });
    const journal = new YjsUpdateJournal(host);
    host.on("updateV2", (update) => journal.record(update));
    const downloads: number[] = [],
      uploads: number[] = [];
    const sync = createYjsReplicaSync(
      replica,
      async (state, cursor) => {
        const response = journal.sync(state, cursor);
        downloads.push(response.update.byteLength);
        return response;
      },
      () => {},
      (error) => {
        throw error;
      },
      async (update) => {
        uploads.push(update.byteLength);
        Y.applyUpdateV2(host, new Uint8Array(update));
      }
    );
    await sync.request();
    expect(downloads[0]).toBeGreaterThan(100_000);
    host.getMap("cells").set("1", 42);
    await sync.request();
    expect(replica.getMap("cells").get("1")).toBe(42);
    expect(downloads[1]).toBeLessThan(100);
    replica.getMap("cells").set("3", 43);
    await sync.request();
    expect(host.getMap("cells").get("3")).toBe(43);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toBeLessThan(100);
    await sync.request();
    expect(downloads.slice(1).every((size) => size < 100)).toBe(true);
    expect(uploads).toHaveLength(1);
    sync.dispose();
    host.destroy();
    replica.destroy();
  });

  it("recovers evicted updates and deletion-only changes through a handshake", () => {
    const host = new Y.Doc(),
      replica = new Y.Doc();
    host.getMap("cells").set("a", 1);
    const journal = new YjsUpdateJournal(host, 1024, 1);
    host.on("updateV2", (update) => journal.record(update));
    const initial = journal.sync(vector(replica));
    Y.applyUpdateV2(replica, new Uint8Array(initial.update));
    host.getMap("cells").delete("a");
    host.getMap("cells").set("b", 2);
    const recovery = journal.sync(vector(replica), initial.cursor);
    expect(recovery.stateVector).toBeInstanceOf(ArrayBuffer);
    Y.applyUpdateV2(replica, new Uint8Array(recovery.update));
    expect(replica.getMap("cells").toJSON()).toEqual({ b: 2 });
    const duplicate = journal.sync(vector(replica), recovery.cursor);
    expect(duplicate.stateVector).toBeUndefined();
    Y.applyUpdateV2(replica, new Uint8Array(duplicate.update));
    expect(replica.getMap("cells").toJSON()).toEqual({ b: 2 });
    host.destroy();
    replica.destroy();
  });

  it("falls back after a byte overflow, document replacement, or invalid cursor", () => {
    const host = new Y.Doc();
    const journal = new YjsUpdateJournal(host, 16);
    host.on("updateV2", (update) => journal.record(update));
    const initial = journal.sync(vector(host));
    host.getMap("cells").set("large", "x".repeat(1024));
    expect(
      journal.sync(vector(host), initial.cursor).stateVector
    ).toBeInstanceOf(ArrayBuffer);
    const replacement = new YjsUpdateJournal(host);
    expect(
      replacement.sync(vector(host), initial.cursor).stateVector
    ).toBeInstanceOf(ArrayBuffer);
    expect(
      journal.sync(vector(host), { epoch: journal.epoch, revision: 0.5 })
        .stateVector
    ).toBeInstanceOf(ArrayBuffer);
    host.destroy();
  });

  it("does not acknowledge an earlier failed deletion when a later edit succeeds", async () => {
    const host = new Y.Doc(),
      replica = new Y.Doc();
    host.getMap("cells").set("a", 1);
    const journal = new YjsUpdateJournal(host);
    host.on("updateV2", (update) => journal.record(update));
    const uploads: number[] = [];
    const sync = createYjsReplicaSync(
      replica,
      async (state, cursor) => journal.sync(state, cursor),
      () => {},
      (error) => {
        throw error;
      },
      async (update) => {
        uploads.push(update.byteLength);
        Y.applyUpdateV2(host, new Uint8Array(update));
      }
    );
    await sync.request();
    replica.getMap("cells").delete("a");
    const success = (update: Uint8Array, origin: unknown) => {
      if (origin === "host") {
        return;
      }
      Y.applyUpdateV2(host, update);
      sync.acknowledge(update);
    };
    replica.on("updateV2", success);
    replica.getMap("cells").set("b", 2);
    expect(host.getMap("cells").has("a")).toBe(true);
    await sync.request();
    expect(host.getMap("cells").toJSON()).toEqual({ b: 2 });
    expect(uploads).toHaveLength(1);
    await sync.request();
    expect(uploads).toHaveLength(1);
    sync.dispose();
    host.destroy();
    replica.destroy();
  });
});
