import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { log } from "evlog";
import { ObservableV2 } from "lib0/observable";
import { applyUpdateV2, type Doc } from "yjs";
import {
  type YjsPersistenceState,
  YjsPersistenceTracker,
} from "./persistence-tracker";
import {
  deleteYjsDocumentUpdates,
  insertYjsDocumentUpdate,
  watchYjsDocumentUpdates,
} from "./services";
import { b64ToUint8Array, Uint8ArrayTob64 } from "./utils";

export type { YjsPersistenceState } from "./persistence-tracker";

export const PERSISTED_YJS_UPDATE_ORIGIN = Symbol("persisted-yjs-update");

export interface YjsPowerSyncEvents {
  error: (error: Error) => void;
  /**
   * Triggered when document contents have been loaded from the database the first time.
   *
   * The document data may not have been synced from the PowerSync service at this point.
   */
  synced: () => void;
}

/**
 * Configure bidirectional sync for a Yjs document with a PowerSync database.
 *
 * Updates are stored in the `document_updates` table in the database.
 *
 * @param ydoc
 * @param db
 * @param documentId
 */
export class YjsPowersyncProvider extends ObservableV2<YjsPowerSyncEvents> {
  private readonly seenDocUpdates = new Set<string>();
  private readonly abortController = new AbortController();
  private readonly persistence = new YjsPersistenceTracker();

  readonly doc: Doc;
  readonly db: AbstractPowerSyncDatabase;
  readonly documentId: string;
  readonly workspaceId: string;
  private userId?: string | null;

  constructor(
    doc: Doc,
    db: AbstractPowerSyncDatabase,
    documentId: string,
    workspaceId: string,
    userId?: string | null
  ) {
    super();

    this.doc = doc;
    this.db = db;
    this.documentId = documentId;
    this.workspaceId = workspaceId;
    this.userId = userId;

    const updates = watchYjsDocumentUpdates(db, documentId, {
      signal: this.abortController.signal,
    });

    this._storeUpdate = this._storeUpdate.bind(this);
    this.destroy = this.destroy.bind(this);

    let synced = false;

    const watchLoop = async () => {
      for await (const results of updates) {
        if (this.abortController.signal.aborted) {
          break;
        }

        // New data detected in the database
        for (const update of results.rows?._array ?? []) {
          // Ignore any updates we've already seen
          if (!this.seenDocUpdates.has(update.id)) {
            this.seenDocUpdates.add(update.id);
            // apply the update from the database to the doc
            applyUpdateV2(doc, b64ToUint8Array(update.update_b64), this);
          }
        }

        if (!synced) {
          synced = true;
          this.emit("synced", []);
        }
      }
    };
    void watchLoop().catch((error: unknown) => {
      if (this.abortController.signal.aborted) {
        return;
      }
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.emit("error", [normalized]);
    });

    doc.on("updateV2", this._storeUpdate);
    doc.on("destroy", this.destroy);
  }

  private _storeUpdate(update: Uint8Array, origin: unknown) {
    if (origin === this || origin === PERSISTED_YJS_UPDATE_ORIGIN) {
      // update originated from the database / PowerSync - ignore
      return;
    }

    this.persistence.startWrite();
    // Capture attribution at edit time. A later session change only affects
    // future writes, never an update already queued for persistence.
    void this.persistUpdate(update, this.userId);
  }

  private async persistUpdate(
    update: Uint8Array,
    userId: string | null | undefined
  ) {
    try {
      // update originated from elsewhere - save to the database
      const docUpdateId = await insertYjsDocumentUpdate(
        this.db,
        this.documentId,
        this.workspaceId,
        Uint8ArrayTob64(update),
        userId
      );
      this.seenDocUpdates.add(docUpdateId);
    } catch (error) {
      const persistenceError = this.persistence.failWrite(error);
      if (persistenceError) {
        log.error({
          tag: "Yjs",
          msg: "Failed to persist document update",
          documentId: this.documentId,
          error: persistenceError,
        });
      }
    } finally {
      this.persistence.completeWrite();
    }
  }

  getPersistenceState(): YjsPersistenceState {
    return this.persistence.getState();
  }

  subscribePersistenceState(listener: (state: YjsPersistenceState) => void) {
    return this.persistence.subscribe(listener);
  }

  waitForPersistence(): Promise<void> {
    return this.persistence.wait();
  }

  /** Update attribution without rebuilding or rehydrating the shared Y.Doc. */
  setUserId(userId: string | null | undefined) {
    this.userId = userId;
  }

  /**
   * Destroy this persistence provider, removing any attached event listeners.
   */
  destroy() {
    this.abortController.abort();
    this.doc.off("updateV2", this._storeUpdate);
    this.doc.off("destroy", this.destroy);
    this.persistence.clearListeners();
  }

  /**
   * Delete data associated with this document from the database.
   *
   * Also call `destroy()` to remove any event listeners and prevent future updates to the database.
   */
  async deleteData() {
    await deleteYjsDocumentUpdates(this.db, this.documentId);
  }
}
