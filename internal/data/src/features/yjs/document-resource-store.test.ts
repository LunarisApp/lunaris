import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@powersync/react", () => ({
  useQuery: vi.fn(() => ({ data: [] })),
}));

const evlogState = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: evlogState,
    parseError: (error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }),
  };
});

const dbState = vi.hoisted(() => ({
  current: {} as unknown,
}));

vi.mock("@repo/data/core", () => ({
  usePowerSync: vi.fn(() => dbState.current),
}));

// Track every YjsPowersyncProvider construction; expose a way to emit
// "synced" on demand so the concurrency test can gate task completion.
const providerInstances: Array<{
  documentId: string;
  emitSynced: () => void;
  emitError: (error: Error) => void;
  getListenerCount: (event: string) => number;
  workspaceId: string;
  destroyed: boolean;
  userId?: string | null;
  setUserId: (userId?: string | null) => void;
  waitForPersistence: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("./provider", () => {
  class MockProvider {
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    private updateUserId: (userId?: string | null) => void = () => undefined;
    documentId: string;
    destroyed = false;
    waitForPersistence = vi.fn(() => Promise.resolve());

    constructor(
      _doc: unknown,
      _db: unknown,
      documentId: string,
      workspaceId: string,
      userId?: string | null
    ) {
      this.documentId = documentId;
      let currentUserId = userId;
      const setUserId = vi.fn((nextUserId?: string | null) => {
        currentUserId = nextUserId;
      });
      this.updateUserId = setUserId;
      const entry = {
        documentId,
        emitSynced: () => {
          for (const cb of this.listeners.get("synced") ?? []) {
            cb();
          }
        },
        emitError: (error: Error) => {
          for (const cb of this.listeners.get("error") ?? []) {
            cb(error);
          }
        },
        getListenerCount: (event: string) =>
          this.listeners.get(event)?.size ?? 0,
        workspaceId,
        get destroyed() {
          return self.destroyed;
        },
        get userId() {
          return currentUserId;
        },
        setUserId,
        waitForPersistence: this.waitForPersistence,
      };
      const self = this;
      providerInstances.push(entry as (typeof providerInstances)[number]);
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event)!.add(cb);
    }
    off(event: string, cb: (...args: unknown[]) => void) {
      this.listeners.get(event)?.delete(cb);
    }
    destroy() {
      this.destroyed = true;
    }
    setUserId(userId?: string | null) {
      this.updateUserId(userId);
    }
  }
  return { YjsPowersyncProvider: MockProvider };
});

// createYjsDocumentWithId is a no-op; yjsDocumentExists returns true by default.
const yjsDocumentExistsMock = vi.fn(async (_db: unknown, _id: string) => true);
const createYjsDocumentWithIdMock = vi.fn(
  async (_db: unknown, _id: string, _workspaceId: string) => {}
);

vi.mock("./services", () => ({
  yjsDocumentExists: (db: unknown, id: string) => yjsDocumentExistsMock(db, id),
  createYjsDocumentWithId: (db: unknown, id: string, workspaceId: string) =>
    createYjsDocumentWithIdMock(db, id, workspaceId),
  watchYjsDocumentUpdates: vi.fn(),
}));

const {
  _getPreloadStateForTests,
  _resetYDocCacheForTests,
  _setPreloadLimitsForTests,
  preloadYjsDocument,
  waitForYjsDocumentPersistence,
} = await import("./document-resource-store");
const { useReadyYjsDocument } = await import("./hooks");

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function flushMicrotasks(times = 5) {
  return new Promise<void>((resolve) => {
    let remaining = times;
    const tick = () => {
      if (remaining-- <= 0) {
        resolve();
      } else {
        queueMicrotask(tick);
      }
    };
    tick();
  });
}

