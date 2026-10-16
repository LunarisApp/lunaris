import type { ResourceCreationContext } from "@lunarisapp/plugin-sdk";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import type { ReserveResourceCapacity } from "@repo/features/entitlements";
import type { WorkspaceResourcesMap } from "../types";
import { createBoundActions } from "./actions";

function toBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

const {
  createWorkspaceFolderMock,
  createWorkspaceResourceMock,
  deleteResourceStorageMock,
  deleteYjsDocumentMock,
  getResourceStorageSlotsMock,
  getStorageValuesMock,
  hasStorageBackingReferenceMock,
  getYjsDocumentUpdatesMock,
  getWorkspaceResourceTrashGroupIdsMock,
  trashWorkspaceResourceSubtreesMock,
  restoreWorkspaceResourceSubtreesMock,
  removeRecentFilesByResourceIdsMock,
  captureMock,
  logErrorMock,
  queueFileAttachmentDeletionMock,
  uploadFileAttachmentToWorkspaceResourceMock,
} = vi.hoisted(() => ({
  createWorkspaceFolderMock: vi.fn(),
  createWorkspaceResourceMock: vi.fn(),
  deleteResourceStorageMock: vi.fn(),
  deleteYjsDocumentMock: vi.fn(),
  getResourceStorageSlotsMock: vi.fn(),
  getStorageValuesMock: vi.fn(),
  hasStorageBackingReferenceMock: vi.fn(),
  getYjsDocumentUpdatesMock: vi.fn(),
  getWorkspaceResourceTrashGroupIdsMock: vi.fn(),
  trashWorkspaceResourceSubtreesMock: vi.fn(),
  restoreWorkspaceResourceSubtreesMock: vi.fn(),
  removeRecentFilesByResourceIdsMock: vi.fn(),
  captureMock: vi.fn(),
  logErrorMock: vi.fn(),
  queueFileAttachmentDeletionMock: vi.fn(),
  uploadFileAttachmentToWorkspaceResourceMock: vi.fn(),
}));

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: {
      debug: vi.fn(),
      error: logErrorMock,
      info: vi.fn(),
      warn: vi.fn(),
    },
    parseError: (e: unknown) => e,
  };
});

vi.mock("@repo/data/features/files", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@repo/data/features/files")>();
  return {
    ...actual,
    queueFileAttachmentDeletion: queueFileAttachmentDeletionMock,
    uploadFileAttachmentToWorkspaceResource:
      uploadFileAttachmentToWorkspaceResourceMock,
  };
});

vi.mock("@repo/data/features/workspace-resources", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@repo/data/features/workspace-resources")
    >();
  return {
    ...actual,
    createWorkspaceFolder: createWorkspaceFolderMock,
    createWorkspaceResource: createWorkspaceResourceMock,
    getWorkspaceResourceTrashGroupIds: getWorkspaceResourceTrashGroupIdsMock,
    trashWorkspaceResourceSubtrees: trashWorkspaceResourceSubtreesMock,
    restoreWorkspaceResourceSubtrees: restoreWorkspaceResourceSubtreesMock,
  };
});

vi.mock(
  "@repo/data/features/workspace-storage-slots",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@repo/data/features/workspace-storage-slots")
      >();
    return {
      ...actual,
      deleteResourceStorage: deleteResourceStorageMock,
      getResourceStorageSlots: getResourceStorageSlotsMock,
      getStorageValues: getStorageValuesMock,
      hasStorageBackingReference: hasStorageBackingReferenceMock,
    };
  }
);

vi.mock("@repo/data/features/yjs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@repo/data/features/yjs")>();
  return {
    ...actual,
    deleteYjsDocument: deleteYjsDocumentMock,
    getYjsDocumentUpdates: getYjsDocumentUpdatesMock,
  };
});

vi.mock("../../search", () => ({
  removeRecentFilesByResourceIds: removeRecentFilesByResourceIdsMock,
}));

