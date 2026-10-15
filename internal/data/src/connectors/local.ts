import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { PowerSyncBackendConnector } from "./base";

export default class LocalOnlyBackendConnector extends PowerSyncBackendConnector {
  init(): void {
    // No-op: local connector requires no initialization
  }

  fetchCredentials(): Promise<null> {
    return Promise.resolve(null);
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (transaction) {
      await transaction.complete();
    }
  }
}
