import * as decoding from "lib0/decoding";
import type {
  JsonValue,
  PresenceUser,
  ResourceAwarenessResult,
  ResourceStorageHandles,
} from "@lunarisapp/plugin-sdk";
import type { ApiClient } from "@repo/data/http";
import { encodeAwarenessUpdate } from "y-protocols/awareness";
import { Doc } from "yjs";
import { AwarenessConnection } from "./awareness-connection";

type Entry = {
  doc: Doc;
  connection: AwarenessConnection;
  release?: () => void;
  dispose: () => void;
  channel?: string;
  desired: JsonValue;
  setState: (value: JsonValue | null) => void;
};
/** Per-view broker. It owns all remote capabilities; sandbox code never receives tickets. */
export class AwarenessChannels {
  private entries = new Map<string, Entry>();
  private channelLeases = new Map<string, number>();
  private channelIds = new Map<string, string>();
  channelId(extensionId: string, channel: string) {
    const key = JSON.stringify([extensionId, channel]);
    let id = this.channelIds.get(key);
    if (!id) {
      id = crypto.randomUUID();
      this.channelIds.set(key, id);
    }
    return id;
  }
  private active = false;
  private revision = 0;
  private listeners = new Set<() => void>();
  private api: ApiClient;
  private workspaceId: string;
  private resourceId: string;
  private storage: ResourceStorageHandles;
  constructor(
    api: ApiClient,
    workspaceId: string,
    resourceId: string,
    storage: ResourceStorageHandles
  ) {
    this.api = api;
    this.workspaceId = workspaceId;
    this.resourceId = resourceId;
    this.storage = storage;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.revision;
  private changed = () => {
    this.revision++;
    for (const listener of this.listeners) {
      listener();
    }
  };
  setActive(active: boolean) {
    this.active = active;
    for (const entry of this.entries.values()) {
      if (active && !entry.release) {
        entry.release = entry.connection.acquire();
      }
      if (!active && entry.release) {
        entry.release();
        entry.release = undefined;
      }
    }
  }
  open(
    id: string,
    extensionId: string,
    input: { channel?: string; storageId?: string; clientId?: number }
  ) {
    if (!this.active) {
      throw new Error("Resource view unavailable");
    }
    if (typeof id !== "string" || id.length > 128 || this.entries.has(id)) {
      throw new Error("Invalid presence subscription");
    }
    if (this.entries.size >= 16) {
      throw new Error("Too many presence subscriptions");
    }
    if (input.channel !== undefined) {
      if (
        typeof input.channel !== "string" ||
        !/^[a-zA-Z0-9._-]{1,64}$/.test(input.channel) ||
        input.storageId !== undefined
      ) {
        throw new Error("Invalid presence channel");
      }
    } else if (
      !Object.values(this.storage).some(
        (s) => s.kind === "yjs" && s.storageId === input.storageId
      )
    ) {
      throw new Error("Presence storage scope mismatch");
    }
    if (input.channel === undefined && input.clientId === undefined) {
      throw new Error("Missing awareness client");
    }
    if (input.channel !== undefined && input.clientId !== undefined) {
      throw new Error("Generic presence client is host-owned");
    }
    if (
      input.clientId !== undefined &&
      (!Number.isInteger(input.clientId) ||
        input.clientId < 0 ||
        input.clientId > 0xff_ff_ff_ff)
    ) {
      throw new Error("Invalid presence client");
    }
    const doc = new Doc();
    if (input.clientId !== undefined) {
      doc.clientID = input.clientId;
    }
    const connection = new AwarenessConnection(
      doc,
      this.api,
      this.workspaceId,
      input.storageId ?? "",
      input.channel === undefined
        ? undefined
        : { resourceId: this.resourceId, extensionId, channel: input.channel }
    );
    const dispose = connection.subscribe(() => {
      const entry = this.entries.get(id);
      if (
        entry?.channel !== undefined &&
        connection.getSnapshot().status === "connected"
      ) {
        connection.awareness.setLocalStateField("data", entry.desired);
      }
      this.changed();
    });
    connection.awareness.on("update", this.changed);
    const entry: Entry = {
      doc,
      connection,
      desired: null,
      setState: (value) => this.update(id, value),
      channel: input.channel,
      dispose: () => {
        dispose();
        connection.awareness.off("update", this.changed);
      },
    };
    this.entries.set(id, entry);
    entry.release = connection.acquire();
    this.changed();
  }
  acquireChannel(id: string, extensionId: string, channel: string) {
    const count = this.channelLeases.get(id) ?? 0;
    if (!count) {
      this.open(id, extensionId, { channel });
    }
    this.channelLeases.set(id, count + 1);
    return () => {
      const remaining = (this.channelLeases.get(id) ?? 1) - 1;
      if (remaining) {
        this.channelLeases.set(id, remaining);
      } else {
        this.channelLeases.delete(id);
        this.close(id);
      }
    };
  }
  close(id: string) {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    this.entries.delete(id);
    entry.dispose();
    entry.release?.();
    entry.doc.destroy();
    this.changed();
  }
  update(id: string, value: JsonValue | ArrayBuffer) {
    const entry = this.entries.get(id);
    if (!(entry && this.active)) {
      return;
    }
    const awareness = entry.connection.awareness;
    if (entry.channel === undefined) {
      if (!(value instanceof ArrayBuffer) || value.byteLength > 8192) {
        throw new Error("Invalid awareness update");
      }
      const decoder = decoding.createDecoder(new Uint8Array(value));
      if (
        decoding.readVarUint(decoder) !== 1 ||
        decoding.readVarUint(decoder) !== entry.doc.clientID
      ) {
        throw new Error("Awareness owner mismatch");
      }
      const clock = decoding.readVarUint(decoder);
      if (!Number.isSafeInteger(clock)) {
        throw new Error("Invalid awareness clock");
      }
      const state: unknown = JSON.parse(decoding.readVarString(decoder));
      if (
        decoding.hasContent(decoder) ||
        (state !== null && (typeof state !== "object" || Array.isArray(state)))
      ) {
        throw new Error("Invalid awareness state");
      }
      if (awareness.getLocalState()) {
        awareness.setLocalState({
          ...(state ?? {}),
          user: awareness.getLocalState()?.user,
        });
      }
    } else {
      if (value instanceof ArrayBuffer) {
        throw new Error("Expected JSON state");
      }
      const check = (data: JsonValue, depth: number): void => {
        if (depth > 8) {
          throw new Error("Presence state too deep");
        }
        if (
          data === null ||
          typeof data === "string" ||
          typeof data === "boolean" ||
          (typeof data === "number" && Number.isFinite(data))
        ) {
          return;
        }
        if (
          Array.isArray(data) ||
          (typeof data === "object" &&
            Object.getPrototypeOf(data) === Object.prototype)
        ) {
          for (const child of Object.values(data)) {
            check(child, depth + 1);
          }
          return;
        }
        throw new Error("Expected JSON state");
      };
      check(value, 0);
      if (new TextEncoder().encode(JSON.stringify(value)).length > 4096) {
        throw new Error("Presence state too large");
      }
      entry.desired = value;
      if (awareness.getLocalState()) {
        awareness.setLocalStateField("data", value);
      }
    }
  }
  result(id: string): ResourceAwarenessResult<JsonValue> {
    const entry = this.entries.get(id);
    const awareness = entry?.connection.awareness;
    return {
      status: entry?.connection.getSnapshot().status ?? "unavailable",
      peers: awareness
        ? [...awareness.getStates()]
            .filter(([clientId]) => clientId !== awareness.clientID)
            .map(([clientId, state]) => ({
              instanceId: String(clientId),
              user: state.user as PresenceUser,
              state: (state.data ?? null) as JsonValue,
            }))
        : [],
      setState:
        entry?.setState ??
        (() => {
          /* No action while this capability is unavailable. */
        }),
    };
  }
  snapshot() {
    return [...this.entries].map(([id, entry]) => ({
      id,
      ...this.result(id),
      user: entry.connection.awareness.getLocalState()?.user,
      setState: undefined,
      update: encodeAwarenessUpdate(
        entry.connection.awareness,
        [...entry.connection.awareness.meta.keys()].filter(
          (clientId) => clientId !== entry.doc.clientID
        )
      ).buffer as ArrayBuffer,
    }));
  }
  destroy() {
    for (const id of [...this.entries.keys()]) {
      this.close(id);
    }
    this.channelLeases.clear();
    this.channelIds.clear();
  }
}
