import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { describe, expect, it, vi } from "vitest";
import {
  EncryptionKeyMismatchError,
  isEncryptionKeyMismatch,
  isNotADbError,
  probeEncryption,
} from "./encryption-probe";

const DB_FILENAME = "lunaris.v2.abc.db";

function makeDb(
  get: (sql: string) => Promise<unknown>
): AbstractPowerSyncDatabase {
  return { get } as unknown as AbstractPowerSyncDatabase;
}

describe("probeEncryption", () => {
  it("resolves when the header reads successfully", async () => {
    const get = vi.fn().mockResolvedValue({ user_version: 0 });
    await probeEncryption(makeDb(get), DB_FILENAME);
    expect(get).toHaveBeenCalledWith("PRAGMA user_version");
  });

  it("wraps SQLITE_NOTADB status as EncryptionKeyMismatchError", async () => {
    const cause = Object.assign(new Error("file is not a database"), {
      status: 26,
    });
    const get = vi.fn().mockRejectedValue(cause);
    const err = await probeEncryption(makeDb(get), DB_FILENAME).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(EncryptionKeyMismatchError);
    expect((err as EncryptionKeyMismatchError).dbFilename).toBe(DB_FILENAME);
    expect((err as EncryptionKeyMismatchError).cause).toBe(cause);
  });

  it("wraps message-only 'file is not a database' errors (worker-marshal case)", async () => {
    // Worker boundary structured-clone strips non-standard props (status,
    // code) off Error. The canonical SQLite text is the only remaining
    // signal, so it MUST trigger the wipe path — otherwise logout→login
    // stays broken for the most common user flow.
    const cause = new Error("file is not a database");
    const get = vi.fn().mockRejectedValue(cause);
    const err = await probeEncryption(makeDb(get), DB_FILENAME).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(EncryptionKeyMismatchError);
    expect((err as EncryptionKeyMismatchError).cause).toBe(cause);
  });

  it("does NOT wrap substring or wrong-case variants of the NOTADB message", async () => {
    // The message match is exact — anything else (prefix, suffix, casing
    // difference) is rejected so unrelated errors whose text happens to
    // contain the phrase can't force a destructive wipe.
    for (const message of [
      "file is not a database: foo",
      "oops: file is not a database",
      "File Is Not A Database",
    ]) {
      const cause = new Error(message);
      const get = vi.fn().mockRejectedValue(cause);
      const err = await probeEncryption(makeDb(get), DB_FILENAME).catch(
        (e: unknown) => e
      );
      expect(err, `rejected: ${message}`).toBe(cause);
      expect(err, `rejected: ${message}`).not.toBeInstanceOf(
        EncryptionKeyMismatchError
      );
    }
  });

  it("wraps SQLITE_NOTADB code strings", async () => {
    const cause = Object.assign(new Error("boom"), { code: "SQLITE_NOTADB" });
    const get = vi.fn().mockRejectedValue(cause);
    const err = await probeEncryption(makeDb(get), DB_FILENAME).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(EncryptionKeyMismatchError);
  });

  it("re-throws unrelated SQL errors unchanged", async () => {
    const cause = Object.assign(new Error("no such table: foo"), {
      status: 1,
    });
    const get = vi.fn().mockRejectedValue(cause);
    const err = await probeEncryption(makeDb(get), DB_FILENAME).catch(
      (e: unknown) => e
    );
    expect(err).toBe(cause);
    expect(err).not.toBeInstanceOf(EncryptionKeyMismatchError);
  });
});

describe("isEncryptionKeyMismatch", () => {
  it("matches a native EncryptionKeyMismatchError instance", () => {
    const err = new EncryptionKeyMismatchError(DB_FILENAME, new Error("boom"));
    expect(isEncryptionKeyMismatch(err)).toBe(true);
  });

  it("matches a cross-realm error via the Symbol.for brand", () => {
    // Simulates a copy thrown from a worker/chunk where instanceof fails
    // because the realms each have their own class definition. The brand
    // key resolves to the same global symbol across realms.
    const brand = Symbol.for("lunaris.encryption-key-mismatch");
    const crossRealm = Object.assign(new Error("x"), {
      name: "EncryptionKeyMismatchError",
      [brand]: true,
    });
    expect(isEncryptionKeyMismatch(crossRealm)).toBe(true);
  });

  it("rejects errors with only a forged name string (no brand)", () => {
    // Protects against in-realm code throwing `{ name: '...' }` to force
    // a destructive wipe.
    const forged = Object.assign(new Error("x"), {
      name: "EncryptionKeyMismatchError",
    });
    expect(isEncryptionKeyMismatch(forged)).toBe(false);
  });

  it("rejects unrelated errors", () => {
    expect(isEncryptionKeyMismatch(new Error("other"))).toBe(false);
    expect(isEncryptionKeyMismatch(null)).toBe(false);
    expect(isEncryptionKeyMismatch("string")).toBe(false);
  });
});

describe("isNotADbError", () => {
  it("matches status=26", () => {
    const err = Object.assign(new Error("boom"), { status: 26 });
    expect(isNotADbError(err)).toBe(true);
  });

  it("matches code=SQLITE_NOTADB", () => {
    const err = Object.assign(new Error("boom"), { code: "SQLITE_NOTADB" });
    expect(isNotADbError(err)).toBe(true);
  });

  it("matches exact canonical message when status/code absent", () => {
    // Simulates worker-boundary structured clone stripping status/code.
    expect(isNotADbError(new Error("file is not a database"))).toBe(true);
  });

  it("rejects substring and wrong-case messages", () => {
    expect(isNotADbError(new Error("file is not a database: foo"))).toBe(false);
    expect(isNotADbError(new Error("oops file is not a database"))).toBe(false);
    expect(isNotADbError(new Error("File Is Not A Database"))).toBe(false);
  });

  it("rejects unrelated errors and non-objects", () => {
    expect(isNotADbError(new Error("no such table: foo"))).toBe(false);
    expect(isNotADbError(null)).toBe(false);
    expect(isNotADbError(undefined)).toBe(false);
    expect(isNotADbError("file is not a database")).toBe(false);
  });
});
