import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  database,
  databaseOptions,
  hashUserIdMock,
  invokeMock,
  listenMock,
  unlisten,
  wipeLocalDbMock,
} = vi.hoisted(() => ({
    database: {
      close: vi.fn(),
      disconnect: vi.fn(),
      execute: vi.fn(),
      getAll: vi.fn(),
      getOptional: vi.fn(),
      init: vi.fn(),
      rustHandle: 7,
      updateSchema: vi.fn(),
      writeTransaction: vi.fn(),
    },
    databaseOptions: { values: [] as unknown[] },
    hashUserIdMock: vi.fn(async (value: string) => {
      if (value === '["eu","user"]') return "fedcba9876543210";
      return "0123456789abcdef";
    }),
    invokeMock: vi.fn(),
    listenMock: vi.fn(),
    unlisten: vi.fn(),
    wipeLocalDbMock: vi.fn(),
  }));

vi.mock("@powersync/tauri-plugin", () => ({
  PowerSyncTauriDatabase: class {
    constructor(options: unknown) {
      databaseOptions.values.push(options);
      return database;
    }
  },
}));
vi.mock("@repo/data/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/data/core")>()),
  hashUserId: hashUserIdMock,
  wipeLocalDb: wipeLocalDbMock,
}));
vi.mock("@repo/data/schema", () => ({ createAppSchema: vi.fn(() => ({})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/path", () => ({ appDataDir: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

import { createNativePowerSyncSession } from "./powersync";

function createBlocker() {
  return {
    getSnapshot: vi.fn(() => ({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    })),
    isBlocked: vi.fn(() => false),
    recordClientError: vi.fn(),
    recordNonClientError: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    resume: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

describe("createNativePowerSyncSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseOptions.values = [];
    database.close.mockResolvedValue(undefined);
    database.disconnect.mockResolvedValue(undefined);
    database.execute.mockResolvedValue(undefined);
    database.getAll.mockResolvedValue([]);
    database.init.mockResolvedValue(undefined);
    database.updateSchema.mockResolvedValue(undefined);
    database.getOptional.mockResolvedValue(undefined);
    database.writeTransaction.mockImplementation(
      async (callback: (tx: typeof database) => Promise<unknown>) =>
        callback(database),
    );
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockResolvedValue(unlisten);
  });

  it("initializes region-scoped native storage without deleting databases", async () => {
    await createNativePowerSyncSession({
      apiUrl: "https://eu.lunaris.app",
      regionId: "eu",
      sessionId: "session",
      syncBlocker: createBlocker(),
      userId: "user",
    });

    expect(wipeLocalDbMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(database.init).toHaveBeenCalledOnce();
    expect(databaseOptions.values[0]).toMatchObject({
      database: { dbFilename: "lunaris.v2.fedcba9876543210.db" },
    });
  });

  it("connects once and closes the native listener", async () => {
    const session = await createNativePowerSyncSession({
      apiUrl: "https://eu.lunaris.app",
      regionId: "eu",
      sessionId: "session",
      syncBlocker: createBlocker(),
      userId: "user",
    });

    await Promise.all([session.connect(), session.connect()]);
    expect(invokeMock).toHaveBeenCalledWith("powersync_connect", {
      apiUrl: "https://eu.lunaris.app",
      handle: 7,
      regionId: "eu",
    });

    await session.close();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(database.close).toHaveBeenCalledTimes(1);
  });

  it("closes the handle before deleting native files", async () => {
    const session = await createNativePowerSyncSession({
      apiUrl: "https://eu.lunaris.app",
      regionId: "eu",
      sessionId: "session",
      syncBlocker: createBlocker(),
      userId: "user",
    });

    await session.purge();
    const deleteCall = invokeMock.mock.calls.findIndex(
      ([command, input]) =>
        command === "powersync_delete_database" &&
        input.storageName === "lunaris.v2.fedcba9876543210.db",
    );
    expect(database.close.mock.invocationCallOrder[0]).toBeLessThan(
      invokeMock.mock.invocationCallOrder[deleteCall]!,
    );
  });

  it("returns native storage size", async () => {
    const session = await createNativePowerSyncSession({
      apiUrl: "https://eu.lunaris.app",
      regionId: "eu",
      sessionId: "session",
      syncBlocker: createBlocker(),
      userId: "user",
    });
    invokeMock.mockResolvedValueOnce(4096);

    await expect(session.estimateStorage()).resolves.toEqual({
      quota: null,
      usage: 4096,
    });
  });

  it("closes the database when listener setup fails", async () => {
    listenMock.mockRejectedValueOnce(new Error("listener unavailable"));

    await expect(
      createNativePowerSyncSession({
        apiUrl: "https://eu.lunaris.app",
        regionId: "eu",
        sessionId: "session",
        syncBlocker: createBlocker(),
        userId: "user",
      }),
    ).rejects.toThrow("listener unavailable");
    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
