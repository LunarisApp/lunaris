import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wipeLocalDb } from "./db-wipe";

const DB_FILENAME = "lunaris.v2.abc.db";

interface FakeIdbRequest {
  error: DOMException | null;
  onblocked: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onsuccess: ((ev: Event) => void) | null;
  result: unknown;
}

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator"
);
const originalIndexedDB = Object.getOwnPropertyDescriptor(
  globalThis,
  "indexedDB"
);

function setStorage(getDirectory: (() => Promise<unknown>) | undefined) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      storage: getDirectory ? { getDirectory } : {},
    },
  });
}

function setIndexedDb(deleteDatabase: (name: string) => FakeIdbRequest) {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: { deleteDatabase },
  });
}

function notFound(name: string): DOMException {
  const err =
    typeof DOMException === "undefined"
      ? Object.assign(new Error(`no ${name}`), { name: "NotFoundError" })
      : new DOMException(`no ${name}`, "NotFoundError");
  return err as DOMException;
}

function restore(
  key: "navigator" | "indexedDB",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }
  delete (globalThis as Record<string, unknown>)[key];
}

describe("wipeLocalDb", () => {
  let removeEntry: ReturnType<typeof vi.fn>;
  let deleteDatabase: ReturnType<typeof vi.fn>;
  let idbRequest: FakeIdbRequest;

  beforeEach(() => {
    removeEntry = vi.fn().mockResolvedValue(undefined);
    setStorage(() =>
      Promise.resolve({ removeEntry } as unknown as FileSystemDirectoryHandle)
    );

    idbRequest = {
      onsuccess: null,
      onerror: null,
      onblocked: null,
      error: null,
      result: null,
    };
    deleteDatabase = vi.fn(() => {
      queueMicrotask(() => idbRequest.onsuccess?.(new Event("success")));
      return idbRequest;
    });
    setIndexedDb(deleteDatabase as unknown as (name: string) => FakeIdbRequest);
  });

  afterEach(() => {
    restore("navigator", originalNavigator);
    restore("indexedDB", originalIndexedDB);
  });

  it("removes the db file and its journal siblings from OPFS", async () => {
    await wipeLocalDb(DB_FILENAME);
    const calls = removeEntry.mock.calls.map((c) => c[0]);
    expect(calls).toContain(DB_FILENAME);
    expect(calls).toContain(`${DB_FILENAME}-journal`);
    expect(calls).toContain(`${DB_FILENAME}-wal`);
    expect(calls).toContain(`${DB_FILENAME}-shm`);
    expect(removeEntry).toHaveBeenCalledTimes(4);
  });

  it("deletes the IndexedDB database matching the filename", async () => {
    await wipeLocalDb(DB_FILENAME);
    expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(DB_FILENAME);
  });

  it("swallows NotFoundError for missing OPFS entries", async () => {
    removeEntry.mockImplementation((name: string) => {
      if (name === DB_FILENAME) {
        return Promise.resolve();
      }
      return Promise.reject(notFound(name));
    });
    await expect(wipeLocalDb(DB_FILENAME)).resolves.toBeUndefined();
  });

  it("does not throw when IndexedDB delete is blocked", async () => {
    deleteDatabase.mockImplementation(() => {
      queueMicrotask(() => idbRequest.onblocked?.(new Event("blocked")));
      return idbRequest;
    });
    await expect(wipeLocalDb(DB_FILENAME)).resolves.toBeUndefined();
  });

  it("does not throw when IndexedDB delete errors", async () => {
    deleteDatabase.mockImplementation(() => {
      idbRequest.error = new Error("boom") as unknown as DOMException;
      queueMicrotask(() => idbRequest.onerror?.(new Event("error")));
      return idbRequest;
    });
    await expect(wipeLocalDb(DB_FILENAME)).resolves.toBeUndefined();
  });

  it("is a no-op when navigator.storage is unavailable", async () => {
    setStorage(undefined);
    await expect(wipeLocalDb(DB_FILENAME)).resolves.toBeUndefined();
  });
});
