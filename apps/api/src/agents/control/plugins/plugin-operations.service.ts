import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
} from "@extension/kanban/constants";
import {
  type KanbanCreateTaskOutput,
  type KanbanGetBoardPropertiesOutput,
  type KanbanPropertyValue,
  type KanbanTaskProperties,
  type KanbanUpdateTaskOutput,
  kanbanCreateTaskOperationInputSchema,
  kanbanGetBoardPropertiesOperationInputSchema,
  kanbanUpdateTaskOperationInputSchema,
} from "@extension/kanban/mcp-contract";
import {
  getKanbanBoardProperties,
  kanbanTaskPropertiesIncludePeople,
  KanbanMcpInputError,
  updateKanbanTaskProperties,
} from "@extension/kanban/mcp-runtime";
import { RICH_TEXT_PLUGIN_ID } from "@extension/rich-text/constants";
import { createId } from "@repo/utils";
import {
  type RichTextDocumentOutput,
  richTextGetDocumentOperationInputSchema,
  richTextReadMeOperationInputSchema,
  richTextUpdateDocumentOperationInputSchema,
} from "@extension/rich-text/mcp-contract";
import {
  getRichTextDocument,
  replaceRichTextDocument,
  RICH_TEXT_BLOCK_GUIDE,
  RichTextMcpInputError,
} from "@extension/rich-text/mcp-runtime-server";
import {
  and,
  asc,
  eq,
  max,
  notExists,
} from "drizzle-orm";
import {
  type Doc,
  encodeStateAsUpdateV2,
  encodeStateVector,
} from "yjs";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "../../../workspaces/resources/workspace-resources.entity";
import { workspaceStorageSlotsDb } from "../../../workspaces/storage/workspace-storage.entity";
import { member } from "../../../auth/auth.entity";
import { WorkspaceResourcesService } from "../../../workspaces/resources/workspace-resources.service";
import { assertWorkspaceAccess } from "../../../workspaces/core/workspace-access";
import {
  yjsDocumentsDb,
  yjsDocumentUpdatesDb,
} from "../../../yjs/yjs.entity";
import { reconstructYjsDocument } from "../../../yjs/yjs-document-state";
import { YjsDocumentsService } from "../../../yjs/yjs-documents.service";

type PluginStorageResourceRow = typeof workspaceResourcesDb.$inferSelect & {
  yjsBackingId: string;
};

interface PluginOperationContext {
  actorId: string;
  input: Record<string, unknown>;
  organizationId: string;
  workspaceId: string;
}

interface PluginOperationParams extends PluginOperationContext {
  operation: string;
  pluginId: string;
}

interface PluginOperationInputSchema {
  safeParse(input: unknown): { success: boolean };
}