vi.mock("posthog-js", () => ({
  default: {
    capture: captureMock,
  },
}));

type DbItem = { id: string; resource_type_id?: string | null };

function makeDb(params: {
  itemsById?: Record<string, DbItem>;
  item?: DbItem | null;
  childrenByParent: Record<string, DbItem[]>;
}) {
  const { itemsById, item = null, childrenByParent } = params;

  return {
    execute: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockImplementation((_sql, params) => {
      const parentId = params[1];
      return Promise.resolve(childrenByParent[String(parentId)] ?? []);
    }),
    getOptional: vi.fn().mockImplementation((_sql, params) => {
      if (itemsById) {
        return Promise.resolve(itemsById[String(params[0])] ?? null);
      }
      return Promise.resolve(item);
    }),
  };
}

function makeItemsMap(
  entries: Array<Partial<WorkspaceResourceEntity> & { id: string }>
): WorkspaceResourcesMap {
  const base: Omit<WorkspaceResourceEntity, "id"> = {
    workspace_id: "workspace_1",
    name: "",
    icon: null,
    position: 0,
    parent_id: null,
    resource_type_id: null,
    schema_version: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
  return new Map(
    entries.map((e) => [e.id, { ...base, ...e } as WorkspaceResourceEntity])
  );
}

const allowResourceCapacity: ReserveResourceCapacity = async () => ({
  commit: () => undefined,
  rollback: () => undefined,
});

function bindActions(
  db: ReturnType<typeof makeDb>,
  options: {
    api?: Parameters<typeof createBoundActions>[0]["api"];
    getResourcesMap?: () => WorkspaceResourcesMap;
    permissionCheck?: Parameters<
      typeof createBoundActions
    >[0]["permissionCheck"];
    reserveResourceCapacity?: ReserveResourceCapacity;
    organizationNavigation?: Parameters<
      typeof createBoundActions
    >[0]["organizationNavigation"];
  } = {}
) {
  return createBoundActions({
    api: options.api,
    db: db as never,
    getResourcesMap: options.getResourcesMap,
    permissionCheck: options.permissionCheck,
    workspaceId: "workspace_1",
    reserveResourceCapacity:
      options.reserveResourceCapacity ?? allowResourceCapacity,
    organizationNavigation: options.organizationNavigation ?? {
      closeViewInstances: vi.fn(),
      setResourceTitle: vi.fn(),
    },
  });
}

describe("createBoundActions permissions", () => {
  it("blocks mutations before touching local data", async () => {
    const db = makeDb({ childrenByParent: {} });
    const actions = bindActions(db, {
      permissionCheck: () => false,
    });

    await expect(actions.createFolder("root")).rejects.toThrow(
      "Permission denied: content.write"
    );
    expect(createWorkspaceFolderMock).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("createBoundActions.deleteResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteResourceStorageMock.mockResolvedValue([]);
    hasStorageBackingReferenceMock.mockResolvedValue(false);
    queueFileAttachmentDeletionMock.mockResolvedValue(undefined);
    getWorkspaceResourceTrashGroupIdsMock.mockImplementation(
      async ({ db, rootId }) => {
        const rows = await db.getAll("", ["workspace_1", rootId]);
        return [rootId, ...rows.map(({ id }: { id: string }) => id)];
      }
    );
    trashWorkspaceResourceSubtreesMock.mockImplementation(
      async ({ db, rootIds }) => {
        const ids: string[] = [];
        for (const rootId of rootIds) {
          const rows = await db.getAll("", ["workspace_1", rootId]);
          ids.push(rootId, ...rows.map(({ id }: { id: string }) => id));
        }
        return [...new Set(ids)];
      }
    );
  });

  it("deletes descendant document state and closes views by item id", async () => {
    deleteResourceStorageMock.mockImplementation((_db, resourceId) =>
      Promise.resolve(
        resourceId === "item_1"
          ? [
              {
                backing_id: "yjs_1",
                id: "slot_1",
                kind: "yjs",
                name: "content",
              },
            ]
          : resourceId === "item_2"
            ? [
                {
                  backing_id: "yjs_2",
                  id: "slot_2",
                  kind: "yjs",
                  name: "content",
                },
              ]
            : []
      )
    );
    const db = makeDb({
      item: { id: "folder_1" },
      childrenByParent: {
        folder_1: [{ id: "item_1" }, { id: "item_2" }],
      },
    });
    const closeViewInstances = vi.fn();

    const actions = bindActions(db, {
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.purgeResources(["folder_1"]);

    expect(deleteYjsDocumentMock).toHaveBeenNthCalledWith(1, db, "yjs_1");
    expect(deleteYjsDocumentMock).toHaveBeenNthCalledWith(2, db, "yjs_2");
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM workspace_resources WHERE id IN (?,?,?)",
      ["folder_1", "item_1", "item_2"]
    );
    expect(closeViewInstances).toHaveBeenCalledWith([
      "folder_1",
      "item_1",
      "item_2",
    ]);
    expect(removeRecentFilesByResourceIdsMock).toHaveBeenCalledWith(
      "workspace_1",
      ["folder_1", "item_1", "item_2"]
    );
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_purged", {
      count: 3,
      roots: 1,
    });
  });

  it("still closes views when deleted items have no attached documents", async () => {
    const db = makeDb({
      item: { id: "folder_1" },
      childrenByParent: {
        folder_1: [{ id: "folder_2" }],
      },
    });

    const closeViewInstances = vi.fn();
    const actions = bindActions(db, {
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.purgeResources(["folder_1"]);

    expect(deleteYjsDocumentMock).not.toHaveBeenCalled();
    expect(removeRecentFilesByResourceIdsMock).toHaveBeenCalledWith(
      "workspace_1",
      ["folder_1", "folder_2"]
    );
    expect(closeViewInstances).toHaveBeenCalledWith(["folder_1", "folder_2"]);
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM workspace_resources WHERE id IN (?,?)",
      ["folder_1", "folder_2"]
    );
  });

  it("retains a Yjs backing while another storage slot references it", async () => {
    deleteResourceStorageMock.mockResolvedValue([
      {
        backing_id: "yjs_shared",
        id: "storage_1",
        kind: "yjs",
        name: "content",
      },
    ]);
    hasStorageBackingReferenceMock.mockResolvedValue(true);
    const db = makeDb({
      item: { id: "item_1" },
      childrenByParent: { item_1: [] },
    });
    const actions = bindActions(db);

    await actions.purgeResources(["item_1"]);

    expect(hasStorageBackingReferenceMock).toHaveBeenCalledWith(
      db,
      "yjs",
      "yjs_shared"
    );
    expect(deleteYjsDocumentMock).not.toHaveBeenCalled();
  });
});

describe("createBoundActions.deleteResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteResourceStorageMock.mockResolvedValue([]);
    hasStorageBackingReferenceMock.mockResolvedValue(false);
    queueFileAttachmentDeletionMock.mockResolvedValue(undefined);
    getWorkspaceResourceTrashGroupIdsMock.mockImplementation(
      async ({ db, rootId }) => {
        const rows = await db.getAll("", ["workspace_1", rootId]);
        return [rootId, ...rows.map(({ id }: { id: string }) => id)];
      }
    );
    trashWorkspaceResourceSubtreesMock.mockImplementation(
      async ({ db, rootIds }) => {
        const ids: string[] = [];
        for (const rootId of rootIds) {
          const rows = await db.getAll("", ["workspace_1", rootId]);
          ids.push(rootId, ...rows.map(({ id }: { id: string }) => id));
        }
        return [...new Set(ids)];
      }
    );
  });

  it("is a no-op for empty input", async () => {
    const db = makeDb({ childrenByParent: {} });
    const closeViewInstances = vi.fn();
    const actions = bindActions(db, {
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.deleteResources([]);

    expect(db.execute).not.toHaveBeenCalled();
    expect(closeViewInstances).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("moves active subtrees to trash without deleting their storage", async () => {
    const db = makeDb({
      childrenByParent: { folder_1: [{ id: "child_1" }] },
    });
    const closeViewInstances = vi.fn();
    const actions = bindActions(db, {
      getResourcesMap: () =>
        makeItemsMap([
          { id: "folder_1", parent_id: null },
          { id: "child_1", parent_id: "folder_1" },
        ]),
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.deleteResources(["folder_1"]);

    expect(trashWorkspaceResourceSubtreesMock).toHaveBeenCalledWith({
      db,
      workspaceId: "workspace_1",
      rootIds: ["folder_1"],
    });
    expect(deleteResourceStorageMock).not.toHaveBeenCalled();
    expect(closeViewInstances).toHaveBeenCalledWith(["folder_1", "child_1"]);
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_trashed", {
      count: 2,
      roots: 1,
    });
  });

  it("reserves capacity for the full subtree before restoring", async () => {
    const db = makeDb({
      childrenByParent: { folder_1: [{ id: "child_1" }] },
    });
    const commit = vi.fn();
    const rollback = vi.fn();
    const reserveResourceCapacity = vi
      .fn<ReserveResourceCapacity>()
      .mockResolvedValue({ commit, rollback });
    restoreWorkspaceResourceSubtreesMock.mockResolvedValueOnce(2);
    const actions = bindActions(db, { reserveResourceCapacity });

    await actions.restoreResources(["folder_1"]);

    expect(reserveResourceCapacity).toHaveBeenCalledWith(2);
    expect(restoreWorkspaceResourceSubtreesMock).toHaveBeenCalledWith({
      db,
      workspaceId: "workspace_1",
      rootIds: ["folder_1"],
    });
    expect(commit).toHaveBeenCalledWith(2);
  });

  it("batches multiple sibling roots into one delete call", async () => {
    const db = makeDb({
      itemsById: {
        folder_1: { id: "folder_1" },
        item_a: { id: "item_a" },
      },
      childrenByParent: {
        folder_1: [{ id: "child_1" }],
        item_a: [],
        child_1: [],
      },
    });
    const closeViewInstances = vi.fn();
    const resourcesMap = makeItemsMap([
      { id: "folder_1", parent_id: null },
      { id: "item_a", parent_id: null },
      { id: "child_1", parent_id: "folder_1" },
    ]);

    const actions = bindActions(db, {
      getResourcesMap: () => resourcesMap,
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.purgeResources(["folder_1", "item_a"]);

    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM workspace_resources WHERE id IN (?,?,?)",
      ["folder_1", "child_1", "item_a"]
    );
    expect(closeViewInstances).toHaveBeenCalledWith([
      "folder_1",
      "child_1",
      "item_a",
    ]);
    expect(removeRecentFilesByResourceIdsMock).toHaveBeenCalledWith(
      "workspace_1",
      ["folder_1", "child_1", "item_a"]
    );
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_purged", {
      count: 3,
      roots: 2,
    });
  });

  it("drops redundant nested selection (parent + descendant)", async () => {
    const db = makeDb({
      itemsById: {
        folder_1: { id: "folder_1" },
      },
      childrenByParent: {
        folder_1: [{ id: "child_1" }],
        child_1: [],
      },
    });
    const closeViewInstances = vi.fn();
    const resourcesMap = makeItemsMap([
      { id: "folder_1", parent_id: null },
      { id: "child_1", parent_id: "folder_1" },
    ]);

    const actions = bindActions(db, {
      getResourcesMap: () => resourcesMap,
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.purgeResources(["folder_1", "child_1"]);

    // Only resolves the trash group for folder_1 (child_1 is redundant).
    expect(getWorkspaceResourceTrashGroupIdsMock).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM workspace_resources WHERE id IN (?,?)",
      ["folder_1", "child_1"]
    );
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_purged", {
      count: 2,
      roots: 1,
    });
  });

  it("skips Yjs cleanup for items without Yjs storage", async () => {
    const db = makeDb({
      itemsById: {
        folder_1: { id: "folder_1" },
        folder_2: { id: "folder_2" },
      },
      childrenByParent: {
        folder_1: [],
        folder_2: [],
      },
    });
    const closeViewInstances = vi.fn();
    const resourcesMap = makeItemsMap([
      { id: "folder_1", parent_id: null },
      { id: "folder_2", parent_id: null },
    ]);

    const actions = bindActions(db, {
      getResourcesMap: () => resourcesMap,
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.purgeResources(["folder_1", "folder_2"]);

    expect(deleteYjsDocumentMock).not.toHaveBeenCalled();
    expect(removeRecentFilesByResourceIdsMock).toHaveBeenCalledWith(
      "workspace_1",
      ["folder_1", "folder_2"]
    );
    expect(closeViewInstances).toHaveBeenCalledWith(["folder_1", "folder_2"]);
  });

  it("rethrows errors and logs with resourceIds (plural)", async () => {
    const error = new Error("getOptional exploded");
    const db = makeDb({ childrenByParent: {} });
    db.getOptional = vi.fn().mockRejectedValueOnce(error);

    const resourcesMap = makeItemsMap([{ id: "folder_1", parent_id: null }]);
    const actions = bindActions(db, { getResourcesMap: () => resourcesMap });

    getWorkspaceResourceTrashGroupIdsMock.mockRejectedValueOnce(error);
    await expect(actions.purgeResources(["folder_1"])).rejects.toBe(error);
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "WorkspaceExplorer",
        msg: "Delete failed",
        resourceIds: ["folder_1"],
      })
    );
  });

  it("deduplicates when the same id is passed multiple times in input", async () => {
    const db = makeDb({
      itemsById: { a: { id: "a" } },
      childrenByParent: { a: [] },
    });
    const closeViewInstances = vi.fn();
    const resourcesMap = makeItemsMap([{ id: "a", parent_id: null }]);

    const actions = bindActions(db, {
      getResourcesMap: () => resourcesMap,
      organizationNavigation: { closeViewInstances, setResourceTitle: vi.fn() },
    });

    await actions.purgeResources(["a", "a"]);

    // `seen` Set in deleteResources collapses the duplicate.
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM workspace_resources WHERE id IN (?)",
      ["a"]
    );
    expect(closeViewInstances).toHaveBeenCalledWith(["a"]);
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_purged", {
      count: 1,
      roots: 1,
    });
  });

  it("deletes file storage attachments", async () => {
    deleteResourceStorageMock.mockResolvedValue([
      {
        backing_id: "att_1",
        id: "storage_1",
        kind: "file",
        name: "content",
        metadata: JSON.stringify({
          attachmentId: "att_1",
          fileExtension: "png",
          filename: "image.png",
          mediaType: "image/png",
          size: 10,
          uploadedAt: "2026-01-01T00:00:00.000Z",
        }),
      },
    ]);
    const db = makeDb({
      itemsById: {
        item_1: { id: "item_1", resource_type_id: "lunaris.file" },
      },
      childrenByParent: { item_1: [] },
    });
    const actions = bindActions(db, {
      getResourcesMap: () =>
        makeItemsMap([{ id: "item_1", resource_type_id: "lunaris.file" }]),
    });

    await actions.purgeResources(["item_1"]);

    expect(queueFileAttachmentDeletionMock).toHaveBeenCalledWith({
      db,
      metadata: expect.objectContaining({ attachmentId: "att_1" }),
      workspaceId: "workspace_1",
    });
  });
});

