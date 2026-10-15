import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repairFileAttachmentPointers } from "../files";
import {
  createAttachmentQueue,
  createAttachmentObjectUrl,
  createAttachmentErrorHandler,
  deleteFileStorageDatabases,
  downloadAttachmentFromQuery,
  downloadAttachmentFile,
  getAttachmentQueue,
  getFileStorageDatabaseName,
  getFileStorageWorkspaceIds,
  parseAttachmentMetadata,
  startAttachmentQueue,
  stopAttachmentQueue,
  useAttachmentObjectUrl,
  useAttachmentQueryState,
} from "./services";

const {
  attachmentQueueMock,
  fileExistsMock,
  initializeMock,
  queueInstances,
  readFileMock,
  usePowerSyncMock,
} = vi.hoisted(() => {
  const queueInstances: Array<{
    options: unknown;
    startSync: ReturnType<typeof vi.fn>;
    stopSync: ReturnType<typeof vi.fn>;
  }> = [];
  class AttachmentQueueMock {
    options: unknown;
    startSync = vi.fn().mockResolvedValue(undefined);
    stopSync = vi.fn().mockResolvedValue(undefined);

    constructor(options: unknown) {
      this.options = options;
      queueInstances.push(this);
    }
  }
  return {
    attachmentQueueMock: AttachmentQueueMock,
    fileExistsMock: vi.fn(),
    initializeMock: vi.fn().mockResolvedValue(undefined),
    queueInstances,
    readFileMock: vi.fn(),
    usePowerSyncMock: vi.fn(),
  };
});

vi.mock("./chunked-attachment-queue", () => ({ ChunkedAttachmentQueue: attachmentQueueMock }));

vi.mock("../../core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core")>()),
  usePowerSync: usePowerSyncMock,
}));

vi.mock("../../storage/indexeddb-file-storage", () => ({
  IndexedDbFileStorageAdapter: class {
      initialize() {
        return initializeMock();
      }
      readBlob(localUri: string) {
        return readFileMock(localUri);
      }
      readFile(localUri: string) {
        return readFileMock(localUri);
      }
      getLocalUri(filename: string) {
        return `indexeddb://lunaris-files-workspace_1/files/${filename}`;
      }
      fileExists(localUri: string) {
        return fileExistsMock(localUri);
      }
    },
}));

interface FakeIdbRequest {
  error: DOMException | null;
  onblocked: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onsuccess: ((event: Event) => void) | null;
}

