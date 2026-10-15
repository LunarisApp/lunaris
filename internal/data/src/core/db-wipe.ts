import { log, parseError } from "evlog";

/**
 * SQLite keeps the main DB file plus three sidecar files at the same path:
 * rollback journal, write-ahead log, shared-memory index. A wipe must remove
 * all four, otherwise wa-sqlite can re-open the orphaned WAL on the fresh
 * file and re-introduce stale encrypted pages.
 */
const SQLITE_SIDECAR_SUFFIXES = ["-journal", "-wal", "-shm"] as const;

/**
 * Cap on how long we'll wait for the cross-tab wipe lock before giving up
 * and proceeding without serialization. A hung/zombie tab holding the lock
 * indefinitely is worse than a rare double-wipe — we must not strand the
 * app on LoaderView forever.
 */
const WIPE_LOCK_TIMEOUT_MS = 15_000;

/**
 * Deletes the local PowerSync SQLite file and its journal siblings from both
 * OPFS (wa-sqlite's OPFS VFS path) and IndexedDB (IDBBatchAtomicVFS fallback
 * path) for the given filename.
 *
 * Called after a detected encryption-key mismatch (e.g. the file on disk was
 * encrypted with a prior session's key) so the next `createPowerSync()` boots
 * a fresh file and re-syncs from the backend. Scoped strictly to the passed
 * filename — other users' files in the same browser profile are untouched.
 *
 * Callers MUST disconnect the stale `PowerSyncDatabase` before invoking this,
 * otherwise OPFS may report the file as locked.
 */
export async function wipeLocalDb(dbFilename: string): Promise<void> {
  // Serialize across tabs. Without this, tab A can delete the fresh file
  // tab B just re-created after its own wipe — each tab thinks it raced
  // first. The lock name is scoped to the filename so unrelated users
  // aren't blocked.
  await withWipeLock(dbFilename, async () => {
    const [opfsOk, idbOk] = await Promise.all([
      wipeOpfs(dbFilename),
      wipeIdb(dbFilename),
    ]);
    log.warn({
      tag: "Sync",
      msg: "wiped local db after key mismatch",
      dbFilename,
      opfsOk,
      idbOk,
    });
  });
}

async function withWipeLock(
  dbFilename: string,
  body: () => Promise<void>
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    // Older Safari and any non-browser runtime. We log once so telemetry
    // can spot users hitting the racy path.
    log.warn({
      tag: "Sync",
      msg: "navigator.locks unavailable — wipe not serialized across tabs",
      dbFilename,
    });
    await body();
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WIPE_LOCK_TIMEOUT_MS);
  try {
    await navigator.locks.request(
      `lunaris-wipe-${dbFilename}`,
      { mode: "exclusive", signal: controller.signal },
      async () => {
        await body();
      }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      log.warn({
        tag: "Sync",
        msg: "wipe lock timed out — proceeding without serialization",
        dbFilename,
      });
      await body();
      return;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * OPFS stores the SQLite file plus `-journal`, `-wal`, `-shm` siblings at the
 * storage root. Remove the main file FIRST so any concurrent reader fails
 * fast before we strip the WAL out from under it — a half-wiped (sidecars
 * gone, main intact) file is worse than a fully intact one. Swallow
 * NotFoundError (nothing to delete on a fresh install) but log other failures
 * so we can see if removal is genuinely blocked (another tab holds the
 * handle). Returns true only if every existing entry was removed cleanly.
 */
async function wipeOpfs(dbFilename: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    return true;
  }
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch (error) {
    log.error({
      tag: "Sync",
      msg: "opfs root unavailable for wipe",
      dbFilename,
      error: parseError(error),
    });
    return false;
  }
  const mainOk = await removeOpfsEntry(root, dbFilename);
  // Sidecars are parallel — order among them doesn't matter once the main
  // file is gone, and wa-sqlite won't reopen sidecars without it.
  const sidecarResults = await Promise.all(
    SQLITE_SIDECAR_SUFFIXES.map((suffix) =>
      removeOpfsEntry(root, `${dbFilename}${suffix}`)
    )
  );
  return mainOk && sidecarResults.every(Boolean);
}

async function removeOpfsEntry(
  root: FileSystemDirectoryHandle,
  name: string
): Promise<boolean> {
  try {
    await root.removeEntry(name);
    return true;
  } catch (error) {
    if ((error as DOMException | undefined)?.name === "NotFoundError") {
      return true;
    }
    log.error({
      tag: "Sync",
      msg: "opfs entry removal failed",
      entry: name,
      error: parseError(error),
    });
    return false;
  }
}

/**
 * The IndexedDB fallback VFS stores the DB under an IDB database whose name
 * matches the wa-sqlite filename. Deleting that IDB database is the cheapest
 * full wipe. `onblocked` fires when another tab holds an open connection —
 * we treat it the same as a failure and move on; the next boot will hit the
 * same mismatch and retry. Returns true only on clean deletion.
 */
function wipeIdb(dbFilename: string): Promise<boolean> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    const req = indexedDB.deleteDatabase(dbFilename);
    req.onsuccess = () => resolve(true);
    req.onerror = () => {
      log.error({
        tag: "Sync",
        msg: "idb deleteDatabase failed",
        dbFilename,
        error: parseError(req.error ?? new Error("idb deleteDatabase failed")),
      });
      resolve(false);
    };
    req.onblocked = () => {
      log.warn({
        tag: "Sync",
        msg: "idb deleteDatabase blocked (open connections)",
        dbFilename,
      });
      resolve(false);
    };
  });
}
