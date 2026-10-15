/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createWorkspaceResourceMock,
  saveFileMock,
  setFileStorageMetadataMock,
  storageInitializeMock,
} = vi.hoisted(() => ({
  createWorkspaceResourceMock: vi.fn(),
  saveFileMock: vi.fn(),
  setFileStorageMetadataMock: vi.fn(),
  storageInitializeMock: vi.fn(),
}));

vi.mock("../../storage/indexeddb-file-storage", () => ({
  IndexedDbFileStorageAdapter: class {
      async initialize() {
        return storageInitializeMock();
      }

      getLocalUri(filename: string) {
        return `indexeddb://lunaris-files-workspace_1/files/${filename}`;
      }

      async saveFile(localUri: string, data: ArrayBuffer) {
        return saveFileMock(localUri, data);
      }
    },
}));

vi.mock("@repo/utils", () => ({
  createId: () => "att_seeded",
}));

vi.mock("../workspace-resources", () => ({
  LOCAL_WORKSPACE_RESOURCES_TABLE: "local_workspace_resources",
  WORKSPACE_RESOURCES_TABLE: "workspace_resources",
  createWorkspaceResource: createWorkspaceResourceMock,
}));


vi.mock("../workspace-storage-slots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace-storage-slots")>()),
  setFileStorageMetadata: setFileStorageMetadataMock,
}));

const { createLocalFileWorkspaceResource } = await import("./services");

beforeEach(() => {
  vi.clearAllMocks();
  createWorkspaceResourceMock.mockResolvedValue({
    id: "item_file",
    name: "customers-10000.csv",
    storage: { content: { kind: "file", storageId: "file:item_file" } },
  });
  saveFileMock.mockResolvedValue(123);
});

describe("createLocalFileWorkspaceResource", () => {
  it("creates file item, local attachment row, and file metadata", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const file = new File(["a,b\n1,2"], "customers-10000.csv", {
      type: "text/csv",
    });

    const result = await createLocalFileWorkspaceResource({
      db: { execute } as never,
      file,
      parentId: "folder_1",
      position: 3,
      workspaceId: "workspace_1",
    });

    expect(result).toEqual({
      attachmentId: "att_seeded",
      id: "item_file",
      name: "customers-10000.csv",
    });
    expect(createWorkspaceResourceMock).toHaveBeenCalledWith({
      db: { execute },
      storage: { content: { kind: "file" } },
      name: "customers-10000.csv",
      parentId: "folder_1",
      resourceTypeId: "lunaris.file",
      position: 3,
      workspaceId: "workspace_1",
    });
    expect(storageInitializeMock).toHaveBeenCalled();
    expect(saveFileMock).toHaveBeenCalledWith(
      "indexeddb://lunaris-files-workspace_1/files/att_seeded.csv",
      expect.any(File)
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO attachments"),
      expect.arrayContaining([
        "att_seeded",
        "att_seeded.csv",
        "indexeddb://lunaris-files-workspace_1/files/att_seeded.csv",
        123,
        "text/csv",
        0,
      ])
    );
    expect(setFileStorageMetadataMock).toHaveBeenCalledWith({
      backingId: "att_seeded",
      db: { execute },
      metadata: expect.objectContaining({
        attachmentId: "att_seeded",
        fileId: "att_seeded",
        fileExtension: "csv",
        filename: "customers-10000.csv",
        mediaType: "text/csv",
        size: 123,
      }),
      workspaceId: "workspace_1",
      storageId: "file:item_file",
    });
  });
});