interface FakeIdbOpenRequest extends FakeIdbRequest {
  onupgradeneeded: ((event: Event) => void) | null;
  result: {
    close: ReturnType<typeof vi.fn>;
    createObjectStore: ReturnType<typeof vi.fn>;
    objectStoreNames: { contains: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
  };
}

function createSuccessfulFileStorageOpen() {
  const tx = {
    error: null as DOMException | null,
    oncomplete: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    objectStore: vi.fn(() => ({
      clear: vi.fn(() => {
        queueMicrotask(() => tx.oncomplete?.(new Event("complete")));
      }),
    })),
  };
  const request: FakeIdbOpenRequest = {
    error: null,
    onblocked: null,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: {
      close: vi.fn(),
      createObjectStore: vi.fn(),
      objectStoreNames: Object.assign(["files"], { contains: vi.fn(() => true) }),
      transaction: vi.fn(() => tx),
    },
  };
  queueMicrotask(() => request.onsuccess?.(new Event("success")));
  return request;
}

describe("attachment storage helpers", () => {
  beforeEach(() => {
    queueInstances.length = 0;
    initializeMock.mockReset().mockResolvedValue(undefined);
    usePowerSyncMock.mockReset();
  });

  afterEach(() => {
    fileExistsMock.mockReset();
    readFileMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("scopes local file storage by workspace id", () => {
    expect(getFileStorageDatabaseName("workspace_1")).toBe("lunaris-files-workspace_1");
  });

  it("parses valid metadata and rejects malformed values", () => {
    expect(parseAttachmentMetadata<{ filename: string }>('{' + '"filename":"note.txt"}')).toEqual({
      filename: "note.txt",
    });
    expect(parseAttachmentMetadata("not-json")).toBeNull();
    expect(parseAttachmentMetadata(null)).toBeNull();
  });

  it("collects workspace ids for file storage cleanup", async () => {
    let capturedQuery = "";
    const db = {
      getAll: (query: string) => {
        capturedQuery = query;
        return Promise.resolve([{ id: "workspace_1" }, { id: "workspace_2" }]);
      },
    };

    await expect(getFileStorageWorkspaceIds(db as never)).resolves.toEqual([
      "workspace_1",
      "workspace_2",
    ]);
    expect(capturedQuery).toContain("FROM workspaces");
    expect(capturedQuery).toContain("FROM local_workspaces");
  });

  it("repairs synced file attachment pointers when bytes exist locally", async () => {
    vi.stubGlobal("indexedDB", {});
    fileExistsMock.mockResolvedValue(true);
    const execute = vi.fn(() => Promise.resolve());
    const db = {
      execute,
      getAll: () =>
        Promise.resolve([
          {
            has_synced: 1,
            local_uri: null,
            state: 3,
            value: JSON.stringify({
              attachmentId: "att_1",
              fileExtension: "png",
              filename: "image.png",
              mediaType: "image/png",
            }),
          },
        ]),
    };

    await repairFileAttachmentPointers({
      db: db as never,
      workspaceId: "workspace_1",
    });

    expect(fileExistsMock).toHaveBeenCalledWith(
      "indexeddb://lunaris-files-workspace_1/files/att_1.png"
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("SET local_uri = ?, state = ?"),
      ["indexeddb://lunaris-files-workspace_1/files/att_1.png", 3, "att_1"]
    );
  });

  it("queues synced file attachments for download when local bytes are gone", async () => {
    vi.stubGlobal("indexedDB", {});
    fileExistsMock.mockResolvedValue(false);
    const execute = vi.fn(() => Promise.resolve());
    const db = {
      execute,
      getAll: () =>
        Promise.resolve([
          {
            has_synced: 1,
            local_uri: null,
            state: 3,
            value: JSON.stringify({
              attachmentId: "att_1",
              fileExtension: "png",
              filename: "image.png",
              mediaType: "image/png",
            }),
          },
        ]),
    };

    await repairFileAttachmentPointers({
      db: db as never,
      workspaceId: "workspace_1",
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("SET local_uri = NULL, state = ?"),
      [1, "att_1"]
    );
  });

  it("deletes legacy orphan downloads with no remaining workspace reference", async () => {
    vi.stubGlobal("indexedDB", {});
    const execute = vi.fn(() => Promise.resolve());
    const db = {
      execute,
      getAll: () => Promise.resolve([]),
    };

    await repairFileAttachmentPointers({
      db: db as never,
      workspaceId: "workspace_1",
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM attachments"),
      [1]
    );
  });

  it("queues orphan attachment rows for deletion before queue startup", async () => {
    vi.stubGlobal("indexedDB", {});
    const execute = vi.fn(() => Promise.resolve());
    const db = {
      execute,
      getAll: () =>
        Promise.resolve([
          {
            attachment_id: "5759e303-1bbd-4fe6-bc78-659730c71798",
            has_live_item: 0,
            has_synced: 1,
            local_uri: null,
            state: 1,
            value: null,
          },
        ]),
    };

    await repairFileAttachmentPointers({
      db: db as never,
      workspaceId: "workspace_1",
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("SET state = ?, has_synced = 0"),
      [2, "5759e303-1bbd-4fe6-bc78-659730c71798"]
    );
    expect(fileExistsMock).not.toHaveBeenCalled();
  });

  it("does not repair unrelated or already linked file attachments", async () => {
    vi.stubGlobal("indexedDB", {});
    fileExistsMock.mockResolvedValue(true);
    const execute = vi.fn((_query: string, _params: unknown[]) =>
      Promise.resolve()
    );
    const db = {
      execute,
      getAll: () =>
        Promise.resolve([
          {
            has_synced: 1,
            local_uri: "indexeddb://existing",
            state: 3,
            value: JSON.stringify({
              attachmentId: "att_1",
              fileExtension: "png",
              filename: "image.png",
              mediaType: "image/png",
            }),
          },
          {
            has_synced: 1,
            local_uri: null,
            state: 3,
            value: JSON.stringify({
              attachmentId: "att_2",
              filename: "legacy",
              mediaType: "image/png",
            }),
          },
        ]),
    };

    await repairFileAttachmentPointers({
      db: db as never,
      workspaceId: "workspace_1",
    });

    expect(fileExistsMock).not.toHaveBeenCalled();
    expect(
      execute.mock.calls.some(([query]) => String(query).includes("UPDATE"))
    ).toBe(false);
  });

  it("deletes local file storage IndexedDB databases", async () => {
    const deleteDatabase = vi.fn(() => {
      const request: FakeIdbRequest = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
      };
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request;
    });
    vi.stubGlobal("indexedDB", {
      deleteDatabase,
      open: vi.fn(() => createSuccessfulFileStorageOpen()),
    });

    await deleteFileStorageDatabases(["workspace_1", "workspace_2", "workspace_1"]);

    expect(deleteDatabase).toHaveBeenCalledTimes(2);
    expect(deleteDatabase).toHaveBeenCalledWith("lunaris-files-workspace_1");
    expect(deleteDatabase).toHaveBeenCalledWith("lunaris-files-workspace_2");
  });

  it("does not throw when file storage deletion is blocked or errors", async () => {
    const requests: FakeIdbRequest[] = [];
    const deleteDatabase = vi.fn(() => {
      const requestIndex = requests.length;
      const request: FakeIdbRequest = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
      };
      requests.push(request);
      queueMicrotask(() => {
        if (requestIndex === 0) {
          request.onblocked?.(new Event("blocked"));
          return;
        }
        request.error = new Error("boom") as unknown as DOMException;
        request.onerror?.(new Event("error"));
      });
      return request;
    });
    vi.stubGlobal("indexedDB", {
      deleteDatabase,
      open: vi.fn(() => createSuccessfulFileStorageOpen()),
    });

    await expect(
      deleteFileStorageDatabases(["workspace_blocked", "workspace_error"])
    ).resolves.toBeUndefined();
  });

  it("handles missing IndexedDB and empty cleanup lists", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(deleteFileStorageDatabases(["workspace_1"])).resolves.toBeUndefined();

    const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", { deleteDatabase });
    await expect(deleteFileStorageDatabases([])).resolves.toBeUndefined();
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it("contains synchronous IndexedDB open and delete failures", async () => {
    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        throw new Error("open failed");
      }),
      deleteDatabase: vi.fn(() => {
        throw new Error("delete failed");
      }),
    });

    await expect(deleteFileStorageDatabases(["workspace_1"])).resolves.toBeUndefined();
  });

  it("creates the file store during upgrade and contains open failures", async () => {
    const upgradeRequest = createSuccessfulFileStorageOpen();
    upgradeRequest.result.objectStoreNames.contains.mockReturnValue(false);
    queueMicrotask(() => upgradeRequest.onupgradeneeded?.(new Event("upgrade")));

    const failedRequest = createSuccessfulFileStorageOpen();
    failedRequest.error = new Error("open failed") as unknown as DOMException;
    const open = vi
      .fn()
      .mockReturnValueOnce(upgradeRequest)
      .mockImplementationOnce(() => {
        queueMicrotask(() => failedRequest.onerror?.(new Event("error")));
        return failedRequest;
      });
    const deleteDatabase = vi.fn(() => {
      const request: FakeIdbRequest = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
      };
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request;
    });
    vi.stubGlobal("indexedDB", { deleteDatabase, open });

    await deleteFileStorageDatabases(["workspace_upgrade", "workspace_failed"]);

    expect(upgradeRequest.result.createObjectStore).toHaveBeenCalledWith("files");
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
  });

  it("contains clear transaction errors and synchronous transaction failures", async () => {
    const transactionErrorRequest = createSuccessfulFileStorageOpen();
    const transactionError = {
      error: new Error("clear failed") as unknown as DOMException,
      oncomplete: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      objectStore: vi.fn(() => ({
        clear: vi.fn(() => {
          queueMicrotask(() => transactionError.onerror?.(new Event("error")));
        }),
      })),
    };
    transactionErrorRequest.result.transaction.mockReturnValue(transactionError);

    const transactionThrowRequest = createSuccessfulFileStorageOpen();
    transactionThrowRequest.result.transaction.mockImplementation(() => {
      throw new Error("transaction failed");
    });

    const open = vi
      .fn()
      .mockReturnValueOnce(transactionErrorRequest)
      .mockReturnValueOnce(transactionThrowRequest);
    const deleteDatabase = vi.fn(() => {
      const request: FakeIdbRequest = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
      };
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request;
    });
    vi.stubGlobal("indexedDB", { deleteDatabase, open });

    await expect(
      deleteFileStorageDatabases(["workspace_tx_error", "workspace_tx_throw"]),
    ).resolves.toBeUndefined();
    expect(transactionErrorRequest.result.close).toHaveBeenCalled();
    expect(transactionThrowRequest.result.close).toHaveBeenCalled();
  });

