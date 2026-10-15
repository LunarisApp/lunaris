import type {
  PluginAwarenessResult,
  PluginAwarenessStatus,
} from "@lunarisapp/plugin-sdk";
import type { ApiClient } from "@repo/data/http";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { Doc } from "yjs";

interface PresenceIdentity {
  color: string;
  id: string;
  image: string;
  name: string;
}
interface TicketResponse {
  ticket: string;
  user: PresenceIdentity;
}
const REMOTE = Symbol("remote-awareness");

/** One ephemeral connection shared by visible views of the same cached Y.Doc. */
export class AwarenessConnection {
  readonly awareness: Awareness;
  private socket: WebSocket | null = null;
  private leases = 0;
  private generation = 0;
  private attempts = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private sendTimer?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private request?: AbortController;
  private ready = false;
  private user?: PresenceIdentity;
  private readonly listeners = new Set<() => void>();
  private snapshot: PluginAwarenessResult;

  private readonly doc: Doc;
  private readonly api: ApiClient;
  private readonly workspaceId: string;
  private readonly storageId: string;
  private readonly resource?: { resourceId: string; extensionId?: string; channel?: string };

  constructor(
    doc: Doc,
    api: ApiClient,
    workspaceId: string,
    storageId: string,
    resource?: { resourceId: string; extensionId?: string; channel?: string },
  ) {
    this.resource = resource;
    this.doc = doc;
    this.api = api;
    this.workspaceId = workspaceId;
    this.storageId = storageId;
    this.awareness = new Awareness(doc);
    this.awareness.setLocalState(null);
    this.snapshot = { awareness: this.awareness, status: "unavailable" };
    this.awareness.on("update", this.updated);
    doc.on("destroy", this.destroy);
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private setStatus(status: PluginAwarenessStatus) {
    if (this.snapshot.status === status) return;
    this.snapshot = { awareness: this.awareness, status };
    for (const listener of this.listeners) listener();
  }

  acquire() {
    this.leases++;
    if (this.leases === 1) void this.connect();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.leases === 0) this.stop();
    };
  }

  private updated = (_event: unknown, origin: unknown) => {
    if (origin === REMOTE) return;
    if (!this.leases) {
      if (this.awareness.getLocalState() !== null)
        this.awareness.setLocalState(null);
      return;
    }
    if (!this.ready || this.sendTimer) return;
    // Coalesce selection movement while preserving heartbeat updates.
    this.sendTimer = setTimeout(() => {
      this.sendTimer = undefined;
      this.send();
    }, 80);
  };

  private send() {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 64 * 1024) {
      this.socket.close();
      return;
    }
    this.socket.send(
      new Uint8Array(
        encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
      ),
    );
  }

  private clearPeers() {
    removeAwarenessStates(
      this.awareness,
      [...this.awareness.getStates().keys()].filter(
        (id) => id !== this.doc.clientID,
      ),
      REMOTE,
    );
    // A reconnect snapshot may have the same clock as the last received state.
    // Forget remote clocks too, otherwise Yjs ignores those snapshot entries.
    for (const clientId of this.awareness.meta.keys()) {
      if (clientId !== this.doc.clientID) this.awareness.meta.delete(clientId);
    }
  }

  private async connect() {
    const generation = ++this.generation;
    this.ready = false;
    this.setStatus(this.attempts ? "error" : "connecting");
    const request = new AbortController();
    this.request = request;
    // ApiClient preserves caller signals, so its internal timeout cannot abort this request.
    const ticketTimer = setTimeout(() => request.abort(), 5000);
    try {
      const response = await this.api.post<TicketResponse>(
        this.resource
          ? `/v1/workspaces/${encodeURIComponent(this.workspaceId)}/resources/${encodeURIComponent(this.resource.resourceId)}/presence/ticket`
          : `/v1/workspaces/${encodeURIComponent(this.workspaceId)}/storage/${encodeURIComponent(this.storageId)}/presence/ticket`,
        { signal: request.signal, timeout: 5000, ...(this.resource ? { body: { extensionId: this.resource.extensionId, channel: this.resource.channel } } : {}) },
      );
      clearTimeout(ticketTimer);
      if (!this.leases || generation !== this.generation) return;
      this.user = response.user;
      const url = new URL("/v1/presence", this.api.baseUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      this.readyTimer = setTimeout(() => socket.close(), 8000);
      socket.onopen = () => {
        if (generation !== this.generation) {
          socket.close();
          return;
        }
        socket.send(
          JSON.stringify({
            ticket: response.ticket,
            clientId: this.doc.clientID,
          }),
        );
      };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (generation !== this.generation) return;
        try {
          if (event.data instanceof ArrayBuffer) {
            applyAwarenessUpdate(
              this.awareness,
              new Uint8Array(event.data),
              REMOTE,
            );
          } else if (typeof event.data === "string") {
            const message = JSON.parse(event.data) as {
              type: string;
              user: PresenceIdentity;
            };
            if (message.type !== "ready")
              throw new Error("Unexpected presence message");
            clearTimeout(this.readyTimer);
            this.user = message.user;
            this.ready = true;
            this.attempts = 0;
            this.awareness.setLocalState({ user: this.user });
            this.send();
            this.setStatus("connected");
          }
        } catch {
          socket.close();
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.readyTimer);
        this.socket = null;
        this.disconnected();
      };
    } catch {
      if (generation === this.generation) this.disconnected();
    } finally {
      clearTimeout(ticketTimer);
    }
  }

  private disconnected() {
    this.ready = false;
    this.clearPeers();
    this.awareness.setLocalState(null);
    if (!this.leases) return;
    this.setStatus("error");
    const delay =
      Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5)) +
      Math.random() * 250;
    this.retry = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private stop() {
    this.awareness.setLocalState(null);
    this.send();
    this.generation++;
    this.ready = false;
    this.request?.abort();
    clearTimeout(this.retry);
    clearTimeout(this.sendTimer);
    clearTimeout(this.readyTimer);
    this.sendTimer = undefined;
    this.socket?.close();
    this.socket = null;
    this.clearPeers();
    this.attempts = 0;
    this.setStatus("unavailable");
  }

  destroy = () => {
    this.stop();
    this.awareness.off("update", this.updated);
    this.awareness.destroy();
    this.doc.off("destroy", this.destroy);
    this.listeners.clear();
  };
}
