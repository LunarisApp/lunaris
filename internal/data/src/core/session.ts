import type { AbstractPowerSyncDatabase } from "@powersync/common";
import type { SyncBlocker } from "./sync-blocker";

export interface PowerSyncStorageEstimate {
  quota: number | null;
  usage: number;
}

export interface PowerSyncSession {
  close(): Promise<void>;
  connect(): Promise<void>;
  database: AbstractPowerSyncDatabase;
  disconnect(): Promise<void>;
  estimateStorage(): Promise<PowerSyncStorageEstimate>;
  purge(): Promise<void>;
  storageName: string;
}

export interface ManagedPowerSyncSessionOptions {
  database: AbstractPowerSyncDatabase;
  estimateStorage(): Promise<PowerSyncStorageEstimate>;
  onClose(): Promise<void>;
  onConnect(): Promise<void>;
  onDisconnect(): Promise<void>;
  onPurge(): Promise<void>;
  storageName: string;
}

export function createManagedPowerSyncSession({
  database,
  estimateStorage,
  onClose,
  onConnect,
  onDisconnect,
  onPurge,
  storageName,
}: ManagedPowerSyncSessionOptions): PowerSyncSession {
  let closed = false;
  let connected = false;
  let operation = Promise.resolve();

  const run = <T>(task: () => Promise<T>) => {
    const result = operation.then(task, task);
    operation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const terminate = (cleanup: () => Promise<void>) =>
    run(async () => {
      if (closed) {
        return;
      }
      closed = true;
      connected = false;
      await cleanup();
    });

  return {
    database,
    storageName,
    connect: () =>
      run(async () => {
        if (closed || connected) {
          return;
        }
        await onConnect();
        connected = true;
      }),
    disconnect: () =>
      run(async () => {
        if (closed || !connected) {
          return;
        }
        connected = false;
        await onDisconnect();
      }),
    close: () => terminate(onClose),
    purge: () => terminate(onPurge),
    estimateStorage,
  };
}

export interface PowerSyncSessionFactoryInput {
  apiUrl: string;
  regionId: string;
  sessionId: string;
  syncBlocker: SyncBlocker;
  userId: string;
}

export type PowerSyncSessionFactory = (
  input: PowerSyncSessionFactoryInput
) => Promise<PowerSyncSession>;