  it("creates, caches, starts, and stops workspace attachment queues", async () => {
    const db = {} as never;
    const api = {} as never;
    const watchAttachments = vi.fn() as never;

    const created = createAttachmentQueue({ api, db, workspaceId: "workspace_1", watchAttachments });
    expect(queueInstances).toHaveLength(1);
    expect(queueInstances[0]?.options).toMatchObject({ db, watchAttachments });

    const first = getAttachmentQueue({ api, db, workspaceId: "workspace_1", watchAttachments });
    const again = getAttachmentQueue({ api, db, workspaceId: "workspace_1", watchAttachments });
    const secondary = getAttachmentQueue({
      api,
      db,
      workspaceId: "workspace_1",
      queueId: "preview",
      watchAttachments,
    });
    expect(first).toBe(again);
    expect(secondary).not.toBe(first);
    expect(created).not.toBe(first);

    await expect(
      startAttachmentQueue({ api, db, workspaceId: "workspace_2", watchAttachments }),
    ).resolves.toBe(queueInstances.at(-1));
    expect(queueInstances.at(-1)?.startSync).toHaveBeenCalledOnce();

    await stopAttachmentQueue({ db, workspaceId: "workspace_2" });
    expect(queueInstances.at(-1)?.stopSync).toHaveBeenCalledOnce();
    await expect(stopAttachmentQueue({ db, workspaceId: "missing" })).resolves.toBeUndefined();
  });

