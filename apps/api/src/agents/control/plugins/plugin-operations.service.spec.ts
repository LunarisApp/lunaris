import {
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { getRichTextDocument } from "@extension/rich-text/mcp-runtime-server";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
  Map as YMap,
} from "yjs";
import { BuiltInPluginOperationsService } from "./plugin-operations.service";

const selectOne = (rows: unknown[]) => ({
  from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
});

const selectOneForUpdate = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({
      for: () => ({ limit: () => Promise.resolve(rows) }),
    }),
  }),
});

const selectUpdates = () => ({
  from: () => ({
    where: () => ({ orderBy: () => Promise.resolve([]) }),
  }),
});

function createDocumentHarness(params: {
  documentId: string;
  resourceId: string;
  pluginId: string;
  revision: Date;
}) {
  let selectIndex = 0;
  const updates: Buffer[] = [];
  const selections = [
    selectOne([{ id: "workspace-1" }]),
    selectOneForUpdate([
      {
        id: params.resourceId,
        resourceTypeId: params.pluginId,
      },
    ]),
    selectOne([]),
    selectOne([{ backingId: params.documentId }]),
    selectOneForUpdate([
      { id: params.documentId, updatedAt: params.revision },
    ]),
  ];
  const select = mock(() => selections[selectIndex++] ?? selectUpdates());
  const tx = {
    insert: mock(() => ({
      values: mock((value: { updateData: Buffer }) => {
        updates.push(value.updateData);
        return Promise.resolve();
      }),
    })),
    select,
    update: mock(() => ({
      set: () => ({ where: () => Promise.resolve() }),
    })),
  };
  const service = new BuiltInPluginOperationsService(
    {
      db: {
        transaction: (run: (database: typeof tx) => Promise<unknown>) =>
          run(tx),
      },
    } as never,
    {} as never,
    {} as never,
  );
  return { service, updates };
}

