import {
  type AbstractPowerSyncDatabase,
  type BaseListener,
  BaseObserver,
  type PowerSyncBackendConnector as PowerSyncBackendConnectorOriginal,
  type PowerSyncCredentials,
} from "@powersync/common";

/**
 * Base class for PowerSync backend connectors.
 * Adds listener management capabilities to the built-in PowerSyncBackendConnector.
 */
export abstract class PowerSyncBackendConnector<
    T extends BaseListener = BaseListener,
  >
  extends BaseObserver<T>
  implements PowerSyncBackendConnectorOriginal
{
  init(): void {
    // No-op: override in subclass if initialization needed
  }
  abstract fetchCredentials(): Promise<PowerSyncCredentials | null>;
  abstract uploadData(database: AbstractPowerSyncDatabase): Promise<void>;
}
