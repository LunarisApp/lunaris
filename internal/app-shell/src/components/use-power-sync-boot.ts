import {
  createSyncBlocker,
  isOfflineEncryptionKeyError,
  type PowerSyncSession,
  type PowerSyncSessionFactory,
  type SyncBlocker,
} from "@repo/data/core";
import { usePlatform } from "@repo/platform";
import { log, parseError } from "evlog";
import { useCallback, useEffect, useState } from "react";
import { powerSyncSessionCoordinator } from "./power-sync-session-coordinator";

interface PowerSyncBoot {
  session: PowerSyncSession;
  syncBlocker: SyncBlocker;
}

interface ScopedPowerSyncBoot extends PowerSyncBoot {
  scopeKey: string;
}

interface ScopedPowerSyncError {
  error: Error;
  scopeKey: string;
}

interface UsePowerSyncBootOptions {
  apiUrl: string;
  createPowerSyncSession: PowerSyncSessionFactory;
  organizationId?: string;
  regionId: string;
  sessionId?: string;
  userId?: string;
}

export function usePowerSyncBoot({
  apiUrl,
  createPowerSyncSession,
  organizationId,
  regionId,
  sessionId,
  userId,
}: UsePowerSyncBootOptions) {
  const { network } = usePlatform();
  const [boot, setBoot] = useState<ScopedPowerSyncBoot | null>(null);
  const [scopedError, setScopedError] =
    useState<ScopedPowerSyncError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const scopeKey = JSON.stringify([
    apiUrl,
    regionId,
    organizationId,
    sessionId,
    userId,
    attempt,
  ]);
  const error = scopedError?.scopeKey === scopeKey ? scopedError.error : null;

  useEffect(() => {
    if (!isOfflineEncryptionKeyError(error)) return;
    return network.subscribeOnline(retry);
  }, [error, network, retry]);

  useEffect(() => {
    setBoot(null);
    setScopedError(null);
    if (!userId || !sessionId || !organizationId) return;

    let cancelled = false;
    let creation: Promise<PowerSyncSession> | null = null;

    // StrictMode replays effects during development. Deferring creation lets
    // the replay cleanup cancel the first pass before it opens a second worker
    // for the same database.
    queueMicrotask(() => {
      if (cancelled) return;
      const syncBlocker = createSyncBlocker();
      creation = powerSyncSessionCoordinator.create(() =>
        createPowerSyncSession({
          apiUrl,
          regionId,
          sessionId,
          syncBlocker,
          userId,
        }),
      );

      void creation
        .then((session) => {
          if (cancelled) return;
          powerSyncSessionCoordinator.activate(session);
          setBoot({ scopeKey, session, syncBlocker });
        })
        .catch((cause) => {
          if (cancelled) return;
          const normalized =
            cause instanceof Error ? cause : new Error("PowerSync boot failed");
          const isOfflineKeyError = isOfflineEncryptionKeyError(normalized);
          const event = {
            action: "sync.database.boot",
            outcome: "failure",
            sync: {
              regionId,
              retryAttempt: attempt,
              retryWhenOnline: isOfflineKeyError,
            },
            error: parseError(normalized),
          };
          if (isOfflineKeyError) log.warn(event);
          else log.error(event);
          setScopedError({ error: normalized, scopeKey });
        });
    });

    return () => {
      cancelled = true;
      if (creation) powerSyncSessionCoordinator.release(creation);
    };
  }, [
    apiUrl,
    attempt,
    createPowerSyncSession,
    organizationId,
    regionId,
    scopeKey,
    sessionId,
    userId,
  ]);

  return {
    boot: boot?.scopeKey === scopeKey ? boot : null,
    error,
    retry,
  };
}
