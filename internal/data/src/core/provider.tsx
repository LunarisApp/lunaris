import { PowerSyncContext } from "@powersync/react";
import { log, parseError } from "evlog";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { PowerSyncSession } from "./session";
import type { SyncAccessPolicy } from "./sync-access";
import {
  type SyncBlocker,
  SyncBlockerContext,
  useSyncBlockerStateFrom,
} from "./sync-blocker";

const SyncAccessContext = createContext<SyncAccessPolicy>("cloud");
export const useSyncAccess = () => useContext(SyncAccessContext);

const PowerSyncSessionContext = createContext<PowerSyncSession | null>(null);

export function usePowerSyncSession(): PowerSyncSession {
  const session = useContext(PowerSyncSessionContext);
  if (!session) {
    throw new Error("usePowerSyncSession must be used within PowerSyncProvider");
  }
  return session;
}

function statusSnapshot(status: {
  connected: boolean;
  connecting: boolean;
  lastSyncedAt?: Date;
  dataFlowStatus: {
    downloadError?: Error;
    downloadProgress?: unknown;
    downloading?: boolean;
    uploadError?: Error;
    uploading?: boolean;
  };
}) {
  return {
    connected: status.connected,
    connecting: status.connecting,
    lastSyncedAt: status.lastSyncedAt?.toISOString(),
    dataFlow: {
      downloading: status.dataFlowStatus.downloading ?? false,
      uploading: status.dataFlowStatus.uploading ?? false,
      hasDownloadProgress: status.dataFlowStatus.downloadProgress != null,
    },
    downloadError: status.dataFlowStatus.downloadError
      ? parseError(status.dataFlowStatus.downloadError)
      : undefined,
    uploadError: status.dataFlowStatus.uploadError
      ? parseError(status.dataFlowStatus.uploadError)
      : undefined,
  };
}

export function PowerSyncProvider({
  children,
  session,
  syncAccess,
  syncBlocker,
}: {
  children: ReactNode;
  session: PowerSyncSession;
  syncAccess: SyncAccessPolicy;
  syncBlocker: SyncBlocker;
}) {
  const { blocked } = useSyncBlockerStateFrom(syncBlocker);

  useEffect(() => {
    let previous = "";
    return session.database.registerListener({
      statusChanged: (status) => {
        const snapshot = statusSnapshot(status);
        const serialized = JSON.stringify(snapshot);
        if (serialized === previous) return;
        previous = serialized;
        log.info({ tag: "Sync", msg: "db status changed", ...snapshot });
      },
    });
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    if (syncAccess === "local-only" || blocked) {
      void session.disconnect();
      return;
    }

    void session.connect().catch((error) => {
      if (cancelled) return;
      log.error({
        tag: "Sync",
        msg: "db connect failed",
        error: parseError(error),
      });
    });

    return () => {
      cancelled = true;
      void session.disconnect();
    };
  }, [blocked, session, syncAccess]);

  useEffect(() => () => syncBlocker.reset(), [syncBlocker]);

  return (
    <PowerSyncContext.Provider value={session.database}>
      <PowerSyncSessionContext.Provider value={session}>
        <SyncAccessContext.Provider value={syncAccess}>
          <SyncBlockerContext.Provider value={syncBlocker}>
            {children}
          </SyncBlockerContext.Provider>
        </SyncAccessContext.Provider>
      </PowerSyncSessionContext.Provider>
    </PowerSyncContext.Provider>
  );
}

export { usePowerSync, useQuery, useSyncStream } from "@powersync/react";
