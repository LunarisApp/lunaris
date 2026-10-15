import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@powersync/react", () => ({
  useQuery: vi.fn(() => ({ data: [] })),
}));

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
          for (const cb of this.listeners.get("synced") ?? []) cb();
        },
        emitError: (error: Error) => {
          for (const cb of this.listeners.get("error") ?? []) cb(error);
        },
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
      // biome-ignore lint/complexity/noUselessThisAlias: shared closure getter
      const self = this;
      providerInstances.push(entry as (typeof providerInstances)[number]);
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(cb);
    }
    off(event: string, cb: (...args: unknown[]) => void) {
      this.listeners.get(event)?.delete(cb);
    }
    destroy() {
      this.destroyed = true;
      this.listeners.clear();
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
  yjsDocumentExists: (db: unknown, id: string) =>
    yjsDocumentExistsMock(db, id),
  createYjsDocumentWithId: (db: unknown, id: string, workspaceId: string) =>
    createYjsDocumentWithIdMock(db, id, workspaceId),
  watchYjsDocumentUpdates: vi.fn(),
}));

const {
  _resetYDocCacheForTests,
  getYjsDocumentsQuery,
  preloadYjsDocument,
  useReadyYjsDocument,
} = await import("./hooks");

function flushMicrotasks(times = 5) {
  return new Promise<void>((resolve) => {
    let remaining = times;
    const tick = () => {
      if (remaining-- <= 0) resolve();
      else queueMicrotask(tick);
    };
    tick();
  });
}

describe("yjs query helpers", () => {
  it("builds workspace yjs documents query with stable ordering", () => {
    expect(getYjsDocumentsQuery("workspace_1")).toEqual({
      query: `
      SELECT
        documents.*,
        COUNT(updates.id) as update_count
      FROM (SELECT * FROM yjs_documents UNION ALL SELECT * FROM local_yjs_documents) documents
      LEFT JOIN (SELECT * FROM yjs_document_updates UNION ALL SELECT * FROM local_yjs_document_updates) updates ON updates.document_id = documents.id
      WHERE documents.workspace_id = ?
      GROUP BY documents.id, documents.workspace_id, documents.created_at, documents.updated_at
      ORDER BY documents.created_at ASC, id ASC
    `,
      params: ["workspace_1"],
    });
  });
});

