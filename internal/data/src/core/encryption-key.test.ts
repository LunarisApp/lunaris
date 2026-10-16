import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEncryptionKeyCache,
  clearEncryptionKeyMemory,
  deleteEncryptionKey,
  type EncryptionKeyScope,
  OfflineEncryptionKeyError,
  persistEncryptionKey,
  refreshEncryptionKey,
  resolveEncryptionKey,
} from "./encryption-key";
import * as keyVault from "./key-vault";

const VALID_KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const SCOPE: EncryptionKeyScope = {
  backendUrl: "https://api.example.com",
  regionId: "eu",
  sessionId: "session-1",
  userId: "user-1",
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function setOnline(online: boolean) {
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

describe("encryption key vault", () => {
  beforeEach(async () => {
    setOnline(true);
    await clearEncryptionKeyCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setOnline(true);
    await clearEncryptionKeyCache();
  });

  it("fetches a valid key without persisting before database boot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })));
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveEncryptionKey(SCOPE);

    expect(resolved).toMatchObject({ key: VALID_KEY, source: "network" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/client/encryption-key",
      { credentials: "include" }
    );

    clearEncryptionKeyMemory();
    setOnline(false);
    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });

  it("opens from persistent storage after a cold offline reload", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })))
    );
    const online = await resolveEncryptionKey(SCOPE);
    await persistEncryptionKey(online);
    clearEncryptionKeyMemory();
    setOnline(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveEncryptionKey(SCOPE)).resolves.toMatchObject({
      key: VALID_KEY,
      source: "persistent",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scopes keys by region, user, and session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: VALID_KEY })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: OTHER_KEY })));
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveEncryptionKey(SCOPE);
    const second = await resolveEncryptionKey({
      ...SCOPE,
      sessionId: "session-2",
    });

    expect(first.key).toBe(VALID_KEY);
    expect(second.key).toBe(OTHER_KEY);
    expect(first.cacheId).not.toBe(second.cacheId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent network fetches per scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      resolveEncryptionKey(SCOPE),
      resolveEncryptionKey(SCOPE),
    ]);

    expect(first.key).toBe(VALID_KEY);
    expect(second.key).toBe(VALID_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not restore a key when logout clears an in-flight fetch", async () => {
    const response = deferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetchMock);

    const resolution = resolveEncryptionKey(SCOPE);
    const rejection = expect(resolution).rejects.toThrow(
      "Encryption key cache invalidated"
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await clearEncryptionKeyCache();
    response.resolve(new Response(JSON.stringify({ key: VALID_KEY })));
    await rejection;

    setOnline(false);
    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });

  it("does not persist a resolved key after logout invalidates it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })))
    );
    const resolved = await resolveEncryptionKey(SCOPE);

    await clearEncryptionKeyCache();
    await persistEncryptionKey(resolved);
    clearEncryptionKeyMemory();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });

  it("orders logout clear after an active persistent write", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })))
    );
    const resolved = await resolveEncryptionKey(SCOPE);
    const writeStarted = deferred<void>();
    const finishWrite = deferred<void>();
    const writeRecord = keyVault.writeEncryptionKeyVaultRecord;
    vi.spyOn(keyVault, "writeEncryptionKeyVaultRecord").mockImplementation(
      async (record) => {
        writeStarted.resolve();
        await finishWrite.promise;
        await writeRecord(record);
      }
    );

    const persistence = persistEncryptionKey(resolved);
    await writeStarted.promise;
    let clearFinished = false;
    const clearing = clearEncryptionKeyCache().then(() => {
      clearFinished = true;
    });
    await Promise.resolve();
    expect(clearFinished).toBe(false);

    finishWrite.resolve();
    await Promise.all([persistence, clearing]);
    clearEncryptionKeyMemory();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });

  it("throws a recoverable error when no offline key exists", async () => {
    setOnline(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converts a network failure into the recoverable offline error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });

  it("rejects non-2xx and malformed key responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );
    await expect(resolveEncryptionKey(SCOPE)).rejects.toThrow(
      /Encryption key fetch failed/
    );

    clearEncryptionKeyMemory();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: "bad" })))
    );
    await expect(refreshEncryptionKey(SCOPE)).rejects.toThrow(
      /Encryption key fetch failed/
    );
  });

  it("deletes corrupt persistent records and fails safely offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })))
    );
    const resolved = await resolveEncryptionKey(SCOPE);
    await persistEncryptionKey(resolved);
    clearEncryptionKeyMemory();

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("lunaris.encryption-keys", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = database
        .transaction("keys", "readwrite")
        .objectStore("keys")
        .put({ id: resolved.cacheId, key: "corrupt", updatedAt: "invalid" });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });

  it("deletes only the purged scope", async () => {
    const otherScope = { ...SCOPE, sessionId: "session-2" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: VALID_KEY })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: OTHER_KEY })));
    vi.stubGlobal("fetch", fetchMock);
    await persistEncryptionKey(await resolveEncryptionKey(SCOPE));
    await persistEncryptionKey(await resolveEncryptionKey(otherScope));

    await deleteEncryptionKey(SCOPE);
    clearEncryptionKeyMemory();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
    await expect(resolveEncryptionKey(otherScope)).resolves.toMatchObject({
      key: OTHER_KEY,
      source: "persistent",
    });
  });

  it("blocks stale persistence only for the purged scope", async () => {
    const otherScope = { ...SCOPE, sessionId: "session-2" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: VALID_KEY })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: OTHER_KEY })));
    vi.stubGlobal("fetch", fetchMock);
    const stale = await resolveEncryptionKey(SCOPE);
    const other = await resolveEncryptionKey(otherScope);
    await persistEncryptionKey(other);

    await deleteEncryptionKey(SCOPE);
    await persistEncryptionKey(stale);
    clearEncryptionKeyMemory();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
    await expect(resolveEncryptionKey(otherScope)).resolves.toMatchObject({
      key: OTHER_KEY,
      source: "persistent",
    });
  });

  it("allows a fresh resolution after logout clear", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: VALID_KEY })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: OTHER_KEY })));
    vi.stubGlobal("fetch", fetchMock);
    const stale = await resolveEncryptionKey(SCOPE);

    await clearEncryptionKeyCache();
    await persistEncryptionKey(stale);
    const fresh = await resolveEncryptionKey(SCOPE);
    await persistEncryptionKey(fresh);
    clearEncryptionKeyMemory();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).resolves.toMatchObject({
      key: OTHER_KEY,
      source: "persistent",
    });
  });

  it("allows a fresh resolution after scoped purge", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: VALID_KEY })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: OTHER_KEY })));
    vi.stubGlobal("fetch", fetchMock);
    const stale = await resolveEncryptionKey(SCOPE);

    await deleteEncryptionKey(SCOPE);
    await persistEncryptionKey(stale);
    const fresh = await resolveEncryptionKey(SCOPE);
    await persistEncryptionKey(fresh);
    clearEncryptionKeyMemory();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).resolves.toMatchObject({
      key: OTHER_KEY,
      source: "persistent",
    });
  });

  it("clears persistent and memory keys on logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ key: VALID_KEY })))
    );
    await persistEncryptionKey(await resolveEncryptionKey(SCOPE));

    await clearEncryptionKeyCache();
    setOnline(false);

    await expect(resolveEncryptionKey(SCOPE)).rejects.toBeInstanceOf(
      OfflineEncryptionKeyError
    );
  });
});
