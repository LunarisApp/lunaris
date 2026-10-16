import {
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
  useRef,
} from "react";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { Doc } from "yjs";
import type {
  PluginAwarenessOptions,
  PluginAwarenessResult,
} from "./awareness";
import type { JsonValue } from "./json";
import type {
  ResourceAwarenessResult,
  ResourcePresenceResult,
  PresenceUser,
} from "./resource-presence";
import { UNAVAILABLE_RESOURCE_PRESENCE } from "./resource-presence";

export interface AwarenessBridge {
  call(method: string, args: unknown[]): Promise<unknown>;
  getSnapshot(): Record<string, unknown>;
  subscribe(listener: () => void): () => void;
}
interface ChannelSnapshot {
  id: string;
  peers: ResourceAwarenessResult<JsonValue>["peers"];
  status: PluginAwarenessResult["status"];
  update: ArrayBuffer;
  user?: PresenceUser;
}
interface PresenceSnapshot {
  active: boolean;
  channels: ChannelSnapshot[];
  membership: ResourcePresenceResult;
  version: 1;
}
export function remotePresence(
  bridge: AwarenessBridge
): PresenceSnapshot | undefined {
  const value = bridge.getSnapshot().presence as PresenceSnapshot | undefined;
  return value?.version === 1 ? value : undefined;
}
const documents = new WeakMap<
  AwarenessBridge,
  Map<
    string,
    { doc: Doc; leases: number; timer?: ReturnType<typeof setTimeout> }
  >
>();
export function useRemotePresenceDocument(bridge: AwarenessBridge, id: string) {
  const entry = useMemo(() => {
    let cache = documents.get(bridge);
    if (!cache) {
      cache = new Map();
      documents.set(bridge, cache);
    }
    let entry = cache.get(id);
    if (!entry) {
      entry = { doc: new Doc(), leases: 0 };
      cache.set(id, entry);
    }
    return entry;
  }, [bridge, id]);
  useEffect(() => {
    clearTimeout(entry.timer);
    entry.leases++;
    return () => {
      entry.leases--;
      entry.timer = setTimeout(() => {
        if (!entry.leases) {
          entry.doc.destroy();
          documents.get(bridge)?.delete(id);
        }
      }, 0);
    };
  }, [bridge, id, entry]);
  return entry.doc;
}
const REMOTE = Symbol("host-awareness");
const sharedAwareness = new WeakMap<Doc, Awareness>();
const subscriptions = new WeakMap<
  AwarenessBridge,
  Map<
    string,
    {
      id: string;
      desired?: { value: JsonValue | null };
      leases: number;
      timer?: ReturnType<typeof setTimeout>;
    }
  >
>();
export function useRemoteResourcePresence(bridge: AwarenessBridge) {
  useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot
  );
  return remotePresence(bridge)?.membership ?? UNAVAILABLE_RESOURCE_PRESENCE;
}
function useRemoteSubscription(
  bridge: AwarenessBridge,
  input: { channel?: string; storageId?: string; clientId?: number },
  enabled: boolean
) {
  const key = JSON.stringify(input);
  const entry = useMemo(() => {
    let cache = subscriptions.get(bridge);
    if (!cache) {
      cache = new Map();
      subscriptions.set(bridge, cache);
    }
    let value = cache.get(key);
    if (!value) {
      value = { id: crypto.randomUUID(), leases: 0 };
      cache.set(key, value);
    }
    return value;
  }, [bridge, key]);
  const id = entry.id;
  useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot
  );
  const supported = Boolean(remotePresence(bridge)?.active);
  useEffect(() => {
    if (!(supported && enabled)) {
      return;
    }
    clearTimeout(entry.timer);
    if (entry.leases++ === 0 && !entry.timer) {
      void bridge.call("presence.open", [id, JSON.parse(key)]).catch(() => {
        /* Presence is best-effort; transport teardown can reject pending calls. */
      });
    }
    entry.timer = undefined;
    return () => {
      entry.leases--;
      if (entry.leases) {
        return;
      }
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        if (entry.leases === 0) {
          void bridge.call("presence.close", [id]).catch(() => {
            /* Presence is best-effort; transport teardown can reject pending calls. */
          });
        }
      }, 0);
    };
  }, [bridge, entry, id, key, enabled, supported]);
  const snapshot = remotePresence(bridge)?.channels.find(
    (entry) => entry.id === id
  );
  return { id, snapshot, entry };
}
export function useRemoteResourceAwareness(
  bridge: AwarenessBridge,
  channel: string,
  options?: PluginAwarenessOptions
): ResourceAwarenessResult<JsonValue> {
  const { id, snapshot, entry } = useRemoteSubscription(
    bridge,
    { channel },
    options?.enabled !== false
  );
  const active =
    Boolean(remotePresence(bridge)?.active) && options?.enabled !== false;
  const connected = active && snapshot?.status === "connected";
  const publish = useCallback(
    (state: JsonValue | null) => {
      void bridge.call("presence.update", [id, state]).catch(() => {
        /* Presence is best-effort; transport teardown can reject pending calls. */
      });
    },
    [bridge, id]
  );
  const visible = useRef(active);
  visible.current = active;
  const connection = useRef(false);
  connection.current = connected;
  const setState = useCallback(
    (value: JsonValue | null) => {
      if (!visible.current) {
        return;
      }
      entry.desired = { value };
      if (connection.current) {
        publish(value);
      }
    },
    [entry, publish]
  );
  useEffect(() => {
    if (connected && entry.desired) {
      publish(entry.desired.value);
    }
  }, [connected, entry, publish]);
  return {
    peers: active ? (snapshot?.peers ?? []) : [],
    status: active ? (snapshot?.status ?? "unavailable") : "unavailable",
    setState,
  };
}
// One relay per Awareness instance, even when multiple components consume it.
const relays = new WeakMap<
  Awareness,
  { leases: number; dispose: () => void }
