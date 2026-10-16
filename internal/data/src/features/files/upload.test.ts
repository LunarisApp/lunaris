import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAttachmentQueueMock,
  generateAttachmentIdMock,
  getWorkspaceResourceMock,
  getStorageSlotMock,
  initializeMock,
  localStorageDeleteMock,
  localStorageInitializeMock,
  localStorageSaveMock,
  resolveWorkspaceVisibilityMock,
  saveFileMock,
  setFileStorageMetadataMock,
} = vi.hoisted(() => ({
  getAttachmentQueueMock: vi.fn(),
  generateAttachmentIdMock: vi.fn(),
  getWorkspaceResourceMock: vi.fn(),
  getStorageSlotMock: vi.fn(),
  initializeMock: vi.fn(),
  localStorageDeleteMock: vi.fn(),
  localStorageInitializeMock: vi.fn(),
  localStorageSaveMock: vi.fn(),
  resolveWorkspaceVisibilityMock: vi.fn(),
  saveFileMock: vi.fn(),
  setFileStorageMetadataMock: vi.fn(),
}));

vi.mock("@repo/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/utils")>()),
  createId: () => "att_local",
}));

vi.mock("../../storage/indexeddb-file-storage", () => ({
  IndexedDbFileStorageAdapter: class {
    deleteFile(localUri: string) {
      return localStorageDeleteMock(localUri);
    }

    getLocalUri(filename: string) {
      return `indexeddb://lunaris-files-workspace_1/files/${filename}`;
    }

    initialize() {
      return localStorageInitializeMock();
    }

    saveFile(localUri: string, data: ArrayBuffer) {
      return localStorageSaveMock(localUri, data);
    }
  },
}));

vi.mock("../attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../attachments")>()),
  getAttachmentQueue: getAttachmentQueueMock,
}));

vi.mock("../workspace-storage-slots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace-storage-slots")>()),
  getStorageSlot: getStorageSlotMock,
  setFileStorageMetadata: setFileStorageMetadataMock,
}));

vi.mock("../workspace-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace-resources")>()),
  getWorkspaceResource: getWorkspaceResourceMock,
}));

vi.mock("../workspaces", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspaces")>()),
  resolveWorkspaceVisibility: resolveWorkspaceVisibilityMock,
}));

import {
  FileAttachmentAlreadyExistsError,
  uploadFileAttachmentToWorkspaceResource,
} from "./services";

describe("uploadFileAttachmentToWorkspaceResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeMock.mockResolvedValue(undefined);
    localStorageDeleteMock.mockResolvedValue(undefined);
    localStorageInitializeMock.mockResolvedValue(undefined);
    localStorageSaveMock.mockResolvedValue(28);
    resolveWorkspaceVisibilityMock.mockResolvedValue("shared");
    getAttachmentQueueMock.mockReturnValue({
      generateAttachmentId: generateAttachmentIdMock,
      localStorage: {
        deleteFile: localStorageDeleteMock,
        getLocalUri: (filename: string) =>
          `indexeddb://queue/files/${filename}`,
        initialize: initializeMock,
      },
      saveFile: saveFileMock,
    });
    generateAttachmentIdMock.mockResolvedValue("att_1");
    getWorkspaceResourceMock.mockResolvedValue({
      id: "item_1",
      resource_type_id: "lunaris.mini-app",
      workspace_id: "workspace_1",
    });
    getStorageSlotMock.mockResolvedValue({
      id: "storage_1",
      kind: "file",
      metadata: null,
      workspace_id: "workspace_1",
      resource_id: "item_1",
    });
  });

  it("attaches HTML to an existing extension-owned item", async () => {
    const transactionDb = { getOptional: vi.fn().mockResolvedValue(null) };
    const db = { getOptional: vi.fn().mockResolvedValue(null) };
    saveFileMock.mockImplementation(
      async ({
        updateHook,
      }: {
        updateHook: (db: unknown, row: { id: string }) => void;
      }) => {
        await updateHook(transactionDb, { id: "att_1" });
      }
    );
    const file = new File(["<h1>Calculator</h1>"], "calculator.htm", {
      type: "",
    });

    const metadata = await uploadFileAttachmentToWorkspaceResource({
      api: {} as never,
      db: db as never,
      file,
      resourceId: "item_1",
      workspaceId: "workspace_1",
      storageId: "storage_1",
    });

    expect(metadata).toMatchObject({
      attachmentId: "att_1",
      fileExtension: "html",
      filename: "calculator.htm",
      mediaType: "text/html",
      size: file.size,
    });
    expect(saveFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileExtension: "html",
        id: "att_1",
        mediaType: "text/html",
      })
    );
    expect(setFileStorageMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backingId: "att_1",
        db: transactionDb,
        workspaceId: "workspace_1",
        storageId: "storage_1",
      })
    );
  });

  it("rejects an item that already has an attachment", async () => {
    const db = { getOptional: vi.fn() };
    getStorageSlotMock.mockResolvedValue({
      id: "storage_1",
      kind: "file",
      metadata: JSON.stringify({ attachmentId: "att_existing" }),
      workspace_id: "workspace_1",
      resource_id: "item_1",
    });

    await expect(
      uploadFileAttachmentToWorkspaceResource({
        api: {} as never,
        db: db as never,
        file: new File(["app"], "app.html", { type: "text/html" }),
        resourceId: "item_1",
        workspaceId: "workspace_1",
        storageId: "storage_1",
      })
    ).rejects.toBeInstanceOf(FileAttachmentAlreadyExistsError);
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it("removes cloud bytes when the atomic metadata write fails", async () => {
    const db = { getOptional: vi.fn().mockResolvedValue(null) };
    const transactionDb = {
      getOptional: vi.fn(),
    };
    getStorageSlotMock
      .mockResolvedValueOnce({
        id: "storage_1",
        kind: "file",
        metadata: null,
        workspace_id: "workspace_1",
        resource_id: "item_1",
      })
      .mockResolvedValueOnce({
        id: "storage_1",
        kind: "file",
        metadata: JSON.stringify({ attachmentId: "att_existing" }),
        workspace_id: "workspace_1",
        resource_id: "item_1",
      });
    saveFileMock.mockImplementation(
      async ({
        updateHook,
      }: {
        updateHook: (db: unknown, row: { id: string }) => void;
      }) => {
        await updateHook(transactionDb, { id: "att_1" });
      }
    );

    await expect(
      uploadFileAttachmentToWorkspaceResource({
        api: {} as never,
        db: db as never,
        file: new File(["app"], "app.html", { type: "text/html" }),
        resourceId: "item_1",
        workspaceId: "workspace_1",
        storageId: "storage_1",
      })
    ).rejects.toBeInstanceOf(FileAttachmentAlreadyExistsError);
    expect(localStorageDeleteMock).toHaveBeenCalledWith(
      "indexeddb://queue/files/att_1.html"
    );
  });

  it("stores local-workspace attachments without the cloud queue", async () => {
    resolveWorkspaceVisibilityMock.mockResolvedValue("local");
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue(null),
    };
    const file = new File(["<h1>Local calculator</h1>"], "local.html", {
      type: "text/html",
    });

    const metadata = await uploadFileAttachmentToWorkspaceResource({
      api: {} as never,
      db: db as never,
      file,
      resourceId: "item_1",
      workspaceId: "workspace_1",
      storageId: "storage_1",
    });

    expect(metadata).toMatchObject({
      attachmentId: "att_local",
      fileExtension: "html",
      filename: "local.html",
      mediaType: "text/html",
      size: 28,
    });
    expect(getAttachmentQueueMock).not.toHaveBeenCalled();
    expect(localStorageSaveMock).toHaveBeenCalledWith(
      "indexeddb://lunaris-files-workspace_1/files/att_local.html",
      expect.any(File)
    );
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO attachments"),
      expect.arrayContaining(["att_local", "att_local.html", "text/html", 0])
    );
    expect(setFileStorageMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backingId: "att_local",
        db,
        workspaceId: "workspace_1",
        storageId: "storage_1",
      })
    );
  });
});
