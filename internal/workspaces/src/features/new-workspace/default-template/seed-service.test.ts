/** @vitest-environment happy-dom */

import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdateV2, Doc, type Map as YMap } from "yjs";
import kanbanTemplate from "./assets/Examples/Kanban.json";
import {
  DEFAULT_TEMPLATE_ITEM_COUNT,
  seedDefaultTemplateWorkspace,
} from "./seed-service";

const {
  installWorkspaceExtensionMock,
  replaceWorkspaceExtensionsMock,
  createWorkspaceFolderMock,
  createWorkspaceResourceMock,
  createWorkspaceMock,
  insertYjsDocumentUpdateMock,
  getStorageSlotMock,
} = vi.hoisted(() => ({
  installWorkspaceExtensionMock: vi.fn(),
  replaceWorkspaceExtensionsMock: vi.fn(),
  createWorkspaceFolderMock: vi.fn(),
  createWorkspaceResourceMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
  insertYjsDocumentUpdateMock: vi.fn(),
  getStorageSlotMock: vi.fn(),
}));

vi.mock("@repo/data/features/workspace-extensions", () => ({
  createWorkspaceExtensionsService: () => ({
    install: installWorkspaceExtensionMock,
  }),
  DEFAULT_EXCALIDRAW_EXTENSION: {
    descriptor: null,
    registryId: "lunaris-official",
    version: "0.0.1",
  },
  replaceWorkspaceExtensions: replaceWorkspaceExtensionsMock,
}));

vi.mock("@repo/data/features/workspace-resources", () => ({
  createWorkspaceFolder: createWorkspaceFolderMock,
  createWorkspaceResource: createWorkspaceResourceMock,
}));

vi.mock("@repo/data/features/workspaces", () => ({
  createWorkspace: createWorkspaceMock,
}));

vi.mock("@repo/data/features/yjs", () => ({
  b64ToUint8Array: decodeBase64,
  insertYjsDocumentUpdate: insertYjsDocumentUpdateMock,
}));

vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  getStorageSlot: getStorageSlotMock,
}));

vi.mock("evlog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("evlog")>()),
  log: { info: vi.fn() },
}));

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  createWorkspaceMock.mockResolvedValue("workspace_1");
  createWorkspaceFolderMock.mockResolvedValue("folder_examples");
  createWorkspaceResourceMock
    .mockResolvedValueOnce({ id: "item_welcome", storage: { content: { kind: "yjs", storageId: "storage_welcome" } } })
    .mockResolvedValueOnce({ id: "item_document", storage: { content: { kind: "yjs", storageId: "storage_document" } } })
    .mockResolvedValueOnce({ id: "item_kanban", storage: { content: { kind: "yjs", storageId: "storage_kanban" } } });
  for (const [index] of kanbanTemplate.items.entries()) {
    createWorkspaceResourceMock.mockResolvedValueOnce({
      id: `item_task_${index}`,
      storage: { content: { kind: "yjs", storageId: `storage_task_${index}` } },
    });
  }
  createWorkspaceResourceMock.mockResolvedValueOnce({
    id: "item_excalidraw",
    storage: { content: { kind: "yjs", storageId: "storage_excalidraw" } },
  });
  getStorageSlotMock.mockResolvedValue({
    backing_id: "yjs_kanban",
    kind: "yjs",
  });
  replaceWorkspaceExtensionsMock.mockResolvedValue(undefined);
  installWorkspaceExtensionMock.mockResolvedValue(undefined);
  insertYjsDocumentUpdateMock.mockResolvedValue(undefined);
});