>();
function acquireAwarenessRelay(
  bridge: AwarenessBridge,
  id: string,
  awareness: Awareness
) {
  let relay = relays.get(awareness);
  if (!relay) {
    const current = () => {
      const presence = remotePresence(bridge);
      return presence?.active
        ? presence.channels.find((channel) => channel.id === id)
        : undefined;
    };
    const clear = () => {
      removeAwarenessStates(
        awareness,
        [...awareness.getStates().keys()],
        REMOTE
      );
      for (const clientId of awareness.meta.keys()) {
        if (clientId !== awareness.clientID) {
          awareness.meta.delete(clientId);
        }
      }
    };
    const update = (
      event: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (
        origin === REMOTE ||
        current()?.status !== "connected" ||
        ![...event.added, ...event.updated, ...event.removed].includes(
          awareness.clientID
        )
      ) {
        return;
      }
      void bridge
        .call("presence.update", [
          id,
          encodeAwarenessUpdate(awareness, [awareness.clientID]).buffer,
        ])
        .catch(() => {
          /* Presence is best-effort; transport teardown can reject pending calls. */
        });
    };
    const refresh = () => {
      const snapshot = current();
      if (snapshot?.status !== "connected") {
        clear();
        return;
      }
      const local = awareness.getLocalState();
      if (!local) {
        awareness.setLocalState({ user: snapshot.user });
      } else if (JSON.stringify(local.user) !== JSON.stringify(snapshot.user)) {
        awareness.setLocalStateField("user", snapshot.user);
      }
      if (snapshot.update) {
        applyAwarenessUpdate(
          awareness,
          new Uint8Array(snapshot.update),
          REMOTE
        );
      }
    };
    awareness.on("update", update);
    const unsubscribe = bridge.subscribe(refresh);
    relay = {
      leases: 0,
      dispose: () => {
        unsubscribe();
        awareness.off("update", update);
        clear();
      },
    };
    relays.set(awareness, relay);
    refresh();
  }
  relay.leases++;
  return () => {
    if (--relay.leases === 0) {
      relay.dispose();
      relays.delete(awareness);
    }
  };
}

export function useRemoteYjsAwareness(
  bridge: AwarenessBridge,
  storageId: string | undefined,
  workspaceId: string,
  options?: PluginAwarenessOptions
): PluginAwarenessResult {
  const doc = useRemotePresenceDocument(
    bridge,
    JSON.stringify([workspaceId, storageId])
  );
  const awareness = useMemo(() => {
    let value = sharedAwareness.get(doc);
    if (!value) {
      value = new Awareness(doc);
      value.setLocalState(null);
      sharedAwareness.set(doc, value);
    }
    return value;
  }, [doc]);
  const { id, snapshot } = useRemoteSubscription(
    bridge,
    { storageId, clientId: doc.clientID },
    Boolean(storageId) && options?.enabled !== false
  );
  const active =
    Boolean(storageId && remotePresence(bridge)?.active) &&
    options?.enabled !== false;
  useEffect(() => {
    if (active) {
      return acquireAwarenessRelay(bridge, id, awareness);
    }
  }, [awareness, bridge, id, active]);
  return {
    awareness: storageId && remotePresence(bridge) ? awareness : null,
    status: active ? (snapshot?.status ?? "unavailable") : "unavailable",
  };
}