describe("createBoundActions.createResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWorkspaceFolderMock.mockResolvedValue("folder_1");
    createWorkspaceResourceMock.mockResolvedValue({
      id: "item_1",
      name: "Document",
      storage: { content: { kind: "yjs", storageId: "storage_1" } },
    });
  });

  it("lets custom creation cancel without reserving capacity", async () => {
    const db = makeDb({ childrenByParent: {} });
    const reserveResourceCapacity = vi.fn(allowResourceCapacity);
    const actions = bindActions(db, { reserveResourceCapacity });

    const result = await actions.createResource("root", {
      createInWorkspace: async () => null,
      icon: {},
      name: "Custom",
      resourceTypeId: "lunaris.custom",
      schema: { currentVersion: 1 },
      storage: { content: { kind: "yjs" } },
    } as never);

    expect(result).toBeNull();
    expect(reserveResourceCapacity).not.toHaveBeenCalled();
  });

  it("cleans up items when custom creation cancels", async () => {
    deleteResourceStorageMock.mockResolvedValue([
      {
        backing_id: "yjs_1",
        id: "storage_1",
        kind: "yjs",
        name: "content",
      },
    ]);
    hasStorageBackingReferenceMock.mockResolvedValue(false);
    const db = makeDb({
      childrenByParent: { item_1: [] },
      itemsById: {
        item_1: {
          id: "item_1",
          resource_type_id: "lunaris.custom",
        },
      },
    });
    const actions = bindActions(db, {
      getResourcesMap: () =>
        makeItemsMap([
          {
            id: "item_1",
            resource_type_id: "lunaris.custom",
          },
        ]),
    });

    const result = await actions.createResource("root", {
      createInWorkspace: async ({
        createResource,
      }: ResourceCreationContext) => {
        await createResource();
        return null;
      },
      icon: {},
      name: "Custom",
      resourceTypeId: "lunaris.custom",
      schema: { currentVersion: 1 },
      storage: { kind: "yjs" },
    } as never);

    expect(result).toBeNull();
    expect(deleteYjsDocumentMock).toHaveBeenCalledWith(db, "yjs_1");
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("commits capacity for documents and folders", async () => {
    const documentReservation = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const folderReservation = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const reserveResourceCapacity = vi
      .fn()
      .mockResolvedValueOnce(documentReservation)
      .mockResolvedValueOnce(folderReservation);
    const db = makeDb({ childrenByParent: {} });
    const actions = bindActions(db, { reserveResourceCapacity });

    await actions.createResource(
      "root",
      {
        resourceTypeId: "lunaris.rich-text",
        schema: { currentVersion: 1 },
        storage: { kind: "yjs" },
      } as never,
      "Document"
    );
    await actions.createFolder("root");

    expect(reserveResourceCapacity).toHaveBeenCalledTimes(2);
    expect(documentReservation.commit).toHaveBeenCalledOnce();
    expect(documentReservation.rollback).not.toHaveBeenCalled();
    expect(folderReservation.commit).toHaveBeenCalledOnce();
    expect(folderReservation.rollback).not.toHaveBeenCalled();
  });

  it("rolls capacity back when item creation fails", async () => {
    const error = new Error("create failed");
    const reservation = { commit: vi.fn(), rollback: vi.fn() };
    createWorkspaceResourceMock.mockRejectedValueOnce(error);
    const db = makeDb({ childrenByParent: {} });
    const actions = bindActions(db, {
      reserveResourceCapacity: vi.fn().mockResolvedValue(reservation),
    });

    await expect(
      actions.createResource(
        "root",
        {
          resourceTypeId: "lunaris.rich-text",
          schema: { currentVersion: 1 },
          storage: { kind: "yjs" },
        } as never,
        "Document"
      )
    ).rejects.toBe(error);
    expect(reservation.commit).not.toHaveBeenCalled();
    expect(reservation.rollback).toHaveBeenCalledOnce();
  });

  it("provides scoped item and file-storage capabilities", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    createWorkspaceResourceMock.mockResolvedValue({
      id: "item_1",
      name: "notes.txt",
      storage: { cover: { kind: "file", storageId: "file:item_1:cover" } },
    });
    uploadFileAttachmentToWorkspaceResourceMock.mockResolvedValue({
      attachmentId: "att_1",
      fileExtension: "txt",
      filename: "notes.txt",
      mediaType: "text/plain",
      size: 5,
      uploadedAt: "2026-01-01T00:00:00.000Z",
    });
    const db = makeDb({ childrenByParent: {} });
    const api = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
    const reservation = { commit: vi.fn(), rollback: vi.fn() };
    const actions = bindActions(db, {
      api: api as never,
      reserveResourceCapacity: vi.fn().mockResolvedValue(reservation),
    });

    const result = await actions.createResource("root", {
      createInWorkspace: async ({
        createResource,
        uploadFile,
      }: ResourceCreationContext) => {
        const resource = await createResource({ name: file.name });
        await uploadFile({ file, storage: resource.storage.cover! });
        return resource;
      },
      icon: {},
      name: "File",
      resourceTypeId: "lunaris.file",
      schema: { currentVersion: 1 },
      storage: { cover: { kind: "file" } },
    } as never);

    expect(result).toEqual({
      name: "notes.txt",
      resourceId: "item_1",
      storage: { cover: { kind: "file", storageId: "file:item_1:cover" } },
    });
    expect(createWorkspaceResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: { cover: { kind: "file" } },
        name: "notes.txt",
        parentId: "root",
        resourceTypeId: "lunaris.file",
      })
    );
    expect(uploadFileAttachmentToWorkspaceResourceMock).toHaveBeenCalledWith({
      api,
      db,
      file,
      resourceId: "item_1",
      workspaceId: "workspace_1",
      storageId: "file:item_1:cover",
    });
    expect(reservation.commit).toHaveBeenCalledOnce();
    expect(reservation.rollback).not.toHaveBeenCalled();
  });

  it("supports custom creation of multiple items", async () => {
    const files = [
      new File(["first"], "first.txt", { type: "text/plain" }),
      new File(["second"], "second.txt", { type: "text/plain" }),
    ];
    createWorkspaceResourceMock
      .mockResolvedValueOnce({
        id: "item_1",
        name: "first.txt",
        storage: { content: { kind: "file", storageId: "file:item_1" } },
      })
      .mockResolvedValueOnce({
        id: "item_2",
        name: "second.txt",
        storage: { content: { kind: "file", storageId: "file:item_2" } },
      });
    uploadFileAttachmentToWorkspaceResourceMock.mockResolvedValue({
      attachmentId: "att_1",
      fileExtension: "txt",
      filename: "file.txt",
      mediaType: "text/plain",
      size: 5,
      uploadedAt: "2026-01-01T00:00:00.000Z",
    });
    const db = makeDb({ childrenByParent: {} });
    const api = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
    const reservations = [
      { commit: vi.fn(), rollback: vi.fn() },
      { commit: vi.fn(), rollback: vi.fn() },
    ];
    const reserveResourceCapacity = vi
      .fn()
      .mockResolvedValueOnce(reservations[0])
      .mockResolvedValueOnce(reservations[1]);
    const actions = bindActions(db, {
      api: api as never,
      reserveResourceCapacity,
    });

    const result = await actions.createResource("root", {
      createInWorkspace: async ({
        createResource,
        uploadFile,
      }: ResourceCreationContext) => {
        let first = null;
        for (const file of files) {
          const resource = await createResource({ name: file.name });
          await uploadFile({ file, storage: resource.storage.content! });
          first ??= resource;
        }
        return first;
      },
      icon: {},
      name: "File",
      resourceTypeId: "lunaris.file",
      schema: { currentVersion: 1 },
      storage: { content: { kind: "file" } },
    } as never);

    expect(result).toEqual({
      name: "first.txt",
      resourceId: "item_1",
      storage: { content: { kind: "file", storageId: "file:item_1" } },
    });
    expect(createWorkspaceResourceMock).toHaveBeenCalledTimes(2);
    expect(uploadFileAttachmentToWorkspaceResourceMock).toHaveBeenCalledTimes(
      2
    );
    expect(reserveResourceCapacity).toHaveBeenCalledTimes(2);
    expect(reservations[0]!.commit).toHaveBeenCalledOnce();
    expect(reservations[1]!.commit).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_created", {
      count: 2,
      resourceTypeId: "lunaris.file",
      type: "custom",
    });
  });
});