describe("preloadYjsDocument", () => {
  const db = {} as Parameters<typeof preloadYjsDocument>[0]["db"];

  beforeEach(() => {
    _resetYDocCacheForTests();
    providerInstances.length = 0;
    yjsDocumentExistsMock.mockClear();
    createYjsDocumentWithIdMock.mockClear();
    evlogState.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetYDocCacheForTests();
  });

  it("dedupes concurrent preloads of the same document into one provider", async () => {
    const handles = Array.from({ length: 5 }, () =>
      preloadYjsDocument({
        db,
        documentId: "doc_a",
        workspaceId: "workspace_1",
      })
    );
    // Give tasks a chance to run acquireYDoc before we emit synced.
    await flushMicrotasks();
    expect(providerInstances).toHaveLength(1);
    providerInstances[0]!.emitSynced();
    await Promise.all(handles.map((h) => h.done));
    const state = _getPreloadStateForTests();
    expect(state.cacheSize).toBe(1);
    // 5 holds: 1 from enqueued task + 4 from fast-path calls that saw the
    // entry after the first task ran. (Exact split depends on scheduling;
    // total must equal 5.)
    expect(state.entries[0]!.preloadCount).toBe(5);
    expect(state.entries[0]!.refCount).toBe(0);
    expect(state.entries[0]!.synced).toBe(true);
    expect(providerInstances[0]!.getListenerCount("synced")).toBe(0);
    expect(providerInstances[0]!.getListenerCount("error")).toBe(0);
  });

  it("preload leaves entry synced so subsequent preloads resolve synchronously (mount handoff)", async () => {
    const first = preloadYjsDocument({
      db,
      documentId: "doc_b",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    providerInstances[0]!.emitSynced();
    await first.done;
    expect(providerInstances).toHaveLength(1);

    // Second preload hits the fast path — no new provider, resolves without
    // waiting for another synced event.
    const second = preloadYjsDocument({
      db,
      documentId: "doc_b",
      workspaceId: "workspace_1",
    });
    await second.done;
    expect(providerInstances).toHaveLength(1);
  });

  it("keeps a visible preload alive beyond the mount grace period", async () => {
    vi.useFakeTimers();
    const handle = preloadYjsDocument({
      db,
      documentId: "doc_visible",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    providerInstances[0]!.emitSynced();
    await handle.done;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(_getPreloadStateForTests().cacheSize).toBe(1);
    expect(providerInstances[0]!.destroyed).toBe(false);
    vi.useRealTimers();
  });

  it("destroys a released preload after the grace period", async () => {
    vi.useFakeTimers();
    const handle = preloadYjsDocument({
      db,
      documentId: "doc_release",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    providerInstances[0]!.emitSynced();
    await handle.done;
    handle.release();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(_getPreloadStateForTests().cacheSize).toBe(0);
    expect(providerInstances[0]!.destroyed).toBe(true);
    vi.useRealTimers();
  });

  it("clears a failed provider resource so the next preload retries", async () => {
    const first = preloadYjsDocument({
      db,
      documentId: "doc_retry",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    const failure = new Error("watch failed");
    providerInstances[0]!.emitError(failure);
    await expect(first.done).rejects.toBe(failure);
    expect(evlogState.error).toHaveBeenCalledOnce();
    expect(evlogState.error).toHaveBeenCalledWith({
      tag: "YjsDoc",
      msg: "resource load failed",
      documentId: "doc_retry",
      error: { message: "watch failed" },
    });
    expect(_getPreloadStateForTests().cacheSize).toBe(0);
    expect(providerInstances[0]!.getListenerCount("synced")).toBe(0);
    expect(providerInstances[0]!.getListenerCount("error")).toBe(0);

    const retry = preloadYjsDocument({
      db,
      documentId: "doc_retry",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    expect(providerInstances).toHaveLength(2);
    providerInstances[1]!.emitSynced();
    await expect(retry.done).resolves.toBeUndefined();
  });

  it("release() before resolve aborts a queued task (no provider created)", async () => {
    _setPreloadLimitsForTests({ concurrency: 1 });

    // Task A starts running immediately.
    const a = preloadYjsDocument({
      db,
      documentId: "doc_a",
      workspaceId: "workspace_1",
    });
    // Task B sits in the queue behind A.
    const b = preloadYjsDocument({
      db,
      documentId: "doc_b",
      workspaceId: "workspace_1",
    });

    await flushMicrotasks();
    expect(providerInstances).toHaveLength(1);
    expect(providerInstances[0]!.documentId).toBe("doc_a");

    // Release B before it ever runs.
    b.release();

    // Finish A so the queue drains.
    providerInstances[0]!.emitSynced();
    await a.done;
    await b.done;
    await flushMicrotasks();

    // B should never have constructed a provider.
    expect(providerInstances).toHaveLength(1);
    const state = _getPreloadStateForTests();
    expect(
      state.entries.find((e) => e.key.startsWith("doc_b"))
    ).toBeUndefined();
  });

  it("releases an in-flight slot when an unsynced preload expires", async () => {
    vi.useFakeTimers();
    _setPreloadLimitsForTests({ concurrency: 1 });

    const stalled = preloadYjsDocument({
      db,
      documentId: "doc_stalled",
      workspaceId: "workspace_1",
    });
    const queued = preloadYjsDocument({
      db,
      documentId: "doc_queued",
      workspaceId: "workspace_1",
    });

    await flushMicrotasks();
    expect(providerInstances).toHaveLength(1);
    expect(providerInstances[0]!.documentId).toBe("doc_stalled");

    stalled.release();
    await vi.advanceTimersByTimeAsync(30_000);
    await flushMicrotasks();

    expect(providerInstances[0]!.destroyed).toBe(true);
    expect(providerInstances[0]!.getListenerCount("synced")).toBe(0);
    expect(providerInstances[0]!.getListenerCount("error")).toBe(0);
    expect(providerInstances).toHaveLength(2);
    expect(providerInstances[1]!.documentId).toBe("doc_queued");
    expect(
      _getPreloadStateForTests().entries.some(
        (entry) => entry.key === "workspace_1::doc_stalled"
      )
    ).toBe(false);
    expect(_getPreloadStateForTests().inFlight).toBe(1);

    providerInstances[1]!.emitSynced();
    await queued.done;
    await flushMicrotasks();
    expect(_getPreloadStateForTests().inFlight).toBe(0);
  });

  it("LRU eviction drops preload holds once cap is exceeded", async () => {
    _setPreloadLimitsForTests({ lru: 3 });

    for (const id of ["doc_1", "doc_2", "doc_3", "doc_4", "doc_5"]) {
      const handle = preloadYjsDocument({
        db,
        documentId: id,
        workspaceId: "workspace_1",
      });
      await flushMicrotasks();
      const lastProvider = providerInstances.at(-1);
      expect(lastProvider?.documentId).toBe(id);
      lastProvider!.emitSynced();
      await handle.done;
    }

    const state = _getPreloadStateForTests();
    expect(state.lru).toEqual([
      "workspace_1::doc_3",
      "workspace_1::doc_4",
      "workspace_1::doc_5",
    ]);
    const byKey = new Map(state.entries.map((e) => [e.key, e]));
    // Evicted entries: preload hold dropped but grace timer keeps them alive
    // briefly, so they still appear in cache with preloadCount=0.
    expect(byKey.get("workspace_1::doc_1")?.preloadCount).toBe(0);
    expect(byKey.get("workspace_1::doc_2")?.preloadCount).toBe(0);
    expect(byKey.get("workspace_1::doc_3")?.preloadCount).toBe(1);
    expect(byKey.get("workspace_1::doc_4")?.preloadCount).toBe(1);
    expect(byKey.get("workspace_1::doc_5")?.preloadCount).toBe(1);
  });

  it("reserves capacity for intent while background documents are loading", async () => {
    for (let i = 0; i < 4; i++) {
      preloadYjsDocument({
        db,
        documentId: `background_${i}`,
        workspaceId: "workspace_1",
      });
    }
    await flushMicrotasks();
    expect(providerInstances).toHaveLength(3);

    preloadYjsDocument({
      db,
      documentId: "foreground",
      workspaceId: "workspace_1",
      priority: "intent",
    });
    await flushMicrotasks();
    expect(providerInstances.map((provider) => provider.documentId)).toEqual([
      "background_0",
      "background_1",
      "background_2",
      "foreground",
    ]);
  });

  it("eviction cancels unused queued background work", async () => {
    _setPreloadLimitsForTests({ concurrency: 1, lru: 1 });
    preloadYjsDocument({
      db,
      documentId: "running",
      workspaceId: "workspace_1",
    });
    preloadYjsDocument({
      db,
      documentId: "evicted",
      workspaceId: "workspace_1",
    });
    preloadYjsDocument({
      db,
      documentId: "retained",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    providerInstances[0]!.emitSynced();
    await flushMicrotasks();
    expect(providerInstances.map((provider) => provider.documentId)).toEqual([
      "running",
      "retained",
    ]);
  });

  it("reacquires a destroyed preload on renewed intent", async () => {
    vi.useFakeTimers();
    _setPreloadLimitsForTests({ lru: 1 });
    const original = preloadYjsDocument({
      db,
      documentId: "first",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    providerInstances[0]!.emitSynced();
    await original.done;
    const other = preloadYjsDocument({
      db,
      documentId: "other",
      workspaceId: "workspace_1",
    });
    await flushMicrotasks();
    providerInstances[1]!.emitSynced();
    await other.done;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(providerInstances[0]!.destroyed).toBe(true);
    const renewed = preloadYjsDocument({
      db,
      documentId: "first",
      workspaceId: "workspace_1",
      priority: "intent",
    });
    await flushMicrotasks();
    expect(providerInstances).toHaveLength(3);
    providerInstances[2]!.emitSynced();
    await renewed.done;
    original.release();
    expect(
      _getPreloadStateForTests().entries.find(
        (entry) => entry.key === "workspace_1::first"
      )?.preloadCount
    ).toBe(1);
  });

  it("concurrency cap limits simultaneous in-flight providers", async () => {
    _setPreloadLimitsForTests({ concurrency: 4 });

    const handles = Array.from({ length: 10 }, (_, i) =>
      preloadYjsDocument({
        db,
        documentId: `doc_${i}`,
        priority: "intent",
        workspaceId: "workspace_1",
      })
    );

    await flushMicrotasks();
    // Cap limits simultaneous provider constructions to 4.
    expect(providerInstances).toHaveLength(4);

    // Complete first two → next two slots fill from queue → 6 providers.
    providerInstances[0]!.emitSynced();
    providerInstances[1]!.emitSynced();
    await handles[0]!.done;
    await handles[1]!.done;
    await flushMicrotasks();
    expect(providerInstances).toHaveLength(6);

    // Drain remaining sequentially; each emit unblocks one slot so the next
    // queued task can construct its provider.
    for (let i = 2; i < 10; i++) {
      providerInstances[i]!.emitSynced();
      await flushMicrotasks();
    }
    await Promise.all(handles.map((handle) => handle.done));
    expect(providerInstances).toHaveLength(10);
  });
});

describe("waitForYjsDocumentPersistence", () => {
  beforeEach(() => {
    dbState.current = {};
    _resetYDocCacheForTests();
    providerInstances.length = 0;
  });

  afterEach(() => {
    _resetYDocCacheForTests();
  });

  async function mountActiveDocument(documentId = "doc_active") {
    const hook = renderHook(() =>
      useReadyYjsDocument(documentId, "workspace_1")
    );
    await waitFor(() => expect(providerInstances).toHaveLength(1));
    act(() => providerInstances[0]!.emitSynced());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return hook;
  }

  it("reports loading immediately when a storage lookup first supplies a document ID", () => {
    const observed: ReturnType<typeof useReadyYjsDocument>[] = [];
    const { rerender } = renderHook(
      ({ id }) => {
        const value = useReadyYjsDocument(id, "workspace_1", {
          enabled: Boolean(id),
        });
        observed.push(value);
        return value;
      },
      { initialProps: { id: undefined as string | undefined } }
    );
    observed.length = 0;
    rerender({ id: "resolved" });
    expect(observed.length).toBeGreaterThan(0);
    expect(
      observed.every((value) => value.isLoading && value.yDoc === null)
    ).toBe(true);
  });

  it("never exposes the previous Y.Doc while switching document identity", async () => {
    const observed: ReturnType<typeof useReadyYjsDocument>[] = [];
    const { rerender, result } = renderHook(
      ({ id }) => {
        const value = useReadyYjsDocument(id, "workspace_1");
        observed.push(value);
        return value;
      },
      { initialProps: { id: "first" } }
    );
    await waitFor(() => expect(providerInstances).toHaveLength(1));
    act(() => providerInstances[0]!.emitSynced());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.yDoc;
    expect(first).not.toBeNull();
    observed.length = 0;
    rerender({ id: "second" });
    expect(observed.every((value) => value.yDoc !== first)).toBe(true);
  });

  it("waits for pending writes on the active document", async () => {
    await mountActiveDocument();
    const pending = deferred<void>();
    providerInstances[0]!.waitForPersistence.mockReturnValueOnce(
      pending.promise
    );
    let settled = false;

    const barrier = waitForYjsDocumentPersistence({
      db: dbState.current as never,
      documentId: "doc_active",
    }).then(() => {
      settled = true;
    });
    await flushMicrotasks();

    expect(settled).toBe(false);
    pending.resolve();
    await barrier;
    expect(settled).toBe(true);
  });

  it("propagates active persistence failures", async () => {
    await mountActiveDocument();
    const error = new Error("write failed");
    providerInstances[0]!.waitForPersistence.mockRejectedValueOnce(error);

    await expect(
      waitForYjsDocumentPersistence({
        db: dbState.current as never,
        documentId: "doc_active",
      })
    ).rejects.toBe(error);
  });

  it("ignores different databases and documents", async () => {
    await mountActiveDocument();

    await expect(
      waitForYjsDocumentPersistence({
        db: {} as never,
        documentId: "doc_active",
      })
    ).resolves.toBeUndefined();
    await expect(
      waitForYjsDocumentPersistence({
        db: dbState.current as never,
        documentId: "doc_other",
      })
    ).resolves.toBeUndefined();
    expect(providerInstances[0]!.waitForPersistence).not.toHaveBeenCalled();
  });

  it("ignores inactive cached documents and resolves without a provider", async () => {
    const hook = await mountActiveDocument();
    hook.unmount();

    await expect(
      waitForYjsDocumentPersistence({
        db: dbState.current as never,
        documentId: "doc_active",
      })
    ).resolves.toBeUndefined();
    await expect(
      waitForYjsDocumentPersistence({
        db: dbState.current as never,
        documentId: "doc_missing",
      })
    ).resolves.toBeUndefined();
    expect(providerInstances[0]!.waitForPersistence).not.toHaveBeenCalled();
  });
});