describe("seedDefaultTemplateWorkspace", () => {
  it("creates local template workspace with expected structure and plugins", async () => {
    const resourceCapacityReservation = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    await seedDefaultTemplateWorkspace({
      db: {} as never,
      resourceCapacityReservation,
      organizationId: "org_1",
    });

    expect(createWorkspaceMock).toHaveBeenCalledWith({
      db: {},
      name: "Welcome to Lunaris",
      organizationId: "org_1",
      slug: "welcome",
      visibility: WORKSPACE_VISIBILITY.local,
    });
    expect(replaceWorkspaceExtensionsMock).toHaveBeenCalledWith({
      db: {},
      enabledExtensionIds: [
        "lunaris.rich-text",
        "lunaris.kanban",
      ],
      workspaceId: "workspace_1",
    });
    expect(installWorkspaceExtensionMock).toHaveBeenCalledWith(
      "lunaris.excalidraw",
      expect.objectContaining({
        registryId: "lunaris-official",
        version: "0.0.1",
      }),
      expect.objectContaining({
        defaultExtensionIds: ["lunaris.rich-text", "lunaris.kanban"],
      }),
    );
    expect(DEFAULT_TEMPLATE_ITEM_COUNT).toBe(5 + kanbanTemplate.items.length);
    expect(createWorkspaceFolderMock).toHaveBeenCalledTimes(1);
    expect(createWorkspaceResourceMock).toHaveBeenCalledTimes(14);
    expect(createWorkspaceFolderMock).toHaveBeenCalledWith({
      db: {},
      name: "Product Launch Example",
      parentId: null,
      position: 1,
      workspaceId: "workspace_1",
    });
    expect(createWorkspaceResourceMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "Welcome",
        parentId: null,
        resourceTypeId: "lunaris.rich-text",
        position: 0,
      })
    );
    expect(createWorkspaceResourceMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "Workspace Brief",
        parentId: "folder_examples",
        resourceTypeId: "lunaris.rich-text",
        position: 0,
      })
    );
    expect(createWorkspaceResourceMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        name: "Launch Plan",
        parentId: "folder_examples",
        resourceTypeId: "lunaris.kanban",
        position: 1,
      })
    );
    for (const [position, task] of kanbanTemplate.items.entries()) {
      expect(createWorkspaceResourceMock).toHaveBeenNthCalledWith(
        position + 4,
        expect.objectContaining({
          name: task.name,
          parentId: "item_kanban",
          resourceTypeId: "lunaris.kanban.task",
          position,
        })
      );
    }
    expect(createWorkspaceResourceMock).toHaveBeenNthCalledWith(
      kanbanTemplate.items.length + 4,
      expect.objectContaining({
        name: "Launch Workflow",
        parentId: "folder_examples",
        resourceTypeId: "lunaris.excalidraw",
        position: 2,
      })
    );
    expect(insertYjsDocumentUpdateMock).toHaveBeenCalledTimes(1);
    for (const call of insertYjsDocumentUpdateMock.mock.calls) {
      expect(call[3]).toEqual(expect.any(String));
      expect(call[3].length).toBeGreaterThan(0);
    }
    const boardDoc = new Doc();
    const initializeBoard = createWorkspaceResourceMock.mock.calls[2]?.[0]
      ?.storage?.content?.initialize as ((doc: Doc) => void) | undefined;
    initializeBoard?.(boardDoc);
    for (const call of insertYjsDocumentUpdateMock.mock.calls.filter(
      (call) => call[1] === "yjs_kanban"
    )) {
      applyUpdateV2(boardDoc, decodeBase64(call[3]));
    }
    expect(boardDoc.getArray<YMap<string>>("properties")).toHaveLength(2);
    expect(boardDoc.getMap("taskAssignments").size).toBe(10);
    expect(
      boardDoc
        .getMap<YMap<string>>("taskAssignments")
        .get("item_task_0")
        ?.get("prop_status")
    ).toBe("done");

    for (const [index, task] of kanbanTemplate.items.entries()) {
      const initializeTask = createWorkspaceResourceMock.mock.calls[index + 3]?.[0]
        ?.storage?.content?.initialize as ((doc: Doc) => void) | undefined;
      expect(initializeTask).toBeTypeOf("function");
      const taskDoc = new Doc();
      initializeTask?.(taskDoc);
      expect(taskDoc.getMap("task").get("description")).toBe(task.description);
    }
    expect(resourceCapacityReservation.commit).toHaveBeenCalledWith();
    expect(resourceCapacityReservation.rollback).not.toHaveBeenCalled();
  });

  it("records partial item creation and releases unused capacity on failure", async () => {
    const error = new Error("document failed");
    const resourceCapacityReservation = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    createWorkspaceResourceMock.mockReset();
    createWorkspaceResourceMock
      .mockResolvedValueOnce({
        id: "item_welcome",
        storage: { content: { kind: "yjs", storageId: "storage_welcome" } },
      })
      .mockRejectedValueOnce(error);

    await expect(
      seedDefaultTemplateWorkspace({
        db: {} as never,
        resourceCapacityReservation,
        organizationId: "org_1",
      })
    ).rejects.toBe(error);

    expect(resourceCapacityReservation.commit).toHaveBeenCalledWith(2);
    expect(resourceCapacityReservation.rollback).toHaveBeenCalledOnce();
  });
});
