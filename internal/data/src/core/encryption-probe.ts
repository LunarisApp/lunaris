import type { AbstractPowerSyncDatabase } from "@powersync/common";

/**
 * SQLite result code for "file is not a database" — what
 * wa-sqlite-multiple-ciphers surfaces when page-1 decryption fails under the
 * candidate key. See https://www.sqlite.org/rescode.html#notadb.
 */
const SQLITE_NOTADB_STATUS = 26;

/**
 * Canonical error text produced by `sqlite3ErrStr(SQLITE_NOTADB)`. Used as a
 * last-resort fallback when `status` / `code` signals are absent — which
 * happens whenever the error crosses a Worker boundary, because
 * `postMessage` structured clone strips non-standard properties off Error
 * objects. Match is exact (full string, not substring) to stay inside the
 * safety bound #153 set when it dropped the old loose substring match.
 * No other producer emits this exact text.
 */
const SQLITE_NOTADB_MESSAGE = "file is not a database";

/**
 * Unforgeable marker we set on every `EncryptionKeyMismatchError` instance.
 * `Symbol.for` gives us a realm-global registered symbol — the same key
 * resolves to the same symbol across web workers, code-splitting chunks,
 * and even separate copies of `@repo/data` loaded by a plugin — so the
 * detector survives cross-realm boundaries where `instanceof` silently
 * fails. Unlike a magic `name` string, in-realm attackers can't forge
 * this without access to the already-registered symbol (they can retrieve
 * it via `Symbol.for` too, but constructing an error with the brand has
 * no asymmetric advantage over calling the real constructor, which we'd
 * catch via `cause` inspection anyway).
 */
const ENCRYPTION_KEY_MISMATCH_BRAND: unique symbol = Symbol.for(
  "lunaris.encryption-key-mismatch"
);

/**
 * Thrown when the local SQLite file cannot be decrypted with the current
 * encryption key — almost always "file on disk was encrypted with a prior
 * session's key". Callers recover by wiping the file (see `wipeLocalDb`)
 * and re-booting PowerSync with the current key.
 */
export class EncryptionKeyMismatchError extends Error {
  readonly dbFilename: string;
  override readonly cause: unknown;
  readonly [ENCRYPTION_KEY_MISMATCH_BRAND] = true;

  constructor(dbFilename: string, cause: unknown) {
    super(
      `Local DB "${dbFilename}" cannot be decrypted with the current key. ` +
        `Likely a stale file from a prior session — wipe and re-sync.`
    );
    this.name = "EncryptionKeyMismatchError";
    this.dbFilename = dbFilename;
    this.cause = cause;
  }
}

/**
 * Prefer `instanceof`, but fall back to a branded-symbol check so the
 * detector survives cross-module-copy scenarios (web workers,
 * code-splitting chunks, a plugin loading its own `@repo/data`) where
 * `instanceof` fails silently because each realm has its own class.
 * The symbol itself is shared via `Symbol.for` so both sides of a boundary
 * see the same key.
 */
export function isEncryptionKeyMismatch(
  error: unknown
): error is EncryptionKeyMismatchError {
  if (error instanceof EncryptionKeyMismatchError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[ENCRYPTION_KEY_MISMATCH_BRAND] === true
  );
}

/**
 * `PRAGMA key` registers the candidate key but does NOT verify it against
 * the file header. Decryption only fires on the first real page read, so
 * mismatches surface lazily — often minutes later via periodic tasks like
 * TriggerManagerImpl's cleanup, where the log "Caught error while attempting
 * to cleanup triggers / file is not a database" originates.
 *
 * This probe forces a page-1 read immediately after `db.init()` so a
 * mismatch surfaces as `EncryptionKeyMismatchError` synchronously, before
 * any user query lands. wa-sqlite-multiple-ciphers surfaces decrypt failure
 * as SQLite status 26 (`SQLITE_NOTADB`) or code `SQLITE_NOTADB`. When the
 * error crosses a Worker boundary, structured clone strips those props,
 * leaving only the canonical message — we match that as an exact fallback.
 * We still never match on substring, so unrelated errors whose text merely
 * contains "file is not a database" don't trigger a destructive wipe.
 */
export async function probeEncryption(
  db: AbstractPowerSyncDatabase,
  dbFilename: string
): Promise<void> {
  try {
    // `user_version` lives in the DB header (page 1) and is always encrypted.
    // Reading it forces wa-sqlite-multiple-ciphers to decrypt the header,
    // which is exactly the path that fails on a key mismatch.
    await db.get("PRAGMA user_version");
  } catch (error) {
    if (isNotADbError(error)) {
      throw new EncryptionKeyMismatchError(dbFilename, error);
    }
    throw error;
  }
}

export function isNotADbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.status === SQLITE_NOTADB_STATUS) return true;
  const code = record.code;
  if (typeof code === "string" && code.includes("SQLITE_NOTADB")) return true;
  // Worker boundary strips non-standard props off Error via structured
  // clone, so status/code vanish on the main thread. Fall back to the
  // canonical SQLite NOTADB message — exact match only, never substring.
  const message = record.message;
  if (typeof message === "string" && message === SQLITE_NOTADB_MESSAGE) {
    return true;
  }
  return false;
}
