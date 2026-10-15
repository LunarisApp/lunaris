import type { CommonPowerSyncDatabase, Transaction } from "@powersync/common";

export type Database = CommonPowerSyncDatabase;
export type DatabaseOrTx = CommonPowerSyncDatabase | Transaction;

/**
 * Helper function that helps to ensure transaction context.
 * @param db
 * @param callback
 */
export function ensureTx<T>(
  db: DatabaseOrTx,
  callback: (tx: Transaction) => Promise<T>
) {
  if ("writeTransaction" in db) {
    return db.writeTransaction(callback);
  }
  return callback(db);
}

/**
 * Delete all entries from the PowerSync upload queue.
 */
export async function clearUploadQueue(db: DatabaseOrTx) {
  await db.execute("DELETE FROM ps_crud");
}

export const localTable = (name: string) => `local_${name}`;

export interface CreateSchemaTableProps {
  localOnly?: boolean;
  viewName?: string;
}
