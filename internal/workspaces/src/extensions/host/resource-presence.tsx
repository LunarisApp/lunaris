import {
  ResourceViewPresenceProvider,
  UNAVAILABLE_RESOURCE_PRESENCE,
  useResourceViewPresenceScope,
  type ResourcePresenceResult,
  type PresenceUser,
  type ResourceStorageHandles,
  type PluginAwarenessOptions,
  type ResourceAwarenessResult,
} from "@lunarisapp/plugin-sdk";
import { SYNC_ACCESS, useSyncAccess } from "@repo/data/core";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth/context";
import { useOnlineStatus } from "@repo/platform";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Doc } from "yjs";
import type { ApiClient } from "@repo/data/http";
import { AwarenessConnection } from "./awareness-connection";
import { AwarenessChannels } from "./awareness-channels";

const caches = new WeakMap<
  ApiClient,
  Map<
    string,
    {
      connection: AwarenessConnection;
      doc: Doc;
      leases: number;
      timer?: ReturnType<typeof setTimeout>;
    }
  >
>();
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
const Channels = createContext<AwarenessChannels | null>(null);
export const useAwarenessChannels = () => useContext(Channels);

export function ResourcePresenceBoundary({
  resourceId,
  storage,
  isVisible,
  children,
}: {
  resourceId: string;
  storage: ResourceStorageHandles;
  isVisible: boolean;
  children?: ReactNode;
}) {
  const api = useApi();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const { workspaceId, workspaceVisibility } = useCurrentWorkspace();
  const sync = useSyncAccess();
  const online = useOnlineStatus();
  const browserVisible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
  const eligible = Boolean(
    session?.user.id &&
      workspaceVisibility !== "local" &&
      sync === SYNC_ACCESS.cloud,
  );
  const active = eligible && isVisible && browserVisible && online;
  const key = JSON.stringify([
    workspaceId,
    resourceId,
    session?.session.id,
    session?.session.activeOrganizationId,
  ]);
  const entry = useMemo(() => {
    if (!eligible) return null;
    let cache = caches.get(api);
    if (!cache) {
      cache = new Map();
      caches.set(api, cache);
    }
    let value = cache.get(key);
    if (!value) {
      const doc = new Doc();
      value = {
        doc,
        connection: new AwarenessConnection(doc, api, workspaceId, "", {
          resourceId,
        }),
        leases: 0,
      };
      cache.set(key, value);
    }
    return value;
  }, [api, key, eligible, workspaceId, resourceId]);
  const channels = useMemo(
    () => new AwarenessChannels(api, workspaceId, resourceId, storage),
    [api, key, storage],
  );
  useLayoutEffect(() => {
    channels.setActive(active);
    return () => channels.setActive(false);
  }, [channels, active]);
  useEffect(() => () => channels.destroy(), [channels]);
  useEffect(() => {
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.leases++;
    return () => {
      entry.leases--;
      entry.timer = setTimeout(() => {
        if (!entry.leases) {
          caches.get(api)?.delete(key);
          entry.doc.destroy();
        }
      }, 0);
    };
  }, [api, key, entry]);
  useEffect(() => {
    if (!entry || !active) return;
    return entry.connection.acquire();
  }, [entry, active]);
  const store = useMemo(() => {
    let snapshot: ResourcePresenceResult = UNAVAILABLE_RESOURCE_PRESENCE;
    const listeners = new Set<() => void>();
    const refresh = () => {
      const connection = entry?.connection;
      const status = connection?.getSnapshot().status ?? "unavailable";
      const self = connection?.awareness.getLocalState()?.user as
        | PresenceUser
        | undefined;
      const users = new Map<string, PresenceUser>();
      if (status === "connected")
        for (const state of connection!.awareness.getStates().values()) {
          const user = state.user as PresenceUser | undefined;
          if (user?.id && user.id !== self?.id) users.set(user.id, user);
        }
      const next = {
        status,
        self: self ?? null,
        participants: [...users.values()].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      };
      if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
        snapshot = next;
        for (const fn of listeners) fn();
      }
    };
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        const dispose = entry?.connection.subscribe(refresh);
        entry?.connection.awareness.on("change", refresh);
        refresh();
        return () => {
          listeners.delete(listener);
          dispose?.();
          entry?.connection.awareness.off("change", refresh);
        };
      },
    };
  }, [entry]);
  const presence = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => UNAVAILABLE_RESOURCE_PRESENCE,
  );
  const value = useMemo(
    () => ({ resourceId, storage, isVisible: active, presence }),
    [resourceId, storage, active, presence],
  );
  return (
    <Channels.Provider value={channels}>
      <ResourceViewPresenceProvider value={value}>
        {children}
      </ResourceViewPresenceProvider>
    </Channels.Provider>
  );
}

export function useHostResourceAwareness(
  extensionId: string,
  channel: string,
  options?: PluginAwarenessOptions,
): ResourceAwarenessResult<import("@lunarisapp/plugin-sdk").JsonValue> {
  const manager = useAwarenessChannels();
  const scope = useResourceViewPresenceScope();
  const id = manager?.channelId(extensionId, channel) ?? "";
  const revision = useSyncExternalStore(
    manager?.subscribe ?? emptySubscribe,
    manager?.getSnapshot ?? zero,
    zero,
  );
  const enabled = options?.enabled !== false && Boolean(scope?.isVisible);
  useEffect(() => {
    if (!manager || !enabled) return;
    return manager.acquireChannel(id, extensionId, channel);
  }, [manager, id, extensionId, channel, enabled]);
  const setState = useCallback(
    (value: import("@lunarisapp/plugin-sdk").JsonValue | null) => {
      if (enabled) manager?.update(id, value);
    },
    [manager, id, enabled],
  );
  return useMemo(
    () => ({
      ...(enabled ? (manager?.result(id) ?? unavailable) : unavailable),
      setState,
    }),
    [manager, id, revision, enabled, setState],
  );
}
const emptySubscribe = () => () => {};
const zero = () => 0;
const unavailable = {
  peers: [],
  status: "unavailable" as const,
  setState: () => {},
};
