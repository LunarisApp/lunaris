import { describe, expect, it, mock } from "bun:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
  encodeStateVector,
} from "yjs";
import { yjsDocumentsDb, yjsDocumentUpdatesDb } from "./yjs.entity";
import { YjsDocumentsService } from "./yjs-documents.service";

const now = new Date("2026-07-21T12:00:00.000Z");

function documentRow() {
  return {
    createdAt: now,
    id: "yjs_1",
    workspaceId: "workspace_1",
    syncedCreatedAt: now,
    syncedUpdatedAt: now,
    updatedAt: now,
  };
}

function updateB64(text: string) {
  const doc = new Doc();
  doc.getText("content").insert(0, text);
  const value = Buffer.from(encodeStateAsUpdateV2(doc)).toString("base64");
  doc.destroy();
  return value;
}

function documentQuery(
  rows = [documentRow()],
  lock = mock(() => Promise.resolve(rows)),
) {
  return {
    from: mock(() => ({
      innerJoin: mock(() => ({
        where: mock(() => ({
          limit: mock(() => ({
            for: lock,
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve),
          })),
        })),
      })),
    })),
  };
}

describe("YjsDocumentsService", () => {
  it("hides missing or out-of-scope document IDs behind 404", async () => {
    const service = new YjsDocumentsService({
      db: { select: mock(() => documentQuery([])) },
    } as never);

    await expect(
      service.get("foreign_yjs", "workspace_1", "org_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("atomically creates initialized documents with server-owned update fields", async () => {
    const inserted: Array<{
      table: unknown;
      value: Record<string, unknown>;
    }> = [];
    const tx = {
      insert: mock((table: unknown) => ({
        values: mock((value: Record<string, unknown>) => {
          inserted.push({ table, value });
          return table === yjsDocumentsDb
            ? { returning: mock(() => Promise.resolve([documentRow()])) }
            : Promise.resolve();
        }),
      })),
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([{ id: "workspace_1" }])),
          })),
        })),
      })),
    };
    const service = new YjsDocumentsService({
      db: {
        transaction: mock((callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as never);

    const result = await service.create(
      { initialUpdateB64: updateB64("hello") },
      "workspace_1",
      "org_1",
      "user_1",
    );

    expect(result).toEqual({
      createdAt: now.toISOString(),
      id: "yjs_1",
      workspaceId: "workspace_1",
      updatedAt: now.toISOString(),
    });
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toEqual({
      table: yjsDocumentUpdatesDb,
      value: expect.objectContaining({
        documentId: "yjs_1",
        workspaceId: "workspace_1",
        updateData: expect.any(Buffer),
        userId: "user_1",
      }),
    });
  });

  it("appends attributed updates and bumps document timestamps", async () => {
    let inserted: Record<string, unknown> = {};
    let updated: Record<string, unknown> = {};
    const lock = mock(() => Promise.resolve([documentRow()]));
    const tx = {
      insert: mock(() => ({
        values: mock((value: Record<string, unknown>) => {
          inserted = value;
          return {
            returning: mock(() =>
              Promise.resolve([
                {
                  createdAt: now,
                  documentId: "yjs_1",
                  id: "update_1",
                },
              ]),
            ),
          };
        }),
      })),
      select: mock(() => documentQuery([documentRow()], lock)),
      update: mock(() => ({
        set: mock((value: Record<string, unknown>) => {
          updated = value;
          return { where: mock(() => Promise.resolve()) };
        }),
      })),
    };
    const service = new YjsDocumentsService({
      db: {
        transaction: mock((callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as never);

    const result = await service.appendUpdate({
      documentId: "yjs_1",
      organizationId: "org_1",
      workspaceId: "workspace_1",
      updateB64: updateB64("hello"),
      userId: "user_1",
    });

    expect(inserted).toEqual(
      expect.objectContaining({
        documentId: "yjs_1",
        workspaceId: "workspace_1",
        updateData: expect.any(Buffer),
        userId: "user_1",
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        syncedUpdatedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(result).toEqual({
      createdAt: now.toISOString(),
      documentId: "yjs_1",
      id: "update_1",
    });
    expect(lock).toHaveBeenCalledWith("update", { of: yjsDocumentsDb });
  });

  it("returns full state and state-vector differences", async () => {
    const server = new Doc();
    server.getText("content").insert(0, "hello");
    const firstUpdate = Buffer.from(encodeStateAsUpdateV2(server));
    const client = new Doc();
    applyUpdateV2(client, firstUpdate);
    server.getText("content").insert(5, " world");
    const secondUpdate = Buffer.from(encodeStateAsUpdateV2(server));

    const tx = {
      select: mock((selection: Record<string, unknown>) => {
        if (Object.keys(selection).length === 1 && "updateData" in selection) {
          return {
            from: mock(() => ({
              where: mock(() => ({
                orderBy: mock(() =>
                  Promise.resolve([
                    { updateData: firstUpdate },
                    { updateData: secondUpdate },
                  ]),
                ),
              })),
            })),
          };
        }
        return documentQuery();
      }),
    };
    const transaction = mock(
      (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    const service = new YjsDocumentsService({
      db: { transaction },
    } as never);

    const full = await service.getState({
      documentId: "yjs_1",
      organizationId: "org_1",
      workspaceId: "workspace_1",
    });
    const restored = new Doc();
    applyUpdateV2(restored, Buffer.from(full.updateB64, "base64"));
    expect(restored.getText("content").toString()).toBe("hello world");

    const diff = await service.getState({
      documentId: "yjs_1",
      organizationId: "org_1",
      workspaceId: "workspace_1",
      stateVectorB64: Buffer.from(encodeStateVector(client)).toString("base64"),
    });
    applyUpdateV2(client, Buffer.from(diff.updateB64, "base64"));
    expect(client.getText("content").toString()).toBe("hello world");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });

    restored.destroy();
    client.destroy();
    server.destroy();
  });

  it("returns a read-only JSON workspaceion of current shared values", async () => {
    const source = new Doc();
    source.getMap("task").set("description", "Draft");
    source.getMap("assets").set("payload", new Uint8Array([1, 2, 3]));
    const updateData = Buffer.from(encodeStateAsUpdateV2(source));
    const tx = {
      select: mock((selection: Record<string, unknown>) => {
        if (Object.keys(selection).length === 1 && "updateData" in selection) {
          return {
            from: mock(() => ({
              where: mock(() => ({
                orderBy: mock(() => Promise.resolve([{ updateData }])),
              })),
            })),
          };
        }
        return documentQuery();
      }),
    };
    const service = new YjsDocumentsService({
      db: {
        transaction: mock((callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as never);

    await expect(
      service.getJson("yjs_1", "workspace_1", "org_1"),
    ).resolves.toEqual({
      data: {
        assets: { payload: { $binaryB64: "AQID" } },
        task: { description: "Draft" },
      },
      documentId: "yjs_1",
      updatedAt: now.toISOString(),
    });
    source.destroy();
  });

  it("rejects deletion while a workspace resource references the document", async () => {
    let selectCall = 0;
    const tx = {
      execute: mock(() => Promise.resolve()),
      select: mock(() => {
        selectCall += 1;
        if (selectCall === 1) return documentQuery();
        return {
          from: mock(() => ({
            where: mock(() => ({
              for: mock(() => ({
                limit: mock(() => Promise.resolve([{ id: "item_1" }])),
              })),
            })),
          })),
        };
      }),
    };
    const service = new YjsDocumentsService({
      db: {
        transaction: mock((callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as never);

    await expect(
      service.delete("yjs_1", "workspace_1", "org_1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("deletes unreferenced documents", async () => {
    let selectCall = 0;
    const tx = {
      delete: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([{ id: "yjs_1" }])),
        })),
      })),
      execute: mock(() => Promise.resolve()),
      select: mock(() => {
        selectCall += 1;
        if (selectCall === 1) return documentQuery();
        return {
          from: mock(() => ({
            where: mock(() => ({
              for: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
          })),
        };
      }),
    };
    const service = new YjsDocumentsService({
      db: {
        transaction: mock((callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as never);

    await expect(
      service.delete("yjs_1", "workspace_1", "org_1"),
    ).resolves.toEqual({ id: "yjs_1" });
    expect(tx.delete).toHaveBeenCalledWith(yjsDocumentsDb);
  });
});
