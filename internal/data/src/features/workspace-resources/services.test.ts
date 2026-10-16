vi.mock("../activity/services", () => ({
  recordActivity: vi.fn().mockResolvedValue(undefined),
}));
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { describe, expect, it, vi } from "vitest";
import {
  compareAndSetWorkspaceResourceVersion,
  createWorkspaceFolder,
  createWorkspaceResource,
  getWorkspaceResourceChildren,
  getWorkspaceResourceDescendants,
  getWorkspaceResourcesSyncStreams,
  getOrganizationWorkspaceResourceUsage,
  useWorkspaceResourcesQuery,
  useWorkspaceResourcesSuspenseQuery,
} from "./services";

vi.mock("@powersync/react", () => ({
  useQuery: vi.fn(() => ({ data: [] })),
  useSuspenseQuery: vi.fn(() => ({ data: [] })),
}));

vi.mock("../workspaces/services", () => ({
  resolveWorkspaceVisibility: vi
    .fn()
    .mockResolvedValue(WORKSPACE_VISIBILITY.shared),
  WORKSPACE_INDEX_SYNC_STREAMS: [
    { name: "workspace_index", waitForStream: true },
  ],
}));

const { useQuery, useSuspenseQuery } = await import("@powersync/react");

describe("workspace resource SQL helpers", () => {
  it("counts shared and local items across an organization", async () => {
    const db = {
      getOptional: vi.fn().mockResolvedValue({
        local_count: 25,
        synced_count: 18,
      }),
    };

    await expect(
      getOrganizationWorkspaceResourceUsage({
        db: db as never,
        organizationId: "organization-1",
      })
    ).resolves.toEqual({ localCount: 25, syncedCount: 18 });
    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringMatching(
        /workspace_resources[\s\S]+local_workspace_resources[\s\S]+workspaces[\s\S]+local_workspaces/
      ),
      ["organization-1", "organization-1"]
    );
  });

  it("uses IS NULL when calculating root item position", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ max_pos: 4 }),
    };

    await createWorkspaceResource({
      db: db as never,
      name: "Doc",
      parentId: null,
      workspaceId: "workspace_1",
      resourceTypeId: "lunaris.rich-text",
      storage: {},
    });

    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("parent_id IS NULL"),
      ["workspace_1"]
    );
    expect(db.getOptional.mock.calls[0]?.[0]).toContain(
      "SELECT id, position, workspace_id, parent_id"
    );
    const insert = db.execute.mock.calls.find(([query]) =>
      String(query).includes("workspace_resources")
    );
    expect(insert?.[1]?.[4]).toBe(5);
  });

  it("atomically initializes a content item Yjs document", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ max_pos: null }),
    };
    const initializeResource = vi.fn((doc, context) => {
      doc.getMap("task").set("createdById", context.userId ?? "");
    });

    const result = await createWorkspaceResource({
      db: db as never,
      name: "Task",
      parentId: "board-1",
      resourceTypeId: "lunaris.kanban.task",
      workspaceId: "workspace_1",
      storage: { content: { kind: "yjs", initialize: initializeResource } },
      userId: "user-7",
    });

    expect(result.storage.content).toMatchObject({ kind: "yjs" });
    expect(initializeResource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceId: result.id,
        parentId: "board-1",
        userId: "user-7",
      })
    );
    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("yjs_documents")
      )
    ).toBe(true);
    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("workspace_storage_slots")
      )
    ).toBe(true);
    const update = db.execute.mock.calls.find(([query]) =>
      String(query).includes("yjs_document_updates")
    );
    expect(update?.[1]?.[3]).toBe("user-7");
  });

  it("creates mixed named slots and initial values in one transaction", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ max_pos: null }),
    };

    const result = await createWorkspaceResource({
      db: db as never,
      name: "Report",
      parentId: null,
      workspaceId: "workspace_1",
      resourceTypeId: "acme.report",
      storage: {
        content: {
          kind: "yjs",
          initialize: (doc) => doc.getText("body").insert(0, "Hi"),
        },
        cover: { kind: "file" },
        settings: { kind: "key-value", initialize: () => ({ theme: "paper" }) },
      },
    });

    expect(result.storage).toMatchObject({
      content: { kind: "yjs" },
      cover: { kind: "file" },
      settings: { kind: "key-value" },
    });
    expect(
      db.execute.mock.calls.filter(([sql]) =>
        String(sql).includes("workspace_storage_slots")
      )
    ).toHaveLength(3);
    expect(
      db.execute.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes("workspace_storage_values") &&
          values?.includes("theme")
      )
    ).toBe(true);
  });

  it("mutates a resource payload only after winning the version compare-and-set", async () => {
    const mutatePayload = vi.fn();
    const db = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };

    await expect(
      compareAndSetWorkspaceResourceVersion({
        db: db as never,
        expectedVersion: 1,
        mutatePayload,
        nextVersion: 2,
        workspaceId: "workspace_1",
        resourceId: "res_1",
      })
    ).resolves.toBe(true);
    expect(mutatePayload).toHaveBeenCalledWith(db);
  });

  it("does not mutate a resource payload after losing the version compare-and-set", async () => {
    const mutatePayload = vi.fn();
    const db = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
    };

    await expect(
      compareAndSetWorkspaceResourceVersion({
        db: db as never,
        expectedVersion: 1,
        mutatePayload,
        nextVersion: 2,
        workspaceId: "workspace_1",
        resourceId: "res_1",
      })
    ).resolves.toBe(false);
    expect(mutatePayload).not.toHaveBeenCalled();
  });

  it("awaits sandbox initialization before encoding the document", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ max_pos: null }),
    };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const initializeResource = vi.fn(async (doc) => {
      await gate;
      doc.getMap("sandbox").set("ready", true);
    });

    const creation = createWorkspaceResource({
      db: db as never,
      name: "Sandboxed",
      parentId: null,
      resourceTypeId: "example.sandbox",
      workspaceId: "workspace_1",
      storage: { content: { kind: "yjs", initialize: initializeResource } },
    });
    await vi.waitFor(() => expect(initializeResource).toHaveBeenCalledOnce());
    expect(db.execute).toHaveBeenCalledTimes(3);
    release();
    await creation;
    expect(db.execute).toHaveBeenCalledTimes(4);
  });

  it("atomically creates the Yjs document row without an initializer", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ max_pos: null }),
    };

    await createWorkspaceResource({
      db: db as never,
      name: "Document",
      parentId: null,
      resourceTypeId: "lunaris.rich-text",
      workspaceId: "workspace_1",
      storage: { content: { kind: "yjs" } },
    });

    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("yjs_documents")
      )
    ).toBe(true);
    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("workspace_storage_slots")
      )
    ).toBe(true);
  });

  it("uses IS NULL when calculating root folder position", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ max_pos: 1 }),
    };

    await createWorkspaceFolder({
      db: db as never,
      name: "Folder",
      parentId: null,
      workspaceId: "workspace_1",
    });

    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("parent_id IS NULL"),
      ["workspace_1"]
    );
    expect(db.execute.mock.calls[0]?.[1]?.[0]).toMatch(/^res_/);
    expect(db.execute.mock.calls[0]?.[1]?.[4]).toBe(2);
  });

  it("loads root children with IS NULL and preserves ordering", async () => {
    const rows = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
    ];
    const db = {
      getAll: vi.fn().mockResolvedValue(rows),
    };

    const result = await getWorkspaceResourceChildren({
      db: db as never,
      parentId: null,
      workspaceId: "workspace_1",
    });

    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringMatching(
        /parent_id IS NULL[\s\S]+NOT EXISTS[\s\S]+ORDER BY position ASC, created_at ASC, id ASC/
      ),
      ["workspace_1"]
    );
    expect(result).toBe(rows);
  });

  it("uses stable tie-break ordering for workspace-wide queries", () => {
    useWorkspaceResourcesQuery("workspace_1");
    useWorkspaceResourcesSuspenseQuery("workspace_1");

    expect(useQuery).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY position ASC, created_at ASC, id ASC"),
      ["workspace_1"],
      undefined
    );
    expect(useSuspenseQuery).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY position ASC, created_at ASC, id ASC"),
      ["workspace_1"],
      undefined
    );
  });

  it("waits for the organization index before hierarchy queries", () => {
    expect(getWorkspaceResourcesSyncStreams()).toEqual([
      {
        name: "workspace_index",
        waitForStream: true,
      },
    ]);
  });

  it("uses stable tie-break ordering for descendant queries", async () => {
    const db = {
      getAll: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "b",
            parent_id: "root",
            position: 0,
            created_at: "2026-01-02",
          },
          {
            id: "a",
            parent_id: "root",
            position: 0,
            created_at: "2026-01-01",
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };

    const result = await getWorkspaceResourceDescendants({
      db: db as never,
      resourceId: "root",
      workspaceId: "workspace_1",
    });

    expect(db.getAll).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("ORDER BY position ASC, created_at ASC, id ASC"),
      ["workspace_1", "root"]
    );
    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