describe("createBoundActions.duplicateResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWorkspaceResourceMock.mockReset();
  });

  it("clones document content and preserves item placement metadata", async () => {
    const sourceDoc = new Doc();
    sourceDoc.getMap("content").set("title", "Original");
    getYjsDocumentUpdatesMock.mockResolvedValue([
      { update_b64: toBase64(encodeStateAsUpdateV2(sourceDoc)) },
    ]);
    getResourceStorageSlotsMock.mockResolvedValue([
      {
        backing_id: "yjs_source",
        id: "storage_source",
        kind: "yjs",
        name: "content",
      },
    ]);
    const db = makeDb({ childrenByParent: {} });
    const reservation = { commit: vi.fn(), rollback: vi.fn() };
    const actions = bindActions(db, {
      getResourcesMap: () =>
        makeItemsMap([
          {
            icon: "custom-icon",
            id: "item_source",
            name: "Document",
            parent_id: "folder_1",
            resource_type_id: "lunaris.rich-text",
          },
        ]),
      reserveResourceCapacity: vi.fn().mockResolvedValue(reservation),
    });

    await actions.duplicateResource("item_source", {
      copyLabel: "(Copy)",
      trigger: "context-menu",
      untitledLabel: "Untitled",
    });

    expect(getYjsDocumentUpdatesMock).toHaveBeenCalledWith(db, "yjs_source");
    expect(createWorkspaceResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        icon: "custom-icon",
        name: "Document (Copy)",
        parentId: "folder_1",
        resourceTypeId: "lunaris.rich-text",
        workspaceId: "workspace_1",
      })
    );

    const initializeDocument = createWorkspaceResourceMock.mock.calls[0]?.[0]
      ?.storage?.content?.initialize as ((doc: Doc) => void) | undefined;
    const duplicateDoc = new Doc();
    initializeDocument?.(duplicateDoc);

    expect(duplicateDoc.getMap("content").get("title")).toBe("Original");
    expect(reservation.commit).toHaveBeenCalledOnce();
    expect(reservation.rollback).not.toHaveBeenCalled();
    expect(captureMock).toHaveBeenCalledWith("explorer_resource_duplicated", {
      resourceTypeId: "lunaris.rich-text",
      trigger: "context-menu",
    });
    sourceDoc.destroy();
    duplicateDoc.destroy();
  });

  it("ignores items without Yjs documents", async () => {
    const reserveResourceCapacity = vi.fn(allowResourceCapacity);
    const actions = bindActions(makeDb({ childrenByParent: {} }), {
      getResourcesMap: () => makeItemsMap([{ id: "folder" }]),
      reserveResourceCapacity,
    });

    await expect(
      actions.duplicateResource("folder", {
        copyLabel: "(Copy)",
        trigger: "clipboard",
        untitledLabel: "Untitled",
      })
    ).resolves.toBeUndefined();

    expect(reserveResourceCapacity).not.toHaveBeenCalled();
    expect(getYjsDocumentUpdatesMock).not.toHaveBeenCalled();
    expect(createWorkspaceResourceMock).not.toHaveBeenCalled();
  });
});
