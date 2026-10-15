import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@repo/data/http";
import { Doc } from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { AwarenessConnection } from "./awareness-connection";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  binaryType = "";
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });
  readonly url: URL;
  constructor(url: URL) {
    this.url = url;
    Socket.instances.push(this);
  }
}
const user = { id: "ada", name: "Ada", color: "#1d4ed8", image: "" };
const docs: Doc[] = [];
const connections: AwarenessConnection[] = [];
function setup() {
  const doc = new Doc();
  docs.push(doc);
  const post = vi.fn().mockResolvedValue({ ticket: "a".repeat(64), user });
  const connection = new AwarenessConnection(
    doc,
    { baseUrl: "https://api.example.com", post } as unknown as ApiClient,
    "workspace",
    "storage",
  );
  connections.push(connection);
  return { connection, post, doc };
}
async function ready() {
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ type: "ready", user }) });
  return socket;
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  for (const connection of connections.splice(0)) connection.destroy();
  for (const doc of docs.splice(0)) doc.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("awareness connection leases", () => {
  it("connects only on first lease and closes after last release, with no Yjs writes", async () => {
    const { connection, post, doc } = setup();
    const persisted = vi.fn();
    doc.on("updateV2", persisted);
    expect(post).not.toHaveBeenCalled();
    const release1 = connection.acquire();
    const release2 = connection.acquire();
    const socket = await ready();
    expect(post).toHaveBeenCalledTimes(1);
    expect(socket.url.toString()).toBe("wss://api.example.com/v1/presence");
    expect(socket.send.mock.calls[0]?.[0]).toContain('"ticket"');
    connection.awareness.setLocalStateField("cursor", null);
    await vi.advanceTimersByTimeAsync(100);
    release1();
    expect(socket.close).not.toHaveBeenCalled();
    release2();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(connection.getSnapshot().status).toBe("unavailable");
    expect(connection.awareness.getLocalState()).toBeNull();
    expect(persisted).not.toHaveBeenCalled();
  });
  it("clears disconnected peers and obtains a fresh ticket on retry", async () => {
    const { connection, post } = setup();
    const release = connection.acquire();
    const socket = await ready();
    const peerDoc = new Doc();
    docs.push(peerDoc);
    const peer = new Awareness(peerDoc);
    peer.setLocalState({ user: { ...user, id: "grace" } });
    socket.onmessage?.({
      data: new Uint8Array(encodeAwarenessUpdate(peer, [peerDoc.clientID]))
        .buffer,
    });
    expect(connection.awareness.getStates().has(peerDoc.clientID)).toBe(true);
    socket.close();
    expect(connection.awareness.getStates().has(peerDoc.clientID)).toBe(false);
    expect(connection.getSnapshot().status).toBe("error");
    await vi.advanceTimersByTimeAsync(1300);
    expect(post).toHaveBeenCalledTimes(2);
    release();
    peer.destroy();
  });
  it("restores unchanged peers from a reconnect snapshot", async () => {
    const { connection } = setup();
    const release = connection.acquire();
    const socket = await ready();
    const peerDoc = new Doc(); docs.push(peerDoc);
    const peer = new Awareness(peerDoc);
    peer.setLocalState({ user: { ...user, id: "grace" } });
    const snapshot = new Uint8Array(encodeAwarenessUpdate(peer, [peerDoc.clientID])).buffer;
    socket.onmessage?.({ data: snapshot });
    socket.close();
    expect(connection.awareness.getStates().has(peerDoc.clientID)).toBe(false);
    await vi.advanceTimersByTimeAsync(1300);
    const reconnected = await ready();
    reconnected.onmessage?.({ data: snapshot });
    expect(connection.awareness.getStates().has(peerDoc.clientID)).toBe(true);
    release(); peer.destroy();
  });
  it("aborts a stalled ticket request and retries", async () => {
    const { connection, post } = setup();
    let signal: AbortSignal | undefined;
    post.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const release = connection.acquire();
    await vi.advanceTimersByTimeAsync(5000);
    expect(signal?.aborted).toBe(true);
    expect(connection.getSnapshot().status).toBe("error");
    await vi.advanceTimersByTimeAsync(1300);
    expect(post).toHaveBeenCalledTimes(2);
    release();
  });
  it("expires a crashed peer after the standard awareness timeout", async () => {
    const { connection } = setup();
    const release = connection.acquire();
    const socket = await ready();
    const peerDoc = new Doc();
    docs.push(peerDoc);
    const peer = new Awareness(peerDoc);
    peer.setLocalState({ user: { ...user, id: "crashed" } });
    socket.onmessage?.({
      data: new Uint8Array(encodeAwarenessUpdate(peer, [peerDoc.clientID]))
        .buffer,
    });
    peer.destroy();
    expect(connection.awareness.getStates().has(peerDoc.clientID)).toBe(true);
    // lib0 captures Date.now at import; mark the peer stale before the timer tick.
    connection.awareness.meta.get(peerDoc.clientID)!.lastUpdated = 0;
    await vi.advanceTimersByTimeAsync(3000);
    expect(connection.awareness.getStates().has(peerDoc.clientID)).toBe(false);
    expect(connection.getSnapshot().status).toBe("connected");
    release();
  });
  it("does not reconnect after release or retain editor-written presence while hidden", async () => {
    const { connection, post } = setup();
    const release = connection.acquire();
    await ready();
    release();
    connection.awareness.setLocalStateField("user", user);
    expect(connection.awareness.getLocalState()).toBeNull();
    await vi.advanceTimersByTimeAsync(60000);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("ignores a ticket arriving after view closes", async () => {
    const { connection, post } = setup();
    const release = connection.acquire();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(post).toHaveBeenCalledOnce();
    expect(Socket.instances).toHaveLength(0);
  });
});
