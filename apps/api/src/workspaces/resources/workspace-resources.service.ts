import {
  fileObjectsDb,
  storedFilesDb,
  uploadSessionsDb,
} from "../../files/file-storage.entity";
import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createId } from "@repo/utils";
import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  max,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { createLogger } from "evlog";
import { EntitlementsService } from "../../entitlements";
import { lockOrganizationCapacity } from "../../entitlements/seats/organization-capacity";
import { FilesService } from "../../files/files.service";
import { workspaceStorageSlotsDb } from "../storage/workspace-storage.entity";
import { workspacesDb } from "../core/workspaces.entity";
import { decodeCursor, toPage } from "@app/utils/pagination";
import { yjsDocumentsDb } from "../../yjs/yjs.entity";
import {
  assertWorkspaceAccess,
  workspaceAccessCondition,
} from "../core/workspace-access";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "./workspace-resources.entity";
import {
  type CreateWorkspaceResourceInput,
  type WorkspaceResourceDto,
  workspaceResourceCursorSchema,
  type UpdateWorkspaceResourceInput,
} from "./workspace-resources.schema";
import {
  assertValidWorkspaceResourceParent,
  getWorkspaceResource,
} from "./workspace-resources.validation";

type WorkspaceResourceRow = typeof workspaceResourcesDb.$inferSelect;
const RESOURCE_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
type StorageHandle = { kind: "file" | "key-value" | "yjs"; storageId: string };
type StorageHandles = Record<string, StorageHandle>;
interface FileBackingCleanup {
  backingId: string;
  fileExtension?: string;
  filename?: string;
}

export interface WorkspaceResourceDeletion {
  fileBackings: FileBackingCleanup[];
  id: string;
}