describe("useReadyYjsDocument", () => {
  beforeEach(() => {
    dbState.current = {};
    _resetYDocCacheForTests();
    providerInstances.length = 0;
    yjsDocumentExistsMock.mockClear();
    createYjsDocumentWithIdMock.mockClear();
  });

  afterEach(() => {
    _resetYDocCacheForTests();
  });

  it("starts cold with no doc, then returns doc after provider syncs", async () => {
    const { result } = renderHook(() =>
      useReadyYjsDocument("doc_cold", "workspace_1")
    );

    expect(result.current).toMatchObject({
      error: null,
      isLoading: true,
      yDoc: null,
      yProvider: null,
    });

    await waitFor(() => expect(providerInstances).toHaveLength(1));
    expect(result.current.yDoc).toBeNull();
    expect(result.current.isLoading).toBe(true);

    act(() => {
      providerInstances[0]!.emitSynced();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.yDoc).toBeTruthy();
    expect(result.current.yProvider).toBeTruthy();
  });

  it("returns synced cached doc on warm remount without a null loading frame", async () => {
    const first = renderHook(() => useReadyYjsDocument("doc_warm", "workspace_1"));
    await waitFor(() => expect(providerInstances).toHaveLength(1));

    act(() => {
      providerInstances[0]!.emitSynced();
    });

    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    const cachedDoc = first.result.current.yDoc;
    const cachedProvider = first.result.current.yProvider;
    first.unmount();

    const second = renderHook(() => useReadyYjsDocument("doc_warm", "workspace_1"));

    expect(second.result.current).toMatchObject({
      error: null,
      isLoading: false,
      yDoc: cachedDoc,
      yProvider: cachedProvider,
    });
    expect(providerInstances).toHaveLength(1);
  });

  it("shares preload, editor, status bar, and StrictMode work", async () => {
    const preload = preloadYjsDocument({
      db: dbState.current as never,
      documentId: "doc_shared",
      workspaceId: "workspace_1",
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const consumers = renderHook(
      () => [
        useReadyYjsDocument("doc_shared", "workspace_1", { userId: "user_1" }),
        useReadyYjsDocument("doc_shared", "workspace_1", { userId: "user_1" }),
      ],
      { wrapper }
    );

    await waitFor(() => expect(providerInstances).toHaveLength(1));
    expect(yjsDocumentExistsMock).toHaveBeenCalledTimes(1);
    act(() => providerInstances[0]!.emitSynced());
    await preload.done;
    await waitFor(() =>
      expect(consumers.result.current.every((result) => !result.isLoading)).toBe(
        true
      )
    );
    expect(providerInstances[0]!.userId).toBe("user_1");
  });

  it("tolerates a create race with one shared existence pipeline", async () => {
    yjsDocumentExistsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    createYjsDocumentWithIdMock.mockRejectedValueOnce(
      new Error("already created")
    );
    const hook = renderHook(() =>
      useReadyYjsDocument("doc_race", "workspace_1")
    );

    await waitFor(() => expect(providerInstances).toHaveLength(1));
    act(() => providerInstances[0]!.emitSynced());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(yjsDocumentExistsMock).toHaveBeenCalledTimes(2);
    expect(createYjsDocumentWithIdMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse warm cache for a different workspace", async () => {
    const first = renderHook(() => useReadyYjsDocument("doc_workspace", "workspace_1"));
    await waitFor(() => expect(providerInstances).toHaveLength(1));
    act(() => {
      providerInstances[0]!.emitSynced();
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useReadyYjsDocument("doc_workspace", "workspace_2"));

    expect(second.result.current.yDoc).toBeNull();
    expect(second.result.current.isLoading).toBe(true);
    await waitFor(() => expect(providerInstances).toHaveLength(2));
    expect(providerInstances[1]!.workspaceId).toBe("workspace_2");
  });

  it("does not reuse warm cache for a different db", async () => {
    const firstDb = dbState.current;
    const first = renderHook(() => useReadyYjsDocument("doc_db", "workspace_1"));
    await waitFor(() => expect(providerInstances).toHaveLength(1));
    act(() => {
      providerInstances[0]!.emitSynced();
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    dbState.current = {};
    expect(dbState.current).not.toBe(firstDb);
    const second = renderHook(() => useReadyYjsDocument("doc_db", "workspace_1"));

    expect(second.result.current.yDoc).toBeNull();
    expect(second.result.current.isLoading).toBe(true);
    await waitFor(() => expect(providerInstances).toHaveLength(2));
  });

  it("reuses warm content and updates attribution for a different user", async () => {
    const first = renderHook(() =>
      useReadyYjsDocument("doc_user", "workspace_1", { userId: "user_1" })
    );
    await waitFor(() => expect(providerInstances).toHaveLength(1));
    act(() => {
      providerInstances[0]!.emitSynced();
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() =>
      useReadyYjsDocument("doc_user", "workspace_1", { userId: "user_2" })
    );

    expect(second.result.current.yDoc).toBe(first.result.current.yDoc);
    expect(second.result.current.isLoading).toBe(false);
    expect(providerInstances).toHaveLength(1);
    expect(providerInstances[0]!.userId).toBe("user_2");
  });

  it("returns not loading without a doc when disabled or missing documentId", () => {
    const disabled = renderHook(() =>
      useReadyYjsDocument("doc_disabled", "workspace_1", { enabled: false })
    );
    expect(disabled.result.current).toMatchObject({
      error: null,
      isLoading: false,
      yDoc: null,
      yProvider: null,
    });
    disabled.unmount();

    const missing = renderHook(() =>
      useReadyYjsDocument(undefined, "workspace_1")
    );
    expect(missing.result.current).toMatchObject({
      error: null,
      isLoading: false,
      yDoc: null,
      yProvider: null,
    });
    expect(providerInstances).toHaveLength(0);
  });
});
