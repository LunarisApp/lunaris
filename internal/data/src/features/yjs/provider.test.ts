import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Doc } from "yjs";
import {
  PERSISTED_YJS_UPDATE_ORIGIN,
  YjsPowersyncProvider,
} from "./provider";

const mocks = vi.hoisted(() => ({
  deleteUpdates: vi.fn(),
  insertUpdate: vi.fn(),
  logError: vi.fn(),
  watchUpdates: vi.fn(),
}));

vi.mock("evlog", () => ({
  log: { error: mocks.logError },
}));

vi.mock("./services", () => ({
  deleteYjsDocumentUpdates: mocks.deleteUpdates,
  insertYjsDocumentUpdate: mocks.insertUpdate,
  watchYjsDocumentUpdates: mocks.watchUpdates,
}));

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const docs: Doc[] = [];

function createProvider() {
  const doc = new Doc();
  docs.push(doc);
  const provider = new YjsPowersyncProvider(
    doc,
    {} as AbstractPowerSyncDatabase,
    "doc-1",
    "workspace-1",
    "user-1"
  );
  return { doc, provider };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertUpdate.mockResolvedValue("update-1");
  mocks.watchUpdates.mockImplementation(() => ({
    async *[Symbol.asyncIterator]() {
      yield { rows: { _array: [] } };
    },
  }));
});

afterEach(() => {
  for (const doc of docs.splice(0)) doc.destroy();
});

describe("YjsPowersyncProvider persistence state", () => {
  it("starts idle and resolves immediately", async () => {
    const { provider } = createProvider();

    expect(provider.getPersistenceState()).toBe("idle");
    await expect(provider.waitForPersistence()).resolves.toBeUndefined();
  });

  it("tracks a local write until it commits", async () => {
    const write = deferred<string>();
    mocks.insertUpdate.mockReturnValueOnce(write.promise);
    const { doc, provider } = createProvider();

    doc.getText("content").insert(0, "a");

    expect(provider.getPersistenceState()).toBe("persisting");
    const persisted = provider.waitForPersistence();
    write.resolve("update-a");

    await expect(persisted).resolves.toBeUndefined();
    expect(provider.getPersistenceState()).toBe("idle");
  });

  it("waits for concurrent writes that finish out of order", async () => {
    const firstWrite = deferred<string>();
    const secondWrite = deferred<string>();
    mocks.insertUpdate
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const { doc, provider } = createProvider();

    doc.getText("content").insert(0, "a");
    doc.getText("content").insert(1, "b");
    const persisted = provider.waitForPersistence();

    secondWrite.resolve("update-b");
    await Promise.resolve();
    expect(provider.getPersistenceState()).toBe("persisting");

    firstWrite.resolve("update-a");
    await expect(persisted).resolves.toBeUndefined();
    expect(provider.getPersistenceState()).toBe("idle");
  });

  it("notifies subscribers and supports unsubscribe", async () => {
    const firstWrite = deferred<string>();
    const secondWrite = deferred<string>();
    mocks.insertUpdate
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const { doc, provider } = createProvider();
    const listener = vi.fn();
    const unsubscribe = provider.subscribePersistenceState(listener);

    doc.getText("content").insert(0, "a");
    firstWrite.resolve("update-a");
    await provider.waitForPersistence();

    expect(listener.mock.calls.map(([state]) => state)).toEqual([
      "idle",
      "persisting",
      "idle",
    ]);

    unsubscribe();
    doc.getText("content").insert(1, "b");
    secondWrite.resolve("update-b");
    await provider.waitForPersistence();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("ignores updates originating from the provider", () => {
    const { doc, provider } = createProvider();

    doc.transact(() => doc.getText("content").insert(0, "remote"), provider);

    expect(mocks.insertUpdate).not.toHaveBeenCalled();
    expect(provider.getPersistenceState()).toBe("idle");
  });

  it("does not persist an already committed migration update twice", () => {
    const { doc, provider } = createProvider();

    doc.transact(
      () => doc.getText("content").insert(0, "migrated"),
      PERSISTED_YJS_UPDATE_ORIGIN,
    );

    expect(mocks.insertUpdate).not.toHaveBeenCalled();
    expect(provider.getPersistenceState()).toBe("idle");
  });

  it("uses updated user attribution for future writes", async () => {
    const { doc, provider } = createProvider();

    doc.getText("content").insert(0, "a");
    await provider.waitForPersistence();
    provider.setUserId("user-2");
    doc.getText("content").insert(1, "b");
    await provider.waitForPersistence();

    expect(mocks.insertUpdate.mock.calls.map((call) => call[4])).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("emits provider watch failures", async () => {
    const failure = new Error("watch failed");
    mocks.watchUpdates.mockImplementationOnce(() => ({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        throw failure;
      },
    }));
    const { provider } = createProvider();

    await expect(
      new Promise<Error>((resolve) => provider.on("error", resolve))
    ).resolves.toBe(failure);
  });

  it("keeps persistence errors sticky and rejects waiters", async () => {
    const failedWrite = deferred<string>();
    mocks.insertUpdate.mockReturnValueOnce(failedWrite.promise);
    const { doc, provider } = createProvider();

    doc.getText("content").insert(0, "a");
    const persisted = provider.waitForPersistence();
    const error = new Error("write failed");
    failedWrite.reject(error);

    await expect(persisted).rejects.toBe(error);
    expect(provider.getPersistenceState()).toBe("error");
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        error,
        msg: "Failed to persist document update",
      })
    );

    mocks.insertUpdate.mockResolvedValueOnce("update-b");
    doc.getText("content").insert(1, "b");
    await Promise.resolve();

    expect(provider.getPersistenceState()).toBe("error");
    await expect(provider.waitForPersistence()).rejects.toBe(error);
  });
});
