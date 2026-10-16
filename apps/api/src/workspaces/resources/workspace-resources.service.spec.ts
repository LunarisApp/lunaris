import { describe, expect, it, mock } from "bun:test";
import { WorkspaceResourcesService } from "./workspace-resources.service";

describe("WorkspaceResourcesService", () => {
  it("checks capacity and creates a resource without legacy references", async () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    let inserted: Record<string, unknown> = {};
    const returning = mock(() =>
      Promise.resolve([
        {
          ...inserted,
          createdAt: now,
          syncedCreatedAt: now,
          syncedUpdatedAt: now,
          updatedAt: now,
        },
      ])
    );
    const values = mock((value: Record<string, unknown>) => {
      inserted = value;
      return { returning };
    });
    const tx = {
      execute: mock(() => Promise.resolve()),
      insert: mock(() => ({ values })),
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([{ id: "workspace_1" }])),
          })),
        })),
      })),
    };
    const db = {
      ...tx,
      transaction: mock((callback: (value: typeof tx) => unknown) =>
        callback(tx)
      ),
    };
    const assertCanCreateResource = mock(() => Promise.resolve());
    const service = new WorkspaceResourcesService(
      { db } as never,
      { assertCanCreateResource } as never,
      {} as never
    );

    const result = await service.create(
      {
        name: "Document",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        storage: {},
      },
      "workspace_1",
      "org_1"
    );

    expect(assertCanCreateResource).toHaveBeenCalledWith(tx, "org_1");
    expect(tx.execute).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Document",
        resourceTypeId: "lunaris.rich-text",
        position: 0,
        workspaceId: "workspace_1",
      })
    );
    expect(result.id).toStartWith("res_");
    expect(result.storage).toEqual({});
    expect(db).not.toHaveProperty("yjsDocuments");
  });

  it("deletes file backings only after the database transaction commits", async () => {
    let committed = false;
    const tx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => Promise.resolve([{ id: "res_1" }])),
        })),
      })),
    };
    const database = {
      db: {
        transaction: mock(
          async (run: (value: typeof tx) => Promise<unknown>) => {
            const result = await run(tx);
            committed = true;
            return result;
          }
        ),
      },
    };
    const deleteFile = mock(() => {
      expect(committed).toBe(true);
      return Promise.resolve({ id: "file_1" });
    });
    const service = new WorkspaceResourcesService(
      database as never,
      {} as never,
      { deleteFile } as never
    );
    service.purgeWithDb = mock(() =>
      Promise.resolve({
        fileBackings: [{ backingId: "file_1", fileExtension: "txt" }],
        id: "res_1",
      })
    );

    const deletion = await database.db.transaction((value) =>
      service.purgeWithDb(
        value as never,
        "res_1",
        "workspace_1",
        "org_1",
        "user_1"
      )
    );
    await expect(
      service.finalizeDeletion(
        deletion as never,
        "workspace_1",
        "org_1",
        "user_1"
      )
    ).resolves.toEqual({ id: "res_1" });
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it("leaves failed file cleanup for GC after resource deletion commits", async () => {
    const service = new WorkspaceResourcesService(
      {} as never,
      {} as never,
      {
        deleteFile: mock(() =>
          Promise.reject(new Error("storage unavailable"))
        ),
      } as never
    );

    await expect(
      service.finalizeDeletion(
        {
          fileBackings: [{ backingId: "file_1", filename: "notes.txt" }],
          id: "res_1",
        },
        "workspace_1",
        "org_1",
        "user_1"
      )
    ).resolves.toEqual({ id: "res_1" });
  });
});