describe("BuiltInPluginOperationsService", () => {
  it("does not expose Excalidraw scene procedures", () => {
    const { service } = createDocumentHarness({
      documentId: "unused",
      resourceId: "unused",
      pluginId: "lunaris.excalidraw",
      revision: new Date(),
    });

    expect(() =>
      service.execute({
        actorId: "user-1",
        input: { drawingId: "drawing-1" },
        operation: "get_scene",
        pluginId: "lunaris.excalidraw",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      }),
    ).toThrow("Built-in extension operation not found");
  });

  it("replaces a Rich Text document behind a document revision", async () => {
    const revision = new Date("2026-01-01T00:00:00.000Z");
    const { service, updates } = createDocumentHarness({
      documentId: "rich-text-document",
      resourceId: "item-1",
      pluginId: "lunaris.rich-text",
      revision,
    });

    const result = await service.execute({
      actorId: "user-1",
      input: {
        blocks: [
          { id: "title", type: "heading", content: "Release plan" },
          { id: "body", type: "paragraph", content: "Ship safely" },
        ],
        documentResourceId: "item-1",
        expectedRevision: revision.toISOString(),
      },
      operation: "update_document",
      pluginId: "lunaris.rich-text",
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });

    expect(result).toMatchObject({
      documentResourceId: "item-1",
      blocks: [
        expect.objectContaining({ id: "title", type: "heading" }),
        expect.objectContaining({ id: "body", type: "paragraph" }),
      ],
      markdown: expect.stringContaining("Release plan"),
    });
    expect(updates).toHaveLength(1);
    const doc = new Doc();
    applyUpdateV2(doc, updates[0]!);
    expect((await getRichTextDocument(doc)).blocks.map(({ id }) => id)).toEqual([
      "title",
      "body",
    ]);
    doc.destroy();
  });

  it("creates a Kanban task and board properties atomically", async () => {
    const board = {
      id: "board-1",
      resourceTypeId: "lunaris.kanban",
    };
    let selectIndex = 0;
    let boardUpdate: Buffer | undefined;
    const initialDoc = new Doc();
    const properties = initialDoc.getArray<YMap<unknown>>("properties");
    const status = new YMap<unknown>();
    status.set("id", "status");
    status.set("name", "Status");
    status.set("type", "select");
    status.set(
      "options",
      JSON.stringify([
        { color: "#f59e0b", id: "in-progress", name: "In Progress" },
      ]),
    );
    const assignees = new YMap<unknown>();
    assignees.set("id", "assignees");
    assignees.set("name", "Assignees");
    assignees.set("type", "people");
    properties.push([status, assignees]);
    const initialUpdate = Buffer.from(encodeStateAsUpdateV2(initialDoc));
    initialDoc.destroy();
    const select = mock(() => {
      selectIndex += 1;
      if (selectIndex === 1) {
        return {
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ id: "workspace-1" }]),
            }),
          }),
        };
      }
      if (selectIndex === 2) {
        return {
          from: () => ({
            where: () => ({
              for: () => ({
                limit: () => Promise.resolve([board]),
              }),
            }),
          }),
        };
      }
      if (selectIndex === 3) {
        return {
          from: () => ({
            where: () => ({ limit: () => Promise.resolve([]) }),
          }),
        };
      }
      if (selectIndex === 4) {
        return {
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ backingId: "board-document" }]),
            }),
          }),
        };
      }
      if (selectIndex === 5) {
        return {
          from: () => ({
            where: () => Promise.resolve([{ position: 2 }]),
          }),
        };
      }
      if (selectIndex === 6) {
        return {
          from: () => ({
            where: () => ({ limit: () => Promise.resolve([]) }),
          }),
        };
      }
      if (selectIndex === 7) {
        return {
          from: () => ({
            where: () => ({
              for: () => ({
                limit: () =>
                  Promise.resolve([{ id: "board-document" }]),
              }),
            }),
          }),
        };
      }
      if (selectIndex === 8) {
        return {
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve([{ updateData: initialUpdate }]),
            }),
          }),
        };
      }
      if (selectIndex === 9) {
        return {
          from: () => ({
            where: () => Promise.resolve([{ userId: "user-1" }]),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([]),
          }),
        }),
      };
    });
    const tx = {
      insert: mock(() => ({
        values: mock((value: { updateData?: Buffer }) => {
          if (value.updateData) {
            boardUpdate = value.updateData;
          }
          return Promise.resolve();
        }),
      })),
      select,
      update: mock(() => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      })),
    };
    const transaction = mock(
      (run: (database: typeof tx) => Promise<unknown>) => run(tx),
    );
    const createDocument = mock(() =>
      Promise.resolve({ id: "task-document" }),
    );
    const createResource = mock(() =>
      Promise.resolve({
        id: "task-1",
        name: "Ship it",
        position: 3,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const service = new BuiltInPluginOperationsService(
      { db: { transaction } } as never,
      { createWithDb: createResource } as never,
      { createWithDb: createDocument } as never,
    );

    await expect(
      service.execute({
        actorId: "user-1",
        input: {
          boardId: board.id,
          name: "Ship it",
          properties: {
            Assignees: ["user-1"],
            Status: "In Progress",
          },
        },
        operation: "create_task",
        pluginId: "lunaris.kanban",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      }),
    ).resolves.toEqual({
      boardId: board.id,
      name: "Ship it",
      position: 3,
      properties: {
        assignees: ["user-1"],
        status: "in-progress",
      },
      taskId: "task-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(createDocument).not.toHaveBeenCalled();
    expect(createResource).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        parentId: board.id,
        resourceTypeId: "lunaris.kanban.task",
        schemaVersion: 1,
        storage: { content: { kind: "yjs" } },
        position: 3,
      }),
      "workspace-1",
      "organization-1",
      "user-1",
    );
    expect(boardUpdate).toBeDefined();
    const doc = new Doc();
    applyUpdateV2(doc, boardUpdate!);
    expect(
      doc
        .getMap<YMap<unknown>>("taskAssignments")
        .get("task-1")
        ?.get("prop_status"),
    ).toBe("in-progress");
    expect(
      doc
        .getMap<YMap<unknown>>("taskAssignments")
        .get("task-1")
        ?.get("prop_assignees"),
    ).toEqual(["user-1"]);
    doc.destroy();
  });
});