@Injectable()
export class BuiltInPluginOperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly items: WorkspaceResourcesService,
    private readonly yjs: YjsDocumentsService,
  ) {}

  execute(params: PluginOperationParams): Promise<unknown> {
    if (
      params.pluginId === KANBAN_PLUGIN_ID &&
      params.operation === "get_board_properties"
    ) {
      return this.getKanbanBoardProperties(params);
    }
    if (
      params.pluginId === KANBAN_PLUGIN_ID &&
      params.operation === "create_task"
    ) {
      return this.createKanbanTask(params);
    }
    if (
      params.pluginId === KANBAN_PLUGIN_ID &&
      params.operation === "update_task"
    ) {
      return this.updateKanbanTask(params);
    }
    if (
      params.pluginId === RICH_TEXT_PLUGIN_ID &&
      params.operation === "read_me"
    ) {
      return this.readGuide(
        params,
        richTextReadMeOperationInputSchema,
        RICH_TEXT_BLOCK_GUIDE,
        "Invalid Rich Text guide request",
      );
    }
    if (
      params.pluginId === RICH_TEXT_PLUGIN_ID &&
      params.operation === "get_document"
    ) {
      return this.getRichTextDocument(params);
    }
    if (
      params.pluginId === RICH_TEXT_PLUGIN_ID &&
      params.operation === "update_document"
    ) {
      return this.updateRichTextDocument(params);
    }
    throw new NotFoundException("Built-in extension operation not found");
  }

  private async getRichTextDocument(
    params: PluginOperationContext,
  ): Promise<RichTextDocumentOutput> {
    const parsed = richTextGetDocumentOperationInputSchema.safeParse(
      params.input,
    );
    if (!parsed.success) {
      throw new BadRequestException("Invalid Rich Text document request");
    }
    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        params.workspaceId,
        params.organizationId,
        params.actorId,
      );
      const item = await this.loadRichTextResource(
        tx,
        params.workspaceId,
        parsed.data.documentResourceId,
      );
      const { doc, updatedAt } = await this.loadRichTextDocument(
        tx,
        params.workspaceId,
        item.yjsBackingId,
      );
      try {
        return {
          documentResourceId: item.id,
          ...(await getRichTextDocument(doc)),
          revision: updatedAt.toISOString(),
        };
      } finally {
        doc.destroy();
      }
    });
  }

  private async updateRichTextDocument(
    params: PluginOperationContext,
  ): Promise<RichTextDocumentOutput> {
    const parsed = richTextUpdateDocumentOperationInputSchema.safeParse(
      params.input,
    );
    if (!parsed.success) {
      throw new BadRequestException("Invalid Rich Text document update");
    }
    const input = parsed.data;
    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        params.workspaceId,
        params.organizationId,
        params.actorId,
        "write",
      );
      const item = await this.loadRichTextResource(
        tx,
        params.workspaceId,
        input.documentResourceId,
        true,
      );
      const { doc, yjsBackingId, updatedAt } =
        await this.loadRichTextDocument(
          tx,
          params.workspaceId,
          item.yjsBackingId,
          true,
        );
      try {
        if (updatedAt.toISOString() !== input.expectedRevision) {
          throw new ConflictException("Rich Text document revision does not match");
        }
        const before = encodeStateVector(doc);
        const content = await this.replaceRichTextBlocks(doc, input.blocks);
        const now = new Date();
        await this.persistYjsUpdate(tx, {
          actorId: params.actorId,
          before,
          doc,
          yjsBackingId,
          workspaceId: params.workspaceId,
          updatedAt: now,
        });
        return {
          documentResourceId: item.id,
          ...content,
          revision: now.toISOString(),
        };
      } finally {
        doc.destroy();
      }
    });
  }

  private async readGuide(
    params: PluginOperationContext,
    schema: PluginOperationInputSchema,
    guide: string,
    invalidMessage: string,
  ) {
    if (!schema.safeParse(params.input).success) {
      throw new BadRequestException(invalidMessage);
    }
    await assertWorkspaceAccess(
      this.database.db,
      params.workspaceId,
      params.organizationId,
      params.actorId,
    );
    return { guide };
  }

  private async getKanbanBoardProperties(
    params: PluginOperationContext,
  ): Promise<KanbanGetBoardPropertiesOutput> {
    const parsed = kanbanGetBoardPropertiesOperationInputSchema.safeParse(
      params.input,
    );
    if (!parsed.success) {
      throw new BadRequestException("Invalid Kanban board property request");
    }

    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        params.workspaceId,
        params.organizationId,
        params.actorId,
      );
      const board = await this.loadKanbanBoard(
        tx,
        params.workspaceId,
        parsed.data.boardId,
      );
      const { doc } = await this.loadKanbanDocument(
        tx,
        params.workspaceId,
        board.yjsBackingId,
      );
      try {
        return {
          boardId: board.id,
          properties: getKanbanBoardProperties(doc),
        };
      } finally {
        doc.destroy();
      }
    });
  }

  private async createKanbanTask(
    params: PluginOperationContext,
  ): Promise<KanbanCreateTaskOutput> {
    const parsed = kanbanCreateTaskOperationInputSchema.safeParse(params.input);
    if (!parsed.success) {
      throw new BadRequestException("Invalid Kanban task creation");
    }
    const input = parsed.data;

    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        params.workspaceId,
        params.organizationId,
        params.actorId,
        "write",
      );
      const board = await this.loadKanbanBoard(
        tx,
        params.workspaceId,
        input.boardId,
        true,
      );
      let position = input.position;
      if (position === undefined) {
        const [placement] = await tx
          .select({ position: max(workspaceResourcesDb.position) })
          .from(workspaceResourcesDb)
          .where(
            and(
              eq(workspaceResourcesDb.workspaceId, params.workspaceId),
              eq(workspaceResourcesDb.parentId, board.id),
              notExists(
                tx
                  .select({ id: workspaceResourceTrashDb.id })
                  .from(workspaceResourceTrashDb)
                  .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id)),
              ),
            ),
          );
        position = (placement?.position ?? -1) + 1;
      }
      const task = await this.items.createWithDb(
        tx,
        {
          name: input.name,
          parentId: board.id,
          resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
          schemaVersion: 1,
          position,
          storage: { content: { kind: "yjs" } },
        },
        params.workspaceId,
        params.organizationId,
        params.actorId,
      );
      let properties: Record<string, KanbanPropertyValue> = {};
      if (input.properties && Object.keys(input.properties).length > 0) {
        const { doc, yjsBackingId } = await this.loadKanbanDocument(
          tx,
          params.workspaceId,
          board.yjsBackingId,
          true,
        );
        try {
          const before = encodeStateVector(doc);
          properties = this.updateTaskProperties(
            doc,
            task.id,
            input.properties,
            await this.getAllowedPersonIds(
              tx,
              params.organizationId,
              doc,
              input.properties,
            ),
          );
          const now = new Date();
          await this.persistYjsUpdate(tx, {
            actorId: params.actorId,
            before,
            doc,
            yjsBackingId,
            workspaceId: params.workspaceId,
            updatedAt: now,
          });
        } finally {
          doc.destroy();
        }
      }
      return {
        boardId: board.id,
        name: task.name,
        position: task.position,
        properties,
        taskId: task.id,
        updatedAt: task.updatedAt,
      };
    });
  }

  private async updateKanbanTask(
    params: PluginOperationContext,
  ): Promise<KanbanUpdateTaskOutput> {
    const parsed = kanbanUpdateTaskOperationInputSchema.safeParse(params.input);
    if (!parsed.success) {
      throw new BadRequestException("Invalid Kanban task update");
    }
    const input = parsed.data;
    const propertiesChanged = Object.keys(input.properties ?? {}).length > 0;
    if (!input.name && !propertiesChanged) {
      throw new BadRequestException(
        "Task update requires a name or at least one property",
      );
    }
    if (input.name && !input.expectedRevision) {
      throw new BadRequestException(
        "expectedRevision is required when changing the task name",
      );
    }

    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        params.workspaceId,
        params.organizationId,
        params.actorId,
        "write",
      );
      const board = await this.loadKanbanBoard(
        tx,
        params.workspaceId,
        input.boardId,
        true,
      );
      const [task] = await tx
        .select()
        .from(workspaceResourcesDb)
        .where(
          and(
            eq(workspaceResourcesDb.id, input.taskId),
            eq(workspaceResourcesDb.workspaceId, params.workspaceId),
            notExists(
              tx
                .select({ id: workspaceResourceTrashDb.id })
                .from(workspaceResourceTrashDb)
                .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id)),
            ),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !task ||
        task.resourceTypeId !== KANBAN_TASK_RESOURCE_TYPE_ID ||
        task.parentId !== board.id
      ) {
        throw new NotFoundException("Kanban task not found on this board");
      }
      if (
        input.expectedRevision &&
        task.updatedAt.toISOString() !== input.expectedRevision
      ) {
        throw new ConflictException("Task revision does not match");
      }

      const { doc, yjsBackingId } = await this.loadKanbanDocument(
        tx,
        params.workspaceId,
        board.yjsBackingId,
        true,
      );
      try {
        const before = encodeStateVector(doc);
        const properties = this.updateTaskProperties(
          doc,
          task.id,
          input.properties,
          await this.getAllowedPersonIds(
            tx,
            params.organizationId,
            doc,
            input.properties,
          ),
        );

        const now = new Date();
        if (propertiesChanged) {
          await this.persistYjsUpdate(tx, {
            actorId: params.actorId,
            before,
            doc,
            yjsBackingId,
            workspaceId: params.workspaceId,
            updatedAt: now,
          });
        }
        const [updated] = await tx
          .update(workspaceResourcesDb)
          .set({
            ...(input.name ? { name: input.name } : {}),
            syncedUpdatedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(workspaceResourcesDb.id, task.id),
              eq(workspaceResourcesDb.workspaceId, params.workspaceId),
            ),
          )
          .returning({
            name: workspaceResourcesDb.name,
            updatedAt: workspaceResourcesDb.updatedAt,
          });

        return {
          boardId: board.id,
          name: updated!.name,
          properties,
          taskId: task.id,
          updatedAt: updated!.updatedAt.toISOString(),
        };
      } finally {
        doc.destroy();
      }
    });
  }

  private async loadKanbanBoard(
    db: DatabaseOrTx,
    workspaceId: string,
    boardId: string,
    lock = false,
  ): Promise<PluginStorageResourceRow> {
    return this.loadPluginResource(
      db,
      workspaceId,
      boardId,
      KANBAN_PLUGIN_ID,
      "Kanban board not found",
      lock,
    );
  }

  private async loadRichTextResource(
    db: DatabaseOrTx,
    workspaceId: string,
    documentResourceId: string,
    lock = false,
  ): Promise<PluginStorageResourceRow> {
    return this.loadPluginResource(
      db,
      workspaceId,
      documentResourceId,
      RICH_TEXT_PLUGIN_ID,
      "Rich Text document not found",
      lock,
    );
  }

  private async loadPluginResource(
    db: DatabaseOrTx,
    workspaceId: string,
    resourceId: string,
    resourceTypeId: string,
    notFoundMessage: string,
    lock: boolean,
  ): Promise<PluginStorageResourceRow> {
    const query = db
      .select()
      .from(workspaceResourcesDb)
      .where(
        and(
          eq(workspaceResourcesDb.id, resourceId),
          eq(workspaceResourcesDb.workspaceId, workspaceId),
          notExists(
            db
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id)),
          ),
        ),
      );
    const [item] = await (lock ? query.for("update") : query).limit(1);
    if (!item || item.resourceTypeId !== resourceTypeId) {
      throw new NotFoundException(notFoundMessage);
    }
    const [content] = await db
      .select({ backingId: workspaceStorageSlotsDb.backingId })
      .from(workspaceStorageSlotsDb)
      .where(
        and(
          eq(workspaceStorageSlotsDb.workspaceId, workspaceId),
          eq(workspaceStorageSlotsDb.resourceId, resourceId),
          eq(workspaceStorageSlotsDb.name, "content"),
          eq(workspaceStorageSlotsDb.kind, "yjs"),
        ),
      )
      .limit(1);
    if (!content?.backingId) {
      throw new NotFoundException(notFoundMessage);
    }
    return { ...item, yjsBackingId: content.backingId };
  }

  private async loadKanbanDocument(
    db: DatabaseOrTx,
    workspaceId: string,
    yjsBackingId: string,
    lock = false,
  ) {
    return this.loadPluginDocument(
      db,
      workspaceId,
      yjsBackingId,
      "Kanban board document not found",
      lock,
    );
  }

  private async loadRichTextDocument(
    db: DatabaseOrTx,
    workspaceId: string,
    yjsBackingId: string,
    lock = false,
  ) {
    return this.loadPluginDocument(
      db,
      workspaceId,
      yjsBackingId,
      "Rich Text document content not found",
      lock,
    );
  }

  private async loadPluginDocument(
    db: DatabaseOrTx,
    workspaceId: string,
    yjsBackingId: string,
    notFoundMessage: string,
    lock: boolean,
  ) {
    const query = db
      .select({ id: yjsDocumentsDb.id, updatedAt: yjsDocumentsDb.updatedAt })
      .from(yjsDocumentsDb)
      .where(
        and(
          eq(yjsDocumentsDb.id, yjsBackingId),
          eq(yjsDocumentsDb.workspaceId, workspaceId),
        ),
      );
    const [document] = await (lock ? query.for("update") : query).limit(1);
    if (!document) {
      throw new NotFoundException(notFoundMessage);
    }
    const updates = await db
      .select({ updateData: yjsDocumentUpdatesDb.updateData })
      .from(yjsDocumentUpdatesDb)
      .where(
        and(
          eq(yjsDocumentUpdatesDb.documentId, document.id),
          eq(yjsDocumentUpdatesDb.workspaceId, workspaceId),
        ),
      )
      .orderBy(
        asc(yjsDocumentUpdatesDb.createdAt),
        asc(yjsDocumentUpdatesDb.id),
      );
    return {
      doc: reconstructYjsDocument(updates),
      yjsBackingId: document.id,
      updatedAt: document.updatedAt,
    };
  }

  private updateTaskProperties(
    doc: Doc,
    taskId: string,
    properties: KanbanTaskProperties | undefined,
    allowedPersonIds: ReadonlySet<string> | undefined,
  ): Record<string, KanbanPropertyValue> {
    try {
      return updateKanbanTaskProperties(doc, taskId, properties, {
        allowedPersonIds,
      });
    } catch (error) {
      if (error instanceof KanbanMcpInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async getOrganizationMemberIds(
    db: DatabaseOrTx,
    organizationId: string,
  ): Promise<Set<string>> {
    const rows = await db
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, organizationId));
    return new Set(rows.map(({ userId }) => userId));
  }

  private async getAllowedPersonIds(
    db: DatabaseOrTx,
    organizationId: string,
    doc: Doc,
    properties: KanbanTaskProperties | undefined,
  ): Promise<Set<string> | undefined> {
    return kanbanTaskPropertiesIncludePeople(doc, properties)
      ? this.getOrganizationMemberIds(db, organizationId)
      : undefined;
  }

  private async replaceRichTextBlocks(
    doc: Doc,
    blocks: Parameters<typeof replaceRichTextDocument>[1],
  ) {
    try {
      return await replaceRichTextDocument(doc, blocks);
    } catch (error) {
      if (error instanceof RichTextMcpInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async persistYjsUpdate(
    db: DatabaseOrTx,
    params: {
      actorId: string;
      before: Uint8Array;
      doc: Doc;
      yjsBackingId: string;
      workspaceId: string;
      updatedAt: Date;
    },
  ): Promise<void> {
    await db.insert(yjsDocumentUpdatesDb).values({
      createdAt: params.updatedAt,
      documentId: params.yjsBackingId,
      workspaceId: params.workspaceId,
      updateData: Buffer.from(encodeStateAsUpdateV2(params.doc, params.before)),
      updatedAt: params.updatedAt,
      userId: params.actorId,
    });
    await db
      .update(yjsDocumentsDb)
      .set({ syncedUpdatedAt: params.updatedAt, updatedAt: params.updatedAt })
      .where(eq(yjsDocumentsDb.id, params.yjsBackingId));
  }
}
