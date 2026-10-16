import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness";
import { Doc } from "yjs";
import type { ApiClient } from "@repo/data/http";
import { AwarenessChannels } from "./awareness-channels";

const connections = vi.hoisted(() => [] as Array<{ awareness: Awareness }>);
vi.mock("./awareness-connection", () => ({
  AwarenessConnection: class {
    awareness: Awareness;
    status = "unavailable";
    callbacks = new Set<() => void>();
    constructor(doc: Doc, ..._args: unknown[]) {
      this.awareness = new Awareness(doc);
      this.awareness.setLocalState(null);
      connections.push(this);
    }
    subscribe = (fn: () => void) => {
      this.callbacks.add(fn);
      return () => this.callbacks.delete(fn);
    };
    getSnapshot = () => ({ awareness: this.awareness, status: this.status });
    acquire = () => {
      this.status = "connected";
      this.awareness.setLocalState({ user: { id: "self", name: "Self" } });
      for (const fn of this.callbacks) {
        fn();
      }
      return () => {
        this.status = "unavailable";
        this.awareness.setLocalState(null);
        for (const fn of this.callbacks) {
          fn();
        }
      };
    };
  },
}));
const managers: AwarenessChannels[] = [];
function setup() {
  const manager = new AwarenessChannels(
    {} as ApiClient,
    "workspace",
    "resource",
    { content: { kind: "yjs", storageId: "slot" } }
  );
  managers.push(manager);
  manager.setActive(true);
  return manager;
}
afterEach(() => {
  managers.splice(0).forEach((m) => {
    m.destroy();
  });
  connections.splice(0).forEach((c) => {
    c.awareness.destroy();
  });
});
describe("view awareness broker", () => {
  it("keeps independent channel state and clears it without leaving the view", () => {
    const manager = setup();
    manager.open("first", "extension", { channel: "selection" });
    manager.open("second", "extension", { channel: "pointer" });
    manager.update("first", { selected: ["card"] });
    expect(connections[0].awareness.getLocalState()!.data).toEqual({
      selected: ["card"],
    });
    expect(connections[1].awareness.getLocalState()!.data).toBeNull();
    manager.update("first", null);
    expect(manager.result("first").status).toBe("connected");
    expect(connections[0].awareness.getLocalState()!.data).toBeNull();
  });
  it("shares a channel across consumers until its last lease leaves", () => {
    const manager = setup();
    const id = manager.channelId("extension", "selection");
    expect(manager.channelId("extension", "selection")).toBe(id);
    expect(manager.channelId("other", "selection")).not.toBe(id);
    const first = manager.acquireChannel(id, "extension", "selection");
    const second = manager.acquireChannel(id, "extension", "selection");
    expect(connections).toHaveLength(1);
    first();
    expect(manager.result(id).status).toBe("connected");
    second();
    expect(manager.snapshot()).toEqual([]);
  });
  it("forwards unchanged peer heartbeats to sandbox snapshots", () => {
    const manager = setup();
    manager.open("editor", "extension", { storageId: "slot", clientId: 42 });
    const peer = new Awareness(new Doc());
    peer.setLocalState({ user: { id: "peer" } });
    const relay = () =>
      applyAwarenessUpdate(
        connections[0].awareness,
        encodeAwarenessUpdate(peer, [peer.clientID]),
        "remote"
      );
    relay();
    const before = manager.getSnapshot();
    const clock = connections[0].awareness.meta.get(peer.clientID)!.clock;
    peer.setLocalState(peer.getLocalState());
    relay();
    expect(connections[0].awareness.meta.get(peer.clientID)!.clock).toBe(
      clock + 1
    );
    expect(manager.getSnapshot()).toBeGreaterThan(before);
    peer.destroy();
    peer.doc.destroy();
  });
  it("rejects invalid scope, payloads, and excessive subscriptions", () => {
    const manager = setup();
    expect(() =>
      manager.open("bad", "ext", { storageId: "other", clientId: 3 })
    ).toThrow("scope");
    expect(() =>
      manager.open("bad", "ext", { channel: "../private" })
    ).toThrow();
    expect(() => manager.open("missing", "ext", { storageId: "slot" })).toThrow(
      "Missing awareness client"
    );
    expect(() =>
      manager.open("generic", "ext", { channel: "pointer", clientId: 3 })
    ).toThrow("host-owned");
    manager.open("json", "ext", { channel: "pointer" });
    expect(() => manager.update("json", "x".repeat(4097))).toThrow("large");
    expect(() => manager.update("json", Number.NaN)).toThrow("JSON");
    let deep: import("@lunarisapp/plugin-sdk").JsonValue = null;
    for (let i = 0; i < 10; i++) {
      deep = { deep };
    }
    expect(() => manager.update("json", deep)).toThrow("deep");
    for (let i = 1; i < 16; i++) {
      manager.open(String(i), "ext", { channel: "pointer" });
    }
    expect(() =>
      manager.open("overflow", "ext", { channel: "pointer" })
    ).toThrow("Too many");
    manager.setActive(false);
    expect(manager.result("json").status).toBe("unavailable");
    expect(() => manager.open("hidden", "ext", { channel: "pointer" })).toThrow(
      "unavailable"
    );
  });
  it("uses the iframe client ID, rejects forged batches, and preserves server identity", () => {
    const manager = setup();
    const doc = new Doc();
    const source = new Awareness(doc);
    manager.open("editor", "ext", {
      storageId: "slot",
      clientId: doc.clientID,
    });
    source.setLocalState({ user: { id: "forged" }, cursor: null });
    manager.update(
      "editor",
      encodeAwarenessUpdate(source, [doc.clientID]).buffer as ArrayBuffer
    );
    expect(connections[0].awareness.clientID).toBe(doc.clientID);
    expect(connections[0].awareness.getLocalState()!.user.id).toBe("self");
    expect(() =>
      manager.update(
        "editor",
        encodeAwarenessUpdate(source, [doc.clientID, doc.clientID])
          .buffer as ArrayBuffer
      )
    ).toThrow("owner");
    const other = new Doc();
    const forged = new Awareness(other);
    expect(() =>
      manager.update(
        "editor",
        encodeAwarenessUpdate(forged, [other.clientID]).buffer as ArrayBuffer
      )
    ).toThrow("owner");
    source.destroy();
    doc.destroy();
    forged.destroy();
    other.destroy();
    manager.close("editor");
    expect(manager.snapshot()).toEqual([]);
  });
});
