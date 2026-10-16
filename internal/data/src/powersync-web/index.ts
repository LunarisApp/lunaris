import { PowerSyncDatabase } from "@powersync/web";
import { configureSearchIndex } from "../features/search-index";
import { log, parseError } from "evlog";
import BackendConnector from "../connectors/backend";
import { wipeLocalDb } from "../core/db-wipe";
import {
  deleteEncryptionKey,
  type EncryptionKeyScope,
  hashUserId,
  persistEncryptionKey,
  type ResolvedEncryptionKey,
  refreshEncryptionKey,
  resolveEncryptionKey,
} from "../core/encryption-key";
import {
  isEncryptionKeyMismatch,
  isNotADbError,
  probeEncryption,
} from "../core/encryption-probe";
import { createPowerSyncLogger } from "../core/powersync-logger";
import type {
  PowerSyncSession,
  PowerSyncSessionFactory,
} from "../core/session";
import { createManagedPowerSyncSession } from "../core/session";
import type { CreateSchemaTableProps } from "../core/utils";
import { createAppSchema } from "../features";
import { openDatabaseWithKeyRecovery } from "./key-recovery";
import {
  getFallbackRuntimeMode,
  type PowerSyncRuntimeMode,
  resolveRuntimeFlags,
} from "./runtime-mode";

interface CreateWebPowerSyncDatabaseOptions {
  dbFilename: string;
  debugMode?: boolean;
  encryptionKey: string;
  runtimeMode?: PowerSyncRuntimeMode;
  tableProps?: CreateSchemaTableProps;
}

export function createWebPowerSyncDatabase({
  encryptionKey,
  dbFilename,
  debugMode,
  runtimeMode = resolveRuntimeFlags(),
  tableProps,
}: CreateWebPowerSyncDatabaseOptions) {
  return new PowerSyncDatabase({
    schema: createAppSchema(tableProps),
    logger: createPowerSyncLogger(debugMode),
    database: {
      dbFilename,
      encryptionKey,
      debugMode,
      vfs: runtimeMode.preferredVfs,
      enableMultiTabs: runtimeMode.enableMultiTabs,
      useWebWorker: runtimeMode.useWebWorker,
    },
  });
}

function isKeyMismatch(error: unknown) {
  return isEncryptionKeyMismatch(error) || isNotADbError(error);
}

async function closeDatabase(database: PowerSyncDatabase) {
  await database.disconnect().catch(() => undefined);
  await database.close().catch(() => undefined);
}

async function initializeDatabase(options: {
  dbFilename: string;
  encryptionKey: string;
}) {
  let mode = resolveRuntimeFlags();

  for (;;) {
    const database = createWebPowerSyncDatabase({
      ...options,
      runtimeMode: mode,
    });
    try {
      await database.init();
      await configureSearchIndex(database);
      await probeEncryption(database, options.dbFilename);
      return database;
    } catch (error) {
      await closeDatabase(database);
      if (isKeyMismatch(error)) {
        throw error;
      }

      const fallback = getFallbackRuntimeMode(mode);
      if (fallback) {
        log.warn({
          tag: "Sync",
          msg: "retrying db init with fallback",
          fromMode: mode.modeLabel,
          toMode: fallback.modeLabel,
        });
        mode = fallback;
        continue;
      }
      throw error;
    }
  }
}

async function initializeWithResolvedKey({
  dbFilename,
  resolved,
  scope,
}: {
  dbFilename: string;
  resolved: ResolvedEncryptionKey;
  scope: EncryptionKeyScope;
}) {
  const { database, key: activeKey } = await openDatabaseWithKeyRecovery({
    initialKey: resolved,
    isKeyMismatch,
    open: (key) => initializeDatabase({ dbFilename, encryptionKey: key }),
    refreshKey: () => refreshEncryptionKey(scope),
    wipe: () => wipeLocalDb(dbFilename),
  });

  try {
    await persistEncryptionKey(activeKey);
  } catch (error) {
    log.warn({
      tag: "Sync",
      msg: "failed to persist database key for offline boot",
      error: parseError(error),
    });
  }

  return database;
}

async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return;
  }
  try {
    await navigator.storage.persist();
  } catch (error) {
    log.warn({
      tag: "Sync",
      msg: "persistent browser storage request failed",
      error: parseError(error),
    });
  }
}

export const createWebPowerSyncSession: PowerSyncSessionFactory = async ({
  apiUrl,
  regionId,
  sessionId,
  syncBlocker,
  userId,
}) => {
  const keyScope: EncryptionKeyScope = {
    backendUrl: apiUrl,
    regionId,
    sessionId,
    userId,
  };
  const [userHash, resolvedKey] = await Promise.all([
    hashUserId(userId),
    resolveEncryptionKey(keyScope),
  ]);
  const storageName = `lunaris.v2.${userHash}.db`;
  const database = await initializeWithResolvedKey({
    dbFilename: storageName,
    resolved: resolvedKey,
    scope: keyScope,
  });
  // Storage permission must not delay rendering an already-open local database.
  void requestPersistentStorage();
  const connector = new BackendConnector({ backendUrl: apiUrl, syncBlocker });
  const session: PowerSyncSession = createManagedPowerSyncSession({
    database,
    storageName,
    onConnect: () => database.connect(connector),
    onDisconnect: () => database.disconnect(),
    onClose: async () => {
      await database.disconnect().catch(() => undefined);
      await database.close();
    },
    onPurge: async () => {
      try {
        await database.disconnectAndClear();
      } catch (error) {
        log.warn({
          tag: "Sync",
          msg: "database clear failed before web wipe",
          error: parseError(error),
        });
      }
      await database.close().catch(() => undefined);
      await wipeLocalDb(storageName);
      await deleteEncryptionKey(keyScope);
    },
    estimateStorage: async () => {
      const estimate = await navigator.storage.estimate();
      return {
        quota: estimate.quota ?? null,
        usage: estimate.usage ?? 0,
      };
    },
  });

  return session;
};

export type { PowerSyncRuntimeMode } from "./runtime-mode";
