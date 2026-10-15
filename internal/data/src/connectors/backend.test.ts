import type { AbstractPowerSyncDatabase, CrudBatch } from "@powersync/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncBlocker } from "../core/sync-blocker";
import BackendConnector from "./backend";

const BACKEND_URL = "http://localhost:3000";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeCrudEntry(
  id: string,
  op: string,
  table: string,
  transactionId: number | undefined,
  opData?: Record<string, unknown>
) {
  return { id, op, table, transactionId, opData };
}

function makeBatch(
  crud: ReturnType<typeof makeCrudEntry>[]
): CrudBatch & { complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn().mockResolvedValue(undefined);
  return { crud, haveMore: false, complete } as CrudBatch & {
    complete: ReturnType<typeof vi.fn>;
  };
}

function makeDatabase(batches: (CrudBatch | null)[]) {
  let callIndex = 0;
  return {
    getCrudBatch: vi.fn().mockImplementation(() => {
      return Promise.resolve(batches[callIndex++] ?? null);
    }),
  } as unknown as AbstractPowerSyncDatabase;
}

function mockFetchOk() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input) => {
      const url = input.toString();
      return Promise.resolve(new Response(null, { status: 200 }));
    });
}

function uploadCalls(fetchSpy: ReturnType<typeof mockFetchOk>) {
  return fetchSpy.mock.calls;
}

describe("BackendConnector.uploadData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when getCrudBatch returns null", async () => {
    const fetchSpy = mockFetchOk();
    const db = makeDatabase([null]);
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker: createSyncBlocker(),
    });

    await connector.uploadData(db);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends single transaction when all entries share txId", async () => {
    const batch = makeBatch([
      makeCrudEntry("1", "PUT", "documents", 1, { title: "A" }),
      makeCrudEntry("2", "PUT", "documents", 1, { title: "B" }),
      makeCrudEntry("3", "PATCH", "documents", 1, { title: "C" }),
    ]);
    const fetchSpy = mockFetchOk();
    const db = makeDatabase([batch, null]);
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker: createSyncBlocker(),
    });

    await connector.uploadData(db);

    expect(uploadCalls(fetchSpy)).toHaveLength(1);
    const body = JSON.parse(uploadCalls(fetchSpy)[0]![1]!.body as string);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].transactionId).toBe(1);
    expect(body.transactions[0].crud).toHaveLength(3);
    expect(batch.complete).toHaveBeenCalledOnce();
  });

  it("groups entries by transactionId including undefined", async () => {
    const batch = makeBatch([
      makeCrudEntry("1", "PUT", "documents", 1),
      makeCrudEntry("2", "PUT", "folders", 2),
      makeCrudEntry("3", "DELETE", "documents", 1),
      makeCrudEntry("4", "PUT", "tags", undefined),
    ]);
    const fetchSpy = mockFetchOk();
    const db = makeDatabase([batch, null]);
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker: createSyncBlocker(),
    });

    await connector.uploadData(db);

    const body = JSON.parse(uploadCalls(fetchSpy)[0]![1]!.body as string);
    expect(body.transactions).toHaveLength(3);

    const tx1 = body.transactions.find(
      (t: { transactionId: number }) => t.transactionId === 1
    );
    expect(tx1.crud).toHaveLength(2);

    const tx2 = body.transactions.find(
      (t: { transactionId: number }) => t.transactionId === 2
    );
    expect(tx2.crud).toHaveLength(1);

    const txUndef = body.transactions.find(
      (t: { transactionId: number | undefined }) =>
        t.transactionId === undefined
    );
    expect(txUndef.crud).toHaveLength(1);
  });

  it("processes multiple batches sequentially", async () => {
    const batch1 = makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]);
    const batch2 = makeBatch([makeCrudEntry("2", "PUT", "documents", 2)]);
    const fetchSpy = mockFetchOk();
    const db = makeDatabase([batch1, batch2, null]);
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker: createSyncBlocker(),
    });

    await connector.uploadData(db);

    expect(uploadCalls(fetchSpy)).toHaveLength(2);
    expect(batch1.complete).toHaveBeenCalledOnce();
    expect(batch2.complete).toHaveBeenCalledOnce();
  });

  it("throws on 5xx and does not call complete", async () => {
    const batch = makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]);
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input.toString();
      return Promise.resolve(new Response(null, { status: 500 }));
    });
    const db = makeDatabase([batch, null]);
    const syncBlocker = createSyncBlocker();
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker,
    });

    syncBlocker.recordClientError(409);

    await expect(connector.uploadData(db)).rejects.toThrow(
      "Sync upload failed"
    );
    expect(batch.complete).not.toHaveBeenCalled();
    expect(syncBlocker.getSnapshot()).toEqual({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    });
  });

  it("throws on 4xx and does not call complete", async () => {
    const batch = makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]);
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input.toString();
      return Promise.resolve(new Response(null, { status: 409 }));
    });
    const db = makeDatabase([batch, null]);
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker: createSyncBlocker(),
    });

    await expect(connector.uploadData(db)).rejects.toThrow(
      "Sync upload rejected"
    );
    expect(batch.complete).not.toHaveBeenCalled();
  });

  it("blocks after three consecutive 4xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input.toString();
      return Promise.resolve(new Response(null, { status: 409 }));
    });
    const syncBlocker = createSyncBlocker();
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker,
    });

    await expect(
      connector.uploadData(makeDatabase([makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]), null]))
    ).rejects.toThrow("Sync upload rejected");
    await expect(
      connector.uploadData(makeDatabase([makeBatch([makeCrudEntry("2", "PUT", "documents", 2)]), null]))
    ).rejects.toThrow("Sync upload rejected");
    await expect(
      connector.uploadData(makeDatabase([makeBatch([makeCrudEntry("3", "PUT", "documents", 3)]), null]))
    ).rejects.toThrow("Sync upload rejected");

    expect(syncBlocker.getSnapshot()).toEqual({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 409,
    });
  });

  it("resets the 4xx streak after a successful upload", async () => {
    const syncBlocker = createSyncBlocker();
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input.toString();
      return Promise.resolve(new Response(null, { status: 409 }));
    });
    await expect(
      connector.uploadData(makeDatabase([makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]), null]))
    ).rejects.toThrow("Sync upload rejected");

    vi.restoreAllMocks();
    mockFetchOk();
    await connector.uploadData(
      makeDatabase([makeBatch([makeCrudEntry("2", "PUT", "documents", 2)]), null])
    );

    expect(syncBlocker.getSnapshot()).toEqual({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    });
  });

  it("skips upload work while already blocked", async () => {
    const fetchSpy = mockFetchOk();
    const db = makeDatabase([
      makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]),
      null,
    ]);
    const syncBlocker = createSyncBlocker();
    syncBlocker.recordClientError(409);
    syncBlocker.recordClientError(409);
    syncBlocker.recordClientError(409);
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker,
    });

    await connector.uploadData(db);

    expect(db.getCrudBatch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends session credentials without a CSRF token round trip", async () => {
    const batch = makeBatch([makeCrudEntry("1", "PUT", "documents", 1)]);
    const fetchSpy = mockFetchOk();
    const connector = new BackendConnector({
      backendUrl: BACKEND_URL,
      syncBlocker: createSyncBlocker(),
    });

    await connector.uploadData(makeDatabase([batch, null]));

    expect(
      new Headers(uploadCalls(fetchSpy)[0]?.[1]?.headers).get("x-csrf-token"),
    ).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(uploadCalls(fetchSpy)[0]?.[1]?.credentials).toBe("include");
  });
});
