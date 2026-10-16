import * as powersyncWeb from "@powersync/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebPowerSyncDatabase } from "../powersync-web";

const TEST_KEY = "a".repeat(64);
const TEST_FILENAME = "lunaris.v2.test.db";

const mockPowerSyncDatabase = vi.fn();

vi.mock("../features", () => ({
  createAppSchema: vi.fn(() => ({ tables: {} })),
}));

vi.mock("@powersync/web", () => {
  class BaseObserver {}
  class AbstractPowerSyncDatabase {}

  class PowerSyncDatabase {
    constructor(config: unknown) {
      mockPowerSyncDatabase(config);
      return { config };
    }
  }

  return {
    AbstractPowerSyncDatabase,
    BaseObserver,
    PowerSyncDatabase,
    WASQLiteVFS: {
      OPFSCoopSyncVFS: "opfs",
      IDBBatchAtomicVFS: "idb",
    },
  };
});

const { WASQLiteVFS } = powersyncWeb;

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
const originalSharedWorker = Object.getOwnPropertyDescriptor(
  globalThis,
  "SharedWorker"
);
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator"
);
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function setGlobal(name: "Worker" | "SharedWorker", value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobal(
  name: "Worker" | "SharedWorker",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  // `delete` is correct here because the property may not exist in the test env.
  delete (globalThis as Record<string, unknown>)[name];
}

function setNavigator(userAgent: string) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent },
  });
}

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  });
}

function restoreGlobalProperty(
  name: "navigator" | "window",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  delete (globalThis as Record<string, unknown>)[name];
}

describe("createWebPowerSyncDatabase", () => {
  beforeEach(() => {
    mockPowerSyncDatabase.mockClear();
  });

  afterEach(() => {
    restoreGlobal("Worker", originalWorker);
    restoreGlobal("SharedWorker", originalSharedWorker);
    restoreGlobalProperty("navigator", originalNavigator);
    restoreGlobalProperty("window", originalWindow);
  });

  it("uses OPFS with dedicated workers and multi-tab support on desktop", () => {
    class FakeWorker {}
    class FakeSharedWorker {}

    setGlobal("Worker", FakeWorker);
    setGlobal("SharedWorker", FakeSharedWorker);
    setNavigator(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36"
    );
    setWindow({});

    createWebPowerSyncDatabase({
      encryptionKey: TEST_KEY,
      dbFilename: TEST_FILENAME,
    });

    expect(mockPowerSyncDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        database: {
          dbFilename: TEST_FILENAME,
          encryptionKey: TEST_KEY,
          debugMode: undefined,
          vfs: WASQLiteVFS.OPFSCoopSyncVFS,
          enableMultiTabs: true,
          useWebWorker: true,
        },
        logger: expect.anything(),
      })
    );
  });

  it("uses OPFS with dedicated workers but disables multi-tab support on iPhone Safari even when SharedWorker exists", () => {
    class FakeWorker {}
    class FakeSharedWorker {}

    setGlobal("Worker", FakeWorker);
    setGlobal("SharedWorker", FakeSharedWorker);
    setNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    );
    setWindow({});

    createWebPowerSyncDatabase({
      encryptionKey: TEST_KEY,
      dbFilename: TEST_FILENAME,
    });

    expect(mockPowerSyncDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        database: {
          dbFilename: TEST_FILENAME,
          encryptionKey: TEST_KEY,
          debugMode: undefined,
          vfs: WASQLiteVFS.OPFSCoopSyncVFS,
          enableMultiTabs: false,
          useWebWorker: true,
        },
      })
    );
  });

  it("disables multi-tab support on Safari desktop", () => {
    class FakeWorker {}
    class FakeSharedWorker {}

    setGlobal("Worker", FakeWorker);
    setGlobal("SharedWorker", FakeSharedWorker);
    setNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15"
    );
    setWindow({ safari: {} });

    createWebPowerSyncDatabase({
      encryptionKey: TEST_KEY,
      dbFilename: TEST_FILENAME,
    });

    expect(mockPowerSyncDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        database: {
          dbFilename: TEST_FILENAME,
          encryptionKey: TEST_KEY,
          debugMode: undefined,
          vfs: WASQLiteVFS.OPFSCoopSyncVFS,
          enableMultiTabs: false,
          useWebWorker: true,
        },
      })
    );
  });

  it("falls back to IndexedDB when no worker support exists", () => {
    setGlobal("Worker", undefined);
    setGlobal("SharedWorker", undefined);
    setNavigator("Mozilla/5.0");
    setWindow({});

    createWebPowerSyncDatabase({
      encryptionKey: TEST_KEY,
      dbFilename: TEST_FILENAME,
    });

    expect(mockPowerSyncDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        database: {
          dbFilename: TEST_FILENAME,
          encryptionKey: TEST_KEY,
          debugMode: undefined,
          vfs: WASQLiteVFS.IDBBatchAtomicVFS,
          enableMultiTabs: false,
          useWebWorker: false,
        },
      })
    );
  });
});