@Injectable()
export class WorkspaceResourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly files: FilesService
  ) {}

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
    const cursor = decodeCursor(
      params.cursor,
      workspaceResourceCursorSchema.parse
    );
    const cursorDate = cursor ? new Date(cursor.createdAt) : undefined;
    const filters = [
      eq(workspaceResourcesDb.workspaceId, params.workspaceId),
      workspaceAccessCondition(params.organizationId, params.userId),
      notExists(
        this.database.db
          .select({ id: workspaceResourceTrashDb.id })
          .from(workspaceResourceTrashDb)
          .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
      ),
    ];
    if (cursor && cursorDate) {
      filters.push(
        or(
          gt(workspaceResourcesDb.position, cursor.position),
          and(
            eq(workspaceResourcesDb.position, cursor.position),
            gt(workspaceResourcesDb.createdAt, cursorDate)
          ),
          and(
            eq(workspaceResourcesDb.position, cursor.position),
            eq(workspaceResourcesDb.createdAt, cursorDate),
            gt(workspaceResourcesDb.id, cursor.id)
          )
        )!
      );
    }

    const rows = await this.database.db
      .select(getTableColumns(workspaceResourcesDb))
      .from(workspaceResourcesDb)
      .innerJoin(
        workspacesDb,
        eq(workspaceResourcesDb.workspaceId, workspacesDb.id)
      )
      .where(and(...filters))
      .orderBy(
        asc(workspaceResourcesDb.position),
        asc(workspaceResourcesDb.createdAt),
        asc(workspaceResourcesDb.id)
      )
      .limit(params.limit + 1);
    const storage = await getStorageHandles(
      this.database.db,
      rows.map((row) => row.id)
    );

    return toPage({
      encode: (row: WorkspaceResourceRow) => ({
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        position: row.position,
      }),
      limit: params.limit,
      map: (row) => toWorkspaceResourceDto(row, storage.get(row.id)),
      rows,
    });
  }

  async get(
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    const resource = await this.find(
      resourceId,
      workspaceId,
      organizationId,
      userId
    );
    const storage = await getStorageHandles(this.database.db, [resourceId]);
    return toWorkspaceResourceDto(resource, storage.get(resourceId));
  }

  async create(
    input: CreateWorkspaceResourceInput,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    return this.database.db.transaction((tx) =>
      this.createWithDb(tx, input, workspaceId, organizationId, userId)
    );
  }

  async createWithDb(
    db: DatabaseOrTx,
    input: CreateWorkspaceResourceInput,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    await assertWorkspaceAccess(
      db,
      workspaceId,
      organizationId,
      userId,
      "write"
    );
    await this.entitlements.assertCanCreateResource(db, organizationId);
    const id = createId("res");
    await assertValidWorkspaceResourceParent({
      resourceId: id,
      lockAncestors: true,
      parentId: input.parentId,
      workspaceId,
      tx: db,
    });

    const now = new Date();
    const rows = (await db
      .insert(workspaceResourcesDb)
      .values({
        createdAt: now,
        icon: input.icon ?? null,
        id,
        name: input.name,
        parentId: input.parentId ?? null,
        resourceTypeId: input.resourceTypeId,
        schemaVersion: input.schemaVersion,
        position: input.position ?? 0,
        workspaceId,
        updatedAt: now,
      })
      .returning()) as WorkspaceResourceRow[];
    const resource = rows[0];
    const storage = emptyStorageHandles();
    for (const [name, definition] of Object.entries(input.storage)) {
      const storageId = createId("storage");
      const backingId =
        definition.kind === "yjs"
          ? createId("yjs")
          : definition.kind === "file"
            ? createId("file")
            : null;
      if (definition.kind === "yjs") {
        await db.insert(yjsDocumentsDb).values({
          createdAt: now,
          id: backingId!,
          workspaceId,
          updatedAt: now,
        });
      }
      await db.insert(workspaceStorageSlotsDb).values({
        backingId,
        createdAt: now,
        id: storageId,
        kind: definition.kind,
        name,
        pluginId: null,
        workspaceId,
        resourceId: id,
        updatedAt: now,
      });
      storage[name] = { kind: definition.kind, storageId };
    }
    return toWorkspaceResourceDto(resource!, storage);
  }

  async update(
    resourceId: string,
    input: UpdateWorkspaceResourceInput,
    workspaceId: string,
    organizationId: string,
    expectedRevision?: string,
    userId?: string
  ) {
    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        workspaceId,
        organizationId,
        userId,
        "write"
      );
      const resource = await getWorkspaceResource(tx, resourceId, {
        lock: true,
        workspaceId,
      });
      if (!resource || resource.workspaceId !== workspaceId) {
        throw new NotFoundException("Workspace resource not found");
      }
      if (
        expectedRevision &&
        resource.updatedAt.toISOString() !==
          expectedRevision.replaceAll('"', "")
      ) {
        throw new ConflictException(
          "Resource revision does not match If-Match"
        );
      }

      if (Object.hasOwn(input, "parentId")) {
        await assertValidWorkspaceResourceParent({
          resourceId,
          lockAncestors: true,
          parentId: input.parentId,
          workspaceId,
          tx,
        });
      }

      const [updated] = await tx
        .update(workspaceResourcesDb)
        .set({ ...input, syncedUpdatedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaceResourcesDb.id, resourceId),
            eq(workspaceResourcesDb.workspaceId, workspaceId)
          )
        )
        .returning();
      const storage = await getStorageHandles(tx, [resourceId]);
      return toWorkspaceResourceDto(updated!, storage.get(resourceId));
    });
  }

  async delete(
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    return this.database.db.transaction((tx) =>
      this.trashWithDb(tx, resourceId, workspaceId, organizationId, userId)
    );
  }

  async trashWithDb(
    db: DatabaseOrTx,
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string,
    expectedResourceTypeId?: string
  ) {
    await assertWorkspaceAccess(
      db,
      workspaceId,
      organizationId,
      userId,
      "write"
    );
    const [root] = await db
      .select({
        id: workspaceResourcesDb.id,
        resourceTypeId: workspaceResourcesDb.resourceTypeId,
      })
      .from(workspaceResourcesDb)
      .where(
        and(
          eq(workspaceResourcesDb.id, resourceId),
          eq(workspaceResourcesDb.workspaceId, workspaceId),
          notExists(
            db
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
          )
        )
      );
    if (!root) {
      const [existingMarker] = await db
        .select({ id: workspaceResourceTrashDb.id })
        .from(workspaceResourceTrashDb)
        .where(
          and(
            eq(workspaceResourceTrashDb.id, resourceId),
            eq(workspaceResourceTrashDb.workspaceId, workspaceId),
            eq(workspaceResourceTrashDb.trashRootId, resourceId)
          )
        );
      if (existingMarker) {
        if (expectedResourceTypeId) {
          const [trashedRoot] = await db
            .select({ resourceTypeId: workspaceResourcesDb.resourceTypeId })
            .from(workspaceResourcesDb)
            .where(eq(workspaceResourcesDb.id, resourceId));
          if (trashedRoot?.resourceTypeId !== expectedResourceTypeId) {
            throw new NotFoundException("Workspace resource not found");
          }
        }
        return { id: resourceId };
      }
      throw new NotFoundException("Workspace resource not found");
    }
    if (
      expectedResourceTypeId &&
      root.resourceTypeId !== expectedResourceTypeId
    ) {
      throw new NotFoundException("Workspace resource not found");
    }

    const resources = await db
      .select({
        id: workspaceResourcesDb.id,
        parentId: workspaceResourcesDb.parentId,
      })
      .from(workspaceResourcesDb)
      .where(eq(workspaceResourcesDb.workspaceId, workspaceId));
    const descendants = new Set([resourceId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const resource of resources) {
        if (
          resource.parentId &&
          descendants.has(resource.parentId) &&
          !descendants.has(resource.id)
        ) {
          descendants.add(resource.id);
          changed = true;
        }
      }
    }
    const now = new Date();
    const purgeAt = new Date(now.getTime() + RESOURCE_TRASH_RETENTION_MS);
    for (const id of descendants) {
      await db
        .insert(workspaceResourceTrashDb)
        .values({
          id,
          workspaceId,
          trashRootId: resourceId,
          trashedAt: now,
          purgeAt,
        })
        .onConflictDoUpdate({
          target: workspaceResourceTrashDb.id,
          set: {
            workspaceId,
            trashRootId: resourceId,
            trashedAt: now,
            purgeAt,
            syncedUpdatedAt: now,
          },
        });
    }
    return { id: resourceId };
  }

  async restore(
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    return this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        workspaceId,
        organizationId,
        userId,
        "write"
      );
      const [marker] = await tx
        .select()
        .from(workspaceResourceTrashDb)
        .where(
          and(
            eq(workspaceResourceTrashDb.id, resourceId),
            eq(workspaceResourceTrashDb.workspaceId, workspaceId),
            eq(workspaceResourceTrashDb.trashRootId, resourceId)
          )
        )
        .for("update");
      if (!marker) {
        const [activeResource] = await tx
          .select({ id: workspaceResourcesDb.id })
          .from(workspaceResourcesDb)
          .where(
            and(
              eq(workspaceResourcesDb.id, resourceId),
              eq(workspaceResourcesDb.workspaceId, workspaceId)
            )
          );
        if (activeResource) {
          return { id: resourceId };
        }
        throw new NotFoundException("Trashed workspace resource not found");
      }
      if (marker.purgeAt <= new Date()) {
        throw new NotFoundException("Trashed workspace resource not found");
      }
      const [root] = await tx
        .select({ parentId: workspaceResourcesDb.parentId })
        .from(workspaceResourcesDb)
        .where(eq(workspaceResourcesDb.id, resourceId));
      if (root?.parentId) {
        const [parent] = await tx
          .select({ id: workspaceResourcesDb.id })
          .from(workspaceResourcesDb)
          .where(
            and(
              eq(workspaceResourcesDb.id, root.parentId),
              eq(workspaceResourcesDb.workspaceId, workspaceId)
            )
          );
        const [parentTrash] = await tx
          .select({ id: workspaceResourceTrashDb.id })
          .from(workspaceResourceTrashDb)
          .where(eq(workspaceResourceTrashDb.id, root.parentId));
        if (!parent || parentTrash) {
          const [placement] = await tx
            .select({ position: max(workspaceResourcesDb.position) })
            .from(workspaceResourcesDb)
            .where(
              and(
                eq(workspaceResourcesDb.workspaceId, workspaceId),
                isNull(workspaceResourcesDb.parentId),
                notExists(
                  tx
                    .select({ id: workspaceResourceTrashDb.id })
                    .from(workspaceResourceTrashDb)
                    .where(
                      eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id)
                    )
                )
              )
            );
          await tx
            .update(workspaceResourcesDb)
            .set({
              parentId: null,
              position: (placement?.position ?? -1) + 1,
              syncedUpdatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(workspaceResourcesDb.id, resourceId));
        }
      }
      const rows = await tx
        .select({ id: workspaceResourceTrashDb.id })
        .from(workspaceResourceTrashDb)
        .where(
          and(
            eq(workspaceResourceTrashDb.workspaceId, workspaceId),
            eq(workspaceResourceTrashDb.trashRootId, resourceId)
          )
        );
      for (let index = 0; index < rows.length; index++) {
        await this.entitlements.assertCanCreateResource(tx, organizationId);
        await tx
          .delete(workspaceResourceTrashDb)
          .where(eq(workspaceResourceTrashDb.id, rows[index]!.id));
      }
      return { id: resourceId };
    });
  }

  async purge(
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    const deletion = await this.database.db.transaction(async (tx) => {
      await assertWorkspaceAccess(
        tx,
        workspaceId,
        organizationId,
        userId,
        "write"
      );
      const [marker] = await tx
        .select({ id: workspaceResourceTrashDb.id })
        .from(workspaceResourceTrashDb)
        .where(
          and(
            eq(workspaceResourceTrashDb.id, resourceId),
            eq(workspaceResourceTrashDb.workspaceId, workspaceId),
            eq(workspaceResourceTrashDb.trashRootId, resourceId)
          )
        );
      if (!marker) {
        const [resource] = await tx
          .select({ id: workspaceResourcesDb.id })
          .from(workspaceResourcesDb)
          .where(
            and(
              eq(workspaceResourcesDb.id, resourceId),
              eq(workspaceResourcesDb.workspaceId, workspaceId)
            )
          );
        if (resource) {
          throw new NotFoundException("Trashed workspace resource not found");
        }
        return { fileBackings: [], id: resourceId };
      }
      return this.purgeWithDb(
        tx,
        resourceId,
        workspaceId,
        organizationId,
        userId
      );
    });
    return this.finalizeDeletion(deletion, workspaceId, organizationId, userId);
  }

  async purgeWithDb(
    db: DatabaseOrTx,
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string,
    expectedResourceTypeId?: string,
    skipAccess = false
  ) {
    await lockOrganizationCapacity(db, organizationId);
    if (!skipAccess) {
      await assertWorkspaceAccess(
        db,
        workspaceId,
        organizationId,
        userId,
        "write"
      );
    }
    const resources = await db
      .select({
        id: workspaceResourcesDb.id,
        parentId: workspaceResourcesDb.parentId,
      })
      .from(workspaceResourcesDb)
      .where(eq(workspaceResourcesDb.workspaceId, workspaceId));
    const descendants = new Set([resourceId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const resource of resources) {
        if (
          resource.parentId &&
          descendants.has(resource.parentId) &&
          !descendants.has(resource.id)
        ) {
          descendants.add(resource.id);
          changed = true;
        }
      }
    }
    const ids = [...descendants];
    const yjsSlots = ids.length
      ? await db
          .select({ backingId: workspaceStorageSlotsDb.backingId })
          .from(workspaceStorageSlotsDb)
          .where(
            and(
              inArray(workspaceStorageSlotsDb.resourceId, ids),
              eq(workspaceStorageSlotsDb.kind, "yjs")
            )
          )
      : [];
    const fileSlots = ids.length
      ? await db
          .select({
            backingId: workspaceStorageSlotsDb.backingId,
            metadata: workspaceStorageSlotsDb.metadata,
          })
          .from(workspaceStorageSlotsDb)
          .where(
            and(
              inArray(workspaceStorageSlotsDb.resourceId, ids),
              eq(workspaceStorageSlotsDb.kind, "file")
            )
          )
      : [];
    const [resource] = await db
      .delete(workspaceResourcesDb)
      .where(
        and(
          eq(workspaceResourcesDb.id, resourceId),
          eq(workspaceResourcesDb.workspaceId, workspaceId),
          ...(expectedResourceTypeId
            ? [eq(workspaceResourcesDb.resourceTypeId, expectedResourceTypeId)]
            : [])
        )
      )
      .returning({ id: workspaceResourcesDb.id });
    if (!resource) {
      throw new NotFoundException("Workspace resource not found");
    }
    for (const backingId of new Set(yjsSlots.map((slot) => slot.backingId))) {
      if (!backingId) {
        continue;
      }
      const [reference] = await db
        .select({ id: workspaceStorageSlotsDb.id })
        .from(workspaceStorageSlotsDb)
        .where(
          and(
            eq(workspaceStorageSlotsDb.kind, "yjs"),
            eq(workspaceStorageSlotsDb.backingId, backingId)
          )
        )
        .limit(1);
      if (!reference) {
        await db.delete(yjsDocumentsDb).where(eq(yjsDocumentsDb.id, backingId));
      }
    }
    const fileBackings = new Map<string, FileBackingCleanup>();
    for (const { backingId, metadata } of fileSlots) {
      if (!backingId) {
        continue;
      }
      const [reference] = await db
        .select({ id: workspaceStorageSlotsDb.id })
        .from(workspaceStorageSlotsDb)
        .where(
          and(
            eq(workspaceStorageSlotsDb.kind, "file"),
            eq(workspaceStorageSlotsDb.backingId, backingId),
            eq(workspaceStorageSlotsDb.workspaceId, workspaceId)
          )
        )
        .limit(1);
      if (reference) {
        continue;
      }
      const parsed = parseFileMetadata(metadata);
      if (!parsed) {
        continue;
      }
      const [stored] = await db
        .select({ key: storedFilesDb.objectKey })
        .from(storedFilesDb)
        .where(
          and(
            eq(storedFilesDb.organizationId, organizationId),
            eq(storedFilesDb.workspaceId, workspaceId),
            eq(storedFilesDb.fileId, backingId)
          )
        );
      if (stored) {
        const [shared] = await db
          .select({ id: storedFilesDb.id })
          .from(storedFilesDb)
          .where(
            and(
              eq(storedFilesDb.objectKey, stored.key),
              or(
                ne(storedFilesDb.workspaceId, workspaceId),
                ne(storedFilesDb.fileId, backingId)
              )
            )
          )
          .limit(1);
        if (shared) {
          await db
            .delete(storedFilesDb)
            .where(
              and(
                eq(storedFilesDb.workspaceId, workspaceId),
                eq(storedFilesDb.fileId, backingId),
                eq(storedFilesDb.organizationId, organizationId)
              )
            );
        } else {
          await db
            .update(fileObjectsDb)
            .set({ state: "pending_delete" })
            .where(eq(fileObjectsDb.key, stored.key));
        }
      }
      await db
        .update(uploadSessionsDb)
        .set({ state: "canceling" })
        .where(
          and(
            eq(uploadSessionsDb.organizationId, organizationId),
            eq(uploadSessionsDb.workspaceId, workspaceId),
            eq(uploadSessionsDb.fileId, backingId),
            inArray(uploadSessionsDb.state, [
              "creating",
              "uploading",
              "completing",
            ])
          )
        );
      fileBackings.set(backingId, { backingId, ...parsed });
    }
    return { fileBackings: [...fileBackings.values()], id: resource.id };
  }

  async purgeExpired(
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    now = new Date()
  ) {
    const deletion = await this.database.db.transaction(async (tx) => {
      const [marker] = await tx
        .select({ id: workspaceResourceTrashDb.id })
        .from(workspaceResourceTrashDb)
        .where(
          and(
            eq(workspaceResourceTrashDb.id, resourceId),
            eq(workspaceResourceTrashDb.workspaceId, workspaceId),
            eq(workspaceResourceTrashDb.trashRootId, resourceId),
            sql`${workspaceResourceTrashDb.purgeAt} <= ${now}`
          )
        )
        .for("update", { skipLocked: true });
      if (!marker) {
        return null;
      }
      return this.purgeWithDb(
        tx,
        resourceId,
        workspaceId,
        organizationId,
        undefined,
        undefined,
        true
      );
    });
    if (!deletion) {
      return null;
    }
    return this.finalizeDeletion(deletion, workspaceId, organizationId);
  }

  async finalizeDeletion(
    deletion: WorkspaceResourceDeletion,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    for (const backing of deletion.fileBackings) {
      try {
        await this.files.deleteFile({
          fileExtension: backing.fileExtension,
          fileId: backing.backingId,
          filename: backing.filename,
          organizationId,
          workspaceId,
          userId,
        });
      } catch (error) {
        const logger = createLogger({
          task: "workspace-resource-file-cleanup",
        });
        logger.error(
          error instanceof Error
            ? error
            : new Error("File backing cleanup failed", { cause: error }),
          {
            workspaceResource: {
              backingId: backing.backingId,
              cleanup: "deferred_to_gc",
              workspaceId,
              resourceId: deletion.id,
            },
          }
        );
        logger.emit();
      }
    }
    return { id: deletion.id };
  }

  private async find(
    resourceId: string,
    workspaceId: string,
    organizationId: string,
    userId?: string
  ) {
    const [resource] = await this.database.db
      .select(getTableColumns(workspaceResourcesDb))
      .from(workspaceResourcesDb)
      .innerJoin(
        workspacesDb,
        eq(workspaceResourcesDb.workspaceId, workspacesDb.id)
      )
      .where(
        and(
          eq(workspaceResourcesDb.id, resourceId),
          eq(workspaceResourcesDb.workspaceId, workspaceId),
          workspaceAccessCondition(organizationId, userId),
          notExists(
            this.database.db
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
          )
        )
      )
      .limit(1);
    if (!resource) {
      throw new NotFoundException("Workspace resource not found");
    }
    return resource;
  }
}

