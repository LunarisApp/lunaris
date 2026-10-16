import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, getTableColumns, gt, lt, or } from "drizzle-orm";
import { encodeStateAsUpdateV2, encodeStateVector } from "yjs";
import { workspaceStorageSlotsDb } from "../workspaces/storage/workspace-storage.entity";
import { workspacesDb } from "../workspaces/core/workspaces.entity";
import { decodeCursor, toPage } from "@app/utils/pagination";
import {
  assertWorkspaceAccess,
  workspaceAccessCondition,
} from "../workspaces/core/workspace-access";
import { yjsDocumentsDb, yjsDocumentUpdatesDb } from "./yjs.entity";
import {
  decodeYjsStateVector,
  decodeYjsUpdateV2,
  workspaceYjsDocumentJson,
  reconstructYjsDocument,
} from "./yjs-document-state";
import {
  type CreateYjsDocumentInput,
  yjsDocumentCursorSchema,
} from "./yjs-documents.schema";

type YjsDocumentRow = typeof yjsDocumentsDb.$inferSelect;

type FindDocumentParams = {
  access?: "read" | "write";
  db: DatabaseOrTx;
  documentId: string;
  lock?: boolean;
  organizationId: string;
  workspaceId: string;
  userId?: string;
};

@Injectable()
export class YjsDocumentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(params: {
    cursor?: string;
    limit: number;
    organizationId: string;
    workspaceId: string;
    userId?: string;
  }) {
    await assertWorkspaceAccess(
      this.database.db,
      params.workspaceId,
      params.organizationId,
      params.userId
    );
    const cursor = decodeCursor(params.cursor, yjsDocumentCursorSchema.parse);
    const cursorDate = cursor ? new Date(cursor.updatedAt) : undefined;
    const filters = [
      eq(yjsDocumentsDb.workspaceId, params.workspaceId),
      workspaceAccessCondition(params.organizationId, params.userId),
    ];
    if (cursor && cursorDate) {
      filters.push(
        or(
          lt(yjsDocumentsDb.updatedAt, cursorDate),
          and(
            eq(yjsDocumentsDb.updatedAt, cursorDate),
            gt(yjsDocumentsDb.id, cursor.id)
          )
        )!
      );
    }

    const rows = await this.database.db
      .select(getTableColumns(yjsDocumentsDb))
      .from(yjsDocumentsDb)
      .innerJoin(workspacesDb, eq(yjsDocumentsDb.workspaceId, workspacesDb.id))
      .where(and(...filters))
      .orderBy(desc(yjsDocumentsDb.updatedAt), asc(yjsDocumentsDb.id))
      .limit(params.limit + 1);

    return toPage({
      encode: (row: YjsDocumentRow) => ({
        id: row.id,
        updatedAt: row.updatedAt.toISOString(),
      }),
      limit: params.limit,
      map: toYjsDocumentDto,
      rows,
    });
  }

  async create(
    input: CreateYjsDocumentInput,
    workspaceId: string,
    organizationId: string,
    userId: string
  ) {
    return this.database.db.transaction((tx) =>
      this.createWithDb(tx, input, workspaceId, organizationId, userId)
    );
  }

  async createWithDb(
    db: DatabaseOrTx,
    input: CreateYjsDocumentInput,
    workspaceId: string,
    organizationId: string,
    userId: string
  ) {
    const initialUpdate = input.initialUpdateB64
      ? decodeYjsUpdateV2(input.initialUpdateB64)
      : undefined;
    await assertWorkspaceAccess(
      db,
      workspaceId,
      organizationId,
      userId,
      "write"
    );
    const now = new Date();
    const [document] = await db
      .insert(yjsDocumentsDb)
      .values({ createdAt: now, workspaceId, updatedAt: now })
      .returning();

    if (initialUpdate) {
      await db.insert(yjsDocumentUpdatesDb).values({
        createdAt: now,
        documentId: document!.id,
        workspaceId,
        updateData: initialUpdate,
        updatedAt: now,
        userId,
      });
    }

    return toYjsDocumentDto(document!);
  }

  async get(
    documentId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    const document = await this.find({
      db: this.database.db,
      documentId,
      organizationId,
      workspaceId,
      userId,
    });
    return toYjsDocumentDto(document);
  }

  async appendUpdate(params: {
    documentId: string;
    organizationId: string;
    workspaceId: string;
    updateB64: string;
    userId: string;
  }) {
    const updateData = decodeYjsUpdateV2(params.updateB64);

    return this.database.db.transaction(async (tx) => {
      await this.find({
        access: "write",
        db: tx,
        documentId: params.documentId,
        lock: true,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
      });
      const now = new Date();
      const [update] = await tx
        .insert(yjsDocumentUpdatesDb)
        .values({
          createdAt: now,
          documentId: params.documentId,
          workspaceId: params.workspaceId,
          updateData,
          updatedAt: now,
          userId: params.userId,
        })
        .returning({
          createdAt: yjsDocumentUpdatesDb.createdAt,
          documentId: yjsDocumentUpdatesDb.documentId,
          id: yjsDocumentUpdatesDb.id,
        });
      await tx
        .update(yjsDocumentsDb)
        .set({ syncedUpdatedAt: now, updatedAt: now })
        .where(
          and(
            eq(yjsDocumentsDb.id, params.documentId),
            eq(yjsDocumentsDb.workspaceId, params.workspaceId)
          )
        );

      return {
        createdAt: update!.createdAt.toISOString(),
        documentId: update!.documentId,
        id: update!.id,
      };
    });
  }

  async getState(params: {
    documentId: string;
    organizationId: string;
    workspaceId: string;
    stateVectorB64?: string;
    userId?: string;
  }) {
    const clientStateVector = params.stateVectorB64
      ? decodeYjsStateVector(params.stateVectorB64)
      : undefined;
    const { document, updates } = await this.getSnapshot(params);
    const doc = reconstructYjsDocument(updates);
    try {
      return {
        documentId: document.id,
        encoding: "yjs-update-v2" as const,
        stateVectorB64: Buffer.from(encodeStateVector(doc)).toString("base64"),
        updateB64: Buffer.from(
          encodeStateAsUpdateV2(doc, clientStateVector)
        ).toString("base64"),
        updatedAt: document.updatedAt.toISOString(),
      };
    } finally {
      doc.destroy();
    }
  }

  async getJson(
    documentId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    const { document, updates } = await this.getSnapshot({
      documentId,
      organizationId,
      workspaceId,
      userId,
    });
    const doc = reconstructYjsDocument(updates);
    try {
      return {
        data: workspaceYjsDocumentJson(doc),
        documentId: document.id,
        updatedAt: document.updatedAt.toISOString(),
      };
    } finally {
      doc.destroy();
    }
  }

  async delete(
    documentId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    return this.database.db.transaction(async (tx) => {
      await this.find({
        access: "write",
        db: tx,
        documentId,
        lock: true,
        organizationId,
        workspaceId,
        userId,
      });
      const [reference] = await tx
        .select({ id: workspaceStorageSlotsDb.id })
        .from(workspaceStorageSlotsDb)
        .where(
          and(
            eq(workspaceStorageSlotsDb.workspaceId, workspaceId),
            eq(workspaceStorageSlotsDb.kind, "yjs"),
            eq(workspaceStorageSlotsDb.backingId, documentId)
          )
        )
        .for("update")
        .limit(1);
      if (reference) {
        throw new ConflictException(
          "Yjs document is referenced by a workspace resource"
        );
      }

      const [deleted] = await tx
        .delete(yjsDocumentsDb)
        .where(
          and(
            eq(yjsDocumentsDb.id, documentId),
            eq(yjsDocumentsDb.workspaceId, workspaceId)
          )
        )
        .returning({ id: yjsDocumentsDb.id });
      return deleted!;
    });
  }

  private async getSnapshot(params: {
    documentId: string;
    organizationId: string;
    workspaceId: string;
    userId?: string;
  }) {
    return this.database.db.transaction(
      async (tx) => {
        const document = await this.find({
          db: tx,
          documentId: params.documentId,
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          userId: params.userId,
        });
        const updates = await this.getUpdates(
          tx,
          params.documentId,
          params.workspaceId
        );
        return { document, updates };
      },
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );
  }

  private async getUpdates(
    db: DatabaseOrTx,
    documentId: string,
    workspaceId: string
  ) {
    return db
      .select({ updateData: yjsDocumentUpdatesDb.updateData })
      .from(yjsDocumentUpdatesDb)
      .where(
        and(
          eq(yjsDocumentUpdatesDb.documentId, documentId),
          eq(yjsDocumentUpdatesDb.workspaceId, workspaceId)
        )
      )
      .orderBy(
        asc(yjsDocumentUpdatesDb.createdAt),
        asc(yjsDocumentUpdatesDb.id)
      );
  }

  private async find(params: FindDocumentParams): Promise<YjsDocumentRow> {
    const query = params.db
      .select(getTableColumns(yjsDocumentsDb))
      .from(yjsDocumentsDb)
      .innerJoin(workspacesDb, eq(yjsDocumentsDb.workspaceId, workspacesDb.id))
      .where(
        and(
          eq(yjsDocumentsDb.id, params.documentId),
          eq(yjsDocumentsDb.workspaceId, params.workspaceId),
          workspaceAccessCondition(
            params.organizationId,
            params.userId,
            params.access
          )
        )
      )
      .limit(1);
    const rows = params.lock
      ? await query.for("update", { of: yjsDocumentsDb })
      : await query;
    const document = rows[0];
    if (!document) {
      throw new NotFoundException("Yjs document not found");
    }
    return document;
  }
}

export function toYjsDocumentDto(document: YjsDocumentRow) {
  return {
    createdAt: document.createdAt.toISOString(),
    id: document.id,
    workspaceId: document.workspaceId,
    updatedAt: document.updatedAt.toISOString(),
  };
}