  it("creates object URLs from local attachment bytes", async () => {
    const urlMock = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    readFileMock.mockResolvedValue(new ArrayBuffer(1));

    await expect(
      createAttachmentObjectUrl({
        localUri: "indexeddb://file",
        mediaType: "image/png",
        workspaceId: "workspace_1",
      })
    ).resolves.toBe("blob:file");
    expect(readFileMock).toHaveBeenCalledWith("indexeddb://file");
    expect(urlMock).toHaveBeenCalledTimes(1);
  });

  it("downloads local attachment bytes through a generated link", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    const revokeMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickMock = vi.fn();
    const appendMock = vi
      .spyOn(document.body, "append")
      .mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValue({
      click: clickMock,
      remove: vi.fn(),
      rel: "",
      download: "",
      href: "",
    } as unknown as HTMLAnchorElement);
    readFileMock.mockResolvedValue(new ArrayBuffer(1));

    await downloadAttachmentFile({
      filename: "image.png",
      localUri: "indexeddb://file",
      mediaType: "image/png",
      workspaceId: "workspace_1",
    });

    expect(appendMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeMock).toHaveBeenCalledWith("blob:file");
  });





  it("skips incomplete query downloads and downloads complete rows", async () => {
    const missingDb = { getOptional: vi.fn().mockResolvedValue({ value: null }) };
    await expect(
      downloadAttachmentFromQuery({
        db: missingDb,
        workspaceId: "workspace_1",
        query: "SELECT 1",
        queryParams: [],
      }),
    ).resolves.toBe(false);

    readFileMock.mockResolvedValue(new ArrayBuffer(1));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const db = {
      getOptional: vi.fn().mockResolvedValue({
        local_uri: "indexeddb://file",
        value: JSON.stringify({ filename: "note.txt", mediaType: "text/plain" }),
      }),
    };

    await expect(
      downloadAttachmentFromQuery({
        db,
        workspaceId: "workspace_1",
        query: "SELECT attachment",
        queryParams: ["att_1"],
      }),
    ).resolves.toBe(true);
  });

  it("supports row-specific query metadata and requires local bytes", async () => {
    const metadataFromRow = vi.fn(() => ({
      attachmentId: "att_1",
      filename: "custom.txt",
      mediaType: "text/plain",
    }));
    const missingLocalDb = {
      getOptional: vi.fn().mockResolvedValue({ id: "att_1", local_uri: null }),
    };
    await expect(
      downloadAttachmentFromQuery({
        db: missingLocalDb,
        metadataFromRow,
        workspaceId: "workspace_1",
        query: "SELECT attachment",
        queryParams: ["att_1"],
      }),
    ).resolves.toBe(false);
    expect(metadataFromRow).toHaveBeenCalled();
  });

  it("streams attachment query state from PowerSync", async () => {
    const row = {
      id: "att_1",
      local_uri: "indexeddb://file",
      value: JSON.stringify({ filename: "note.txt" }),
    };
    const watch = vi.fn(async function* () {
      yield { rows: { _array: [row] } };
    });
    usePowerSyncMock.mockReturnValue({ watch });
    const queryParams = ["att_1"];

    const { result } = renderHook(() =>
      useAttachmentQueryState<{ filename: string }>({
        query: "SELECT attachment",
        queryParams,
      }),
    );

    await waitFor(() => expect(result.current.attachment).toEqual(row));
    expect(result.current.metadata).toEqual({ filename: "note.txt" });
    expect(watch).toHaveBeenCalledWith("SELECT attachment", queryParams);
  });

  it("uses custom metadata while streaming empty attachment rows", async () => {
    const metadataFromRow = vi.fn(() => ({ filename: "fallback.txt" }));
    const watch = vi.fn(async function* () {
      yield { rows: { _array: [{}] } };
    });
    usePowerSyncMock.mockReturnValue({ watch });

    const { result } = renderHook(() =>
      useAttachmentQueryState({
        metadataFromRow,
        query: "SELECT attachment",
        queryParams: [],
      }),
    );

    await waitFor(() => expect(result.current.metadata).toEqual({ filename: "fallback.txt" }));
    expect(result.current.attachment).toBeNull();
  });

  it("loads, replaces, clears, and revokes attachment preview URLs", async () => {
    readFileMock.mockResolvedValue(new ArrayBuffer(1));
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const first = {
      id: "att_1",
      local_uri: "indexeddb://first",
    } as never;
    const second = {
      id: "att_2",
      local_uri: "indexeddb://second",
    } as never;

    const { result, rerender, unmount } = renderHook(
      ({ attachment }) =>
        useAttachmentObjectUrl({
          attachment,
          mediaType: "image/png",
          workspaceId: "workspace_1",
        }),
      { initialProps: { attachment: first } },
    );
    await waitFor(() => expect(result.current).toBe("blob:first"));

    rerender({ attachment: first });
    expect(createUrl).toHaveBeenCalledOnce();

    rerender({ attachment: second });
    await waitFor(() => expect(result.current).toBe("blob:second"));
    expect(revokeUrl).toHaveBeenCalledWith("blob:first");

    rerender({ attachment: null as never });
    await waitFor(() => expect(result.current).toBeNull());
    expect(revokeUrl).toHaveBeenCalledWith("blob:second");
    unmount();
  });

  it("contains preview read failures and revokes URLs resolved after cleanup", async () => {
    readFileMock.mockRejectedValueOnce(new Error("read failed"));
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const attachment = {
      id: "att_1",
      local_uri: "indexeddb://file",
    } as never;

    const failed = renderHook(() =>
      useAttachmentObjectUrl({ attachment, resourceId: "item_1", workspaceId: "workspace_1" }),
    );
    await waitFor(() => expect(readFileMock).toHaveBeenCalledOnce());
    expect(failed.result.current).toBeNull();
    failed.unmount();

    let resolveRead: ((buffer: ArrayBuffer) => void) | undefined;
    readFileMock.mockImplementationOnce(
      () => new Promise<ArrayBuffer>((resolve) => {
        resolveRead = resolve;
      }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late");
    const pending = renderHook(() =>
      useAttachmentObjectUrl({ attachment, workspaceId: "workspace_1" }),
    );
    await waitFor(() => expect(readFileMock).toHaveBeenCalledTimes(2));
    pending.unmount();
    await act(async () => resolveRead?.(new ArrayBuffer(1)));
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith("blob:late"));
  });

  it("does not retry permanently missing remote attachments", async () => {
    const handler = createAttachmentErrorHandler();
    const attachment = { id: "att_1" } as never;

    await expect(
      handler.onDownloadError(attachment, { status: 404 })
    ).resolves.toBe(false);
    await expect(
      handler.onDownloadError(attachment, { statusCode: 410 })
    ).resolves.toBe(false);
    await expect(
      handler.onDownloadError(attachment, { status: 503 })
    ).resolves.toBe(true);
    await expect(
      handler.onDeleteError(attachment, { statusCode: 404 })
    ).resolves.toBe(true);
    await expect(handler.onUploadError(attachment, new Error("offline"))).resolves.toBe(true);
    await expect(handler.onDownloadError(attachment, "offline")).resolves.toBe(true);
  });





});
