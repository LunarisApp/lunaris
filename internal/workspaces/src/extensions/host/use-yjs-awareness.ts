import { useResourceViewPresenceScope } from "@lunarisapp/plugin-sdk";
import type {
  PluginAwarenessOptions,
  PluginAwarenessResult,
  ResourceStorageHandle,
} from "@lunarisapp/plugin-sdk";
import { SYNC_ACCESS, useSyncAccess } from "@repo/data/core";
import { useStorageSlot } from "@repo/data/features/workspace-storage-slots";
import { useReadyYjsDocument } from "@repo/data/features/yjs";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth/context";
import { useOnlineStatus } from "@repo/platform";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Doc } from "yjs";
import { AwarenessConnection } from "./awareness-connection";

const connections = new WeakMap<Doc, Map<string, AwarenessConnection>>();
const unavailable: PluginAwarenessResult = {
  awareness: null,
  status: "unavailable",
};
const emptySubscribe = () => () => {
  /* No action while this capability is unavailable. */
};
const emptySnapshot = () => unavailable;
const visibleSnapshot = () => document.visibilityState === "visible";
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};

export function useHostYjsAwareness(
  storage: ResourceStorageHandle | undefined,
  workspaceId: string,
  options?: PluginAwarenessOptions
): PluginAwarenessResult {
  const scope = useResourceViewPresenceScope();
  const api = useApi();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const { workspaceVisibility } = useCurrentWorkspace();
  const syncAccess = useSyncAccess();
  const online = useOnlineStatus();
  const browserVisible = useSyncExternalStore(
    subscribeVisibility,
    visibleSnapshot,
    () => false
  );
  const slot = useStorageSlot(storage?.storageId ?? "").data[0];
  const eligible = Boolean(
    scope &&
      Object.values(scope.storage).some(
        (s) => s.storageId === storage?.storageId
      ) &&
      session?.user.id &&
      workspaceVisibility !== "local" &&
      syncAccess === SYNC_ACCESS.cloud &&
      slot?.kind === "yjs" &&
      slot.workspace_id === workspaceId
  );
  const { yDoc } = useReadyYjsDocument(
    slot?.backing_id ?? undefined,
    workspaceId,
    { enabled: eligible, userId: session?.user.id }
  );
  const key = JSON.stringify([
    api.baseUrl,
    workspaceId,
    session?.session.id,
    session?.session.activeOrganizationId,
    session?.user.id,
  ]);
  const connection = useMemo(() => {
    if (!(eligible && yDoc && storage?.storageId)) {
      return null;
    }
    // Documents own cached instances. Session changes release old leases in effect
    // cleanup; never destroy a sibling view's connection during render.
    let cached = connections.get(yDoc);
    if (!cached) {
      cached = new Map();
      connections.set(yDoc, cached);
    }
    const existing = cached.get(key);
    if (existing) {
      return existing;
    }
    const next = new AwarenessConnection(
      yDoc,
      api,
      workspaceId,
      storage?.storageId
    );
    cached.set(key, next);
    return next;
  }, [api, eligible, key, storage?.storageId, workspaceId, yDoc]);
  const enabled =
    options?.enabled !== false &&
    Boolean(scope?.isVisible) &&
    browserVisible &&
    online;
  useEffect(() => {
    if (connection && enabled) {
      return connection.acquire();
    }
  }, [connection, enabled]);
  const result = useSyncExternalStore(
    connection?.subscribe ?? emptySubscribe,
    connection?.getSnapshot ?? emptySnapshot,
    emptySnapshot
  );
  return result;
}
