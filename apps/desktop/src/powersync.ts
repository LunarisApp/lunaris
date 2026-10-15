import { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import {
  createManagedPowerSyncSession,
  type PowerSyncSessionFactory,
} from "@repo/data/core";
import { createAppSchema } from "@repo/data/schema";
import { configureSearchIndex } from "@repo/data/features/search-index";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { subscribeToPowerSyncUploads } from "./powersync-events";
import { resolveNativePowerSyncStorageName } from "./powersync-storage";

export const createNativePowerSyncSession: PowerSyncSessionFactory = async ({
  apiUrl,
  regionId,
  syncBlocker,
  userId,
}) => {
  const storageName = await resolveNativePowerSyncStorageName(regionId, userId);

  const database = new PowerSyncTauriDatabase({
    schema: createAppSchema(),
    database: { dbFilename: storageName, dbLocationAsync: appDataDir },
  });
  await database.init();
  await configureSearchIndex(database);

  const handle = database.rustHandle;
  let stopListening: () => void;
  try {
    stopListening = await subscribeToPowerSyncUploads(handle, syncBlocker);
  } catch (error) {
    await database.close().catch(() => undefined);
    throw error;
  }

  return createManagedPowerSyncSession({
    database,
    storageName,
    onConnect: () => invoke("powersync_connect", { apiUrl, handle, regionId }),
    onDisconnect: () => database.disconnect(),
    onClose: async () => {
      stopListening();
      await database.disconnect().catch(() => undefined);
      await database.close();
    },
    onPurge: async () => {
      stopListening();
      await database.disconnect().catch(() => undefined);
      await database.close();
      await invoke("powersync_delete_database", { storageName });
    },
    estimateStorage: async () => ({
      quota: null,
      usage: await invoke<number>("powersync_database_size", { storageName }),
    }),
  });
};
