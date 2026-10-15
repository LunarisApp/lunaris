import { organization } from "../../auth/auth.entity";
import { fileObjectsDb, storedFilesDb, uploadSessionsDb } from "../../files/file-storage.entity";
import { describe, expect, it, mock } from "bun:test";
import { permission } from "@repo/auth/permissions";
import { workspaceStorageSlotsHandler } from "./workspace-storage-slots.handler";
import { workspaceStorageValuesHandler } from "./workspace-storage-values.handler";

function database(...results: unknown[][]) {
  const queue = [...results];
  const nextQuery = () => {
    const rows = queue.shift() ?? [];
    return {
      limit: mock(() => Promise.resolve(rows)),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
  };
  const from = mock((table: unknown) => {
    if (table === organization) return { where: () => ({ for: async () => [] }) };
    if ([fileObjectsDb, storedFilesDb, uploadSessionsDb].includes(table as never)) return {
      where: async () => [], innerJoin: () => ({ where: async () => [] }),
    };
    return { innerJoin: mock(() => ({ where: mock(nextQuery) })), where: mock(nextQuery) };
  });
  return { select: mock(() => ({ from })) };
}

const baseSlot = {
  kind: "key-value",
  name: "preferences",
  pluginId: "acme.notes",
  workspaceId: "workspace-1",
  resourceId: null,
};

describe("workspaceStorageSlotsHandler", () => {
  it("accepts workspace-owned plugin key-value slots", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "storage-1",
        baseSlot,
        "org-1",
        "user-1",
      ),
    ).resolves.toBeUndefined();
    expect(workspaceStorageSlotsHandler.permissions).toEqual({
      DELETE: permission.content.delete,
      PATCH: permission.content.write,
      PUT: permission.content.write,
    });
  });

  it("rejects missing names and unsupported kinds", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "storage-1",
        { ...baseSlot, kind: "blob", name: "" },
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");
  });

  it("allows metadata only for file slots", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "storage-1",
        { ...baseSlot, metadata: "{}" },
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");
  });

  it("rejects resource slots with plugin namespaces", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "storage-1",
        { ...baseSlot, resourceId: "resource-1" },
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");
  });

  it("rejects resources outside the slot workspace", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }], []) as never,
        "PUT",
        "storage-1",
        {
          ...baseSlot,
          kind: "file",
          pluginId: null,
          resourceId: "resource-1",
        },
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");
  });

  it("validates Yjs backing documents against the workspace", async () => {
    const data = {
      ...baseSlot,
      backingId: "yjs-1",
      kind: "yjs",
      pluginId: null,
      resourceId: "resource-1",
    };
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }], [{ id: "resource-1" }], []) as never,
        "PUT",
        "storage-1",
        data,
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");

    await expect(
      workspaceStorageSlotsHandler.authorize(
        database(
          [{ id: "workspace-1" }],
          [{ id: "resource-1" }],
          [{ id: "yjs-1" }],
        ) as never,
        "PUT",
        "storage-1",
        data,
        "org-1",
        "user-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects backing objects on key-value slots", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "storage-1",
        { ...baseSlot, backingId: "unexpected" },
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");
  });

  it("validates PATCH metadata and backing changes after ownership", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database(
          [{ hasAccess: true }],
          [{ backingId: null, kind: "key-value", workspaceId: "workspace-1" }],
        ) as never,
        "PATCH",
        "storage-1",
        { metadata: "{}" },
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage slot");

    await expect(
      workspaceStorageSlotsHandler.authorize(
        database(
          [{ hasAccess: true }],
          [{ backingId: "yjs-old", kind: "yjs", workspaceId: "workspace-1" }],
          [{ id: "yjs-new" }],
        ) as never,
        "PATCH",
        "storage-1",
        { backingId: "yjs-new" },
        "org-1",
        "user-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("allows idempotent DELETE after ownership lookup", async () => {
    await expect(
      workspaceStorageSlotsHandler.authorize(
        database([]) as never,
        "DELETE",
        "missing",
        undefined,
        "org-1",
        "user-1",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("workspaceStorageValuesHandler", () => {
  const value = {
    key: "theme",
    workspaceId: "workspace-1",
    storageId: "storage-1",
    value: '"dark"',
  };

  it("accepts values only for workspace-owned key-value storage", async () => {
    await expect(
      workspaceStorageValuesHandler.authorize(
        database([{ id: "workspace-1" }], [{ id: "storage-1" }]) as never,
        "PUT",
        "value-1",
        value,
        "org-1",
        "user-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects missing, cross-workspace, or non-key-value storage", async () => {
    await expect(
      workspaceStorageValuesHandler.authorize(
        database([{ id: "workspace-1" }], []) as never,
        "PUT",
        "value-1",
        value,
        "org-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid workspace storage value");
  });

  it("allows idempotent PATCH and DELETE ownership checks", async () => {
    for (const operation of ["PATCH", "DELETE"] as const) {
      await expect(
        workspaceStorageValuesHandler.authorize(
          database([]) as never,
          operation,
          "missing",
          undefined,
          "org-1",
          "user-1",
        ),
      ).resolves.toBeUndefined();
    }
  });
});