export function toWorkspaceResourceDto(
  resource: WorkspaceResourceRow,
  storage: StorageHandles = emptyStorageHandles()
): WorkspaceResourceDto {
  return {
    createdAt: resource.createdAt.toISOString(),
    icon: resource.icon,
    id: resource.id,
    name: resource.name,
    parentId: resource.parentId,
    resourceTypeId: resource.resourceTypeId,
    schemaVersion: resource.schemaVersion,
    position: resource.position,
    workspaceId: resource.workspaceId,
    storage,
    updatedAt: resource.updatedAt.toISOString(),
    lastActivityAt: (
      resource.lastActivityAt ?? resource.updatedAt
    ).toISOString(),
  };
}

export async function getStorageHandles(
  db: DatabaseOrTx,
  resourceIds: string[]
): Promise<Map<string, StorageHandles>> {
  const result = new Map<string, StorageHandles>();
  if (resourceIds.length === 0) {
    return result;
  }
  const slots = await db
    .select({
      id: workspaceStorageSlotsDb.id,
      kind: workspaceStorageSlotsDb.kind,
      name: workspaceStorageSlotsDb.name,
      resourceId: workspaceStorageSlotsDb.resourceId,
    })
    .from(workspaceStorageSlotsDb)
    .where(inArray(workspaceStorageSlotsDb.resourceId, resourceIds));
  for (const slot of slots) {
    if (!(slot.resourceId && isStorageKind(slot.kind))) {
      continue;
    }
    const handles = result.get(slot.resourceId) ?? emptyStorageHandles();
    handles[slot.name] = { kind: slot.kind, storageId: slot.id };
    result.set(slot.resourceId, handles);
  }
  return result;
}

function emptyStorageHandles(): StorageHandles {
  return Object.create(null) as StorageHandles;
}

function isStorageKind(value: string): value is StorageHandle["kind"] {
  return value === "file" || value === "key-value" || value === "yjs";
}

function parseFileMetadata(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    const metadata = JSON.parse(value) as {
      fileExtension?: unknown;
      filename?: unknown;
    };
    if (
      typeof metadata.fileExtension !== "string" &&
      typeof metadata.filename !== "string"
    ) {
      return null;
    }
    return {
      fileExtension:
        typeof metadata.fileExtension === "string"
          ? metadata.fileExtension
          : undefined,
      filename:
        typeof metadata.filename === "string" ? metadata.filename : undefined,
    };
  } catch {
    return null;
  }
}
