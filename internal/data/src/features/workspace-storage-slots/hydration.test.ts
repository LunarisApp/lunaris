import { Doc } from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyYjsDocumentUpdatesMock,
  getResourceStorageSlotsMock,
  getStorageValuesMock,
  getYjsDocumentUpdatesMock,
  preloadYjsDocumentMock,
  sharedResourceGetMock,
} = vi.hoisted(() => ({
  applyYjsDocumentUpdatesMock: vi.fn(),
  getResourceStorageSlotsMock: vi.fn(),
  getStorageValuesMock: vi.fn(),
  getYjsDocumentUpdatesMock: vi.fn(),
  preloadYjsDocumentMock: vi.fn(),
  sharedResourceGetMock: vi.fn(),
}));

vi.mock("../yjs", () => ({
  applyYjsDocumentUpdates: applyYjsDocumentUpdatesMock,
  getYjsDocumentUpdates: getYjsDocumentUpdatesMock,
}));

vi.mock("../yjs/document-resource-store", () => ({
  preloadYjsDocument: preloadYjsDocumentMock,
  yjsDocumentResourceStore: { get: sharedResourceGetMock },
}));

vi.mock("./services", () => ({
  getResourceStorageSlots: getResourceStorageSlotsMock,
  getStorageValues: getStorageValuesMock,
}));

import { hydrateResourceStorage } from "./hydration";

describe("resource storage hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStorageValuesMock.mockResolvedValue([]);
    getYjsDocumentUpdatesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates mixed slots and creates matching handles", async () => {
    getResourceStorageSlotsMock.mockResolvedValue([
      { id: "content-id", name: "content", kind: "yjs", backing_id: "doc-id" },
      { id: "settings-id", name: "settings", kind: "key-value" },
      {
        id: "cover-id",
        name: "cover",
        kind: "file",
        metadata: JSON.stringify({ fileId: "file-id", filename: "cover.png" }),
      },
    ]);
    getStorageValuesMock.mockResolvedValue([
      { key: "theme", value: '"dark"' },
      { key: "title", value: '"plain text"' },
      { key: "missing", value: null },
    ]);

    const result = await hydrateResourceStorage({} as never, "resource-id");

    expect(result.handles).toEqual({
      content: { kind: "yjs", storageId: "content-id" },
      cover: { kind: "file", storageId: "cover-id" },
      settings: { kind: "key-value", storageId: "settings-id" },
    });
    expect(result.storage.settings).toEqual({
      kind: "key-value",
      values: { title: "plain text", theme: "dark", missing: null },
    });
    expect(result.storage.cover).toMatchObject({
      kind: "file",
      metadata: { fileId: "file-id", filename: "cover.png" },
    });
    expect(getYjsDocumentUpdatesMock).toHaveBeenCalledWith(
      expect.anything(),
      "doc-id",
    );
    expect(applyYjsDocumentUpdatesMock).toHaveBeenCalledOnce();

    result.dispose();
  });

  it("rejects unencoded values and releases already hydrated documents", async () => {
    getResourceStorageSlotsMock.mockResolvedValue([
      { id: "content-id", name: "content", kind: "yjs", backing_id: "doc-id" },
      { id: "settings-id", name: "settings", kind: "key-value" },
    ]);
    getStorageValuesMock.mockResolvedValue([{ key: "title", value: "unquoted" }]);
    const destroy = vi.spyOn(Doc.prototype, "destroy");

    await expect(
      hydrateResourceStorage({} as never, "resource-id"),
    ).rejects.toThrow(SyntaxError);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys hydrated documents when a later slot is invalid", async () => {
    getResourceStorageSlotsMock.mockResolvedValue([
      { id: "content-id", name: "content", kind: "yjs", backing_id: "doc-id" },
      { id: "bad-id", name: "bad", kind: "unknown" },
    ]);
    const destroy = vi.spyOn(Doc.prototype, "destroy");

    await expect(
      hydrateResourceStorage({} as never, "resource-id"),
    ).rejects.toThrow("Storage slot has an invalid kind");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("reuses and releases a shared Yjs document", async () => {
    const document = new Doc();
    const release = vi.fn();
    const db = { writeTransaction: vi.fn() } as never;
    getResourceStorageSlotsMock.mockResolvedValue([
      { id: "content-id", name: "content", kind: "yjs", backing_id: "doc-id" },
    ]);
    preloadYjsDocumentMock.mockReturnValue({
      done: Promise.resolve(),
      promote: vi.fn(),
      release,
    });
    sharedResourceGetMock.mockReturnValue({ doc: document, status: "ready" });

    const result = await hydrateResourceStorage(db, "resource-id", {
      sharedYjsWorkspaceId: "workspace-id",
    });

    expect(result.storage.content).toEqual({ document, kind: "yjs" });
    expect(preloadYjsDocumentMock).toHaveBeenCalledWith({
      db,
      documentId: "doc-id",
      priority: "intent",
      workspaceId: "workspace-id",
    });
    expect(getYjsDocumentUpdatesMock).not.toHaveBeenCalled();

    result.dispose();
    result.dispose();
    expect(release).toHaveBeenCalledOnce();
    document.destroy();
  });

  it("destroys a document when applying its updates fails", async () => {
    getResourceStorageSlotsMock.mockResolvedValue([
      { id: "content-id", name: "content", kind: "yjs", backing_id: "doc-id" },
    ]);
    applyYjsDocumentUpdatesMock.mockImplementation(() => {
      throw new Error("invalid update");
    });
    const destroy = vi.spyOn(Doc.prototype, "destroy");

    await expect(
      hydrateResourceStorage({} as never, "resource-id"),
    ).rejects.toThrow("invalid update");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
