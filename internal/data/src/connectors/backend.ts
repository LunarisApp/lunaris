import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncCredentials,
} from "@powersync/common";
import { createEvlogError, log } from "evlog";
import type { SyncBlocker } from "../core/sync-blocker";
import { PowerSyncBackendConnector } from "./base";

const BATCH_SIZE = 100;

interface BackendConnectorOptions {
  backendUrl: string;
  syncBlocker: SyncBlocker;
}

interface SyncCrudEntry {
  data: Record<string, unknown> | undefined;
  id: string;
  op: string;
  type: string;
}

interface SyncPayload {
  transactions: {
    transactionId: number | undefined;
    crud: SyncCrudEntry[];
  }[];
}

const mapCrudEntry = (entry: CrudEntry): SyncCrudEntry => ({
  op: entry.op,
  type: entry.table,
  id: entry.id,
  data: entry.opData,
});

export default class BackendConnector extends PowerSyncBackendConnector {
  private backendUrl: string;
  private syncBlocker: SyncBlocker;

  constructor({ backendUrl, syncBlocker }: BackendConnectorOptions) {
    super();
    this.backendUrl = backendUrl;
    this.syncBlocker = syncBlocker;
  }

  init(): void {
    this.iterateListeners((cb) => cb.sessionStarted?.());
  }

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const res = await fetch(`${this.backendUrl}/v1/sync/credentials`, {
      credentials: "include",
    });

    if (!res.ok) {
      throw createEvlogError({
        message: "Sync auth failed",
        why: `Server returned ${res.status}`,
      });
    }

    const { token, powersyncUrl, expiresAt } = await res.json();
    const expiresAtDate = new Date(expiresAt * 1000);

    log.info({
      tag: "Sync",
      msg: "credentials fetched",
      expiresAt: expiresAtDate.toISOString(),
    });

    return {
      endpoint: powersyncUrl,
      token,
      expiresAt: expiresAtDate,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    if (this.syncBlocker.isBlocked()) {
      log.warn({ tag: "Sync", msg: "upload skipped while blocked" });
      return;
    }

    let batch = await database.getCrudBatch(BATCH_SIZE);

    while (batch) {
      const txMap = new Map<number | undefined, SyncCrudEntry[]>();
      for (const entry of batch.crud) {
        const key = entry.transactionId;
        if (!txMap.has(key)) {
          txMap.set(key, []);
        }
        txMap.get(key)!.push(mapCrudEntry(entry));
      }

      const payload: SyncPayload = {
        transactions: Array.from(txMap.entries()).map(([txId, crud]) => ({
          transactionId: txId,
          crud,
        })),
      };

      let response: Response;
      try {
        response = await fetch(`${this.backendUrl}/v1/sync/ingest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          credentials: "include",
        });
      } catch (error) {
        this.syncBlocker.recordNonClientError();
        throw error;
      }

      if (response.ok) {
        log.debug({
          tag: "Sync",
          msg: "batch uploaded",
          sync: { batchSize: batch.crud.length, txCount: txMap.size },
        });
        await batch.complete();
        this.syncBlocker.recordSuccess();
      } else if (response.status >= 400 && response.status < 500) {
        this.syncBlocker.recordClientError(response.status);
        log.error({
          tag: "Sync",
          msg: "batch rejected",
          sync: {
            blocked: this.syncBlocker.isBlocked(),
            consecutiveClientErrors:
              this.syncBlocker.getSnapshot().consecutiveClientErrors,
            status: response.status,
            batchSize: batch.crud.length,
          },
        });
        throw createEvlogError({
          message: "Sync upload rejected",
          why: `Server returned ${response.status}`,
        });
      } else {
        this.syncBlocker.recordNonClientError();
        throw createEvlogError({
          message: "Sync upload failed",
          why: `Server returned ${response.status}`,
        });
      }

      batch = await database.getCrudBatch(BATCH_SIZE);
    }
  }
}
