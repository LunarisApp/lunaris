import { workspaceStorageSlotsDb } from "../workspaces/storage/workspace-storage.entity";
import { DatabaseService } from "@app/db";
import { StorageService } from "@app/storage";
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  or,
} from "drizzle-orm";
import { log, parseError } from "evlog";
import { randomUUID } from "node:crypto";
import { organization } from "../auth/auth.entity";
import { lockOrganizationCapacity } from "../entitlements/seats/organization-capacity";
import { workspacesDb } from "../workspaces/core/workspaces.entity";
import {
  fileObjectsDb,
  organizationStorageDb,
  storedFilesDb,
  uploadSessionsDb,
} from "./file-storage.entity";
import { UploadSessionsService } from "./upload-sessions.service";

@Injectable()
export class StorageReconciliationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly uploads: UploadSessionsService
  ) {}

  @Cron("*/5 * * * *", { name: "file-storage-reconciliation" })
  async reconcile() {
    // Keyset pages advance even when cleanup fails, so one broken object cannot
    // starve later work. Every attempt retains its durable state on failure.
    let sessionCursor: string | undefined;
    while (true) {
      const sessions = await this.database.db
        .select({ session: uploadSessionsDb, workspaceId: workspacesDb.id })
        .from(uploadSessionsDb)
        .leftJoin(
          workspacesDb,
          eq(uploadSessionsDb.workspaceId, workspacesDb.id)
        )
        .where(
          and(
            sessionCursor ? gt(uploadSessionsDb.id, sessionCursor) : undefined,
            or(
              inArray(uploadSessionsDb.state, ["completing", "canceling"]),
              and(
                inArray(uploadSessionsDb.state, ["creating", "uploading"]),
                or(
                  isNull(workspacesDb.id),
                  lte(uploadSessionsDb.expiresAt, new Date())
                )
              )
            )
          )
        )
        .orderBy(asc(uploadSessionsDb.id))
        .limit(500);
      if (!sessions.length) {
        break;
      }
      for (const { session, workspaceId } of sessions) {
        try {
          if (
            workspaceId &&
            session.state === "completing" &&
            session.expiresAt > new Date()
          ) {
            await this.uploads.finish(session.id);
          } else {
            await this.uploads.cancel(undefined, session.id);
          }
        } catch (error) {
          this.failure("session", session.id, error);
        }
      }
      sessionCursor = sessions.at(-1)!.session.id;
    }
    // Workspace deletion is discoverable after its content rows cascade away.
    await this.database.db
      .update(fileObjectsDb)
      .set({ state: "pending_delete" })
      .where(
        and(
          eq(fileObjectsDb.state, "live"),
          notExists(
            this.database.db
              .select({ id: workspacesDb.id })
              .from(workspacesDb)
              .where(eq(workspacesDb.id, fileObjectsDb.workspaceId))
          ),
          notExists(
            this.database.db
              .select({ id: storedFilesDb.id })
              .from(storedFilesDb)
              .innerJoin(
                workspacesDb,
                eq(storedFilesDb.workspaceId, workspacesDb.id)
              )
              .where(eq(storedFilesDb.objectKey, fileObjectsDb.key))
          )
        )
      );
    let objectCursor: string | undefined;
    while (true) {
      const pending = await this.database.db
        .select()
        .from(fileObjectsDb)
        .where(
          and(
            eq(fileObjectsDb.state, "pending_delete"),
            objectCursor ? gt(fileObjectsDb.key, objectCursor) : undefined
          )
        )
        .orderBy(asc(fileObjectsDb.key))
        .limit(500);
      if (!pending.length) {
        break;
      }
      for (const object of pending) {
        try {
          await this.database.db.transaction(async (tx) => {
            await lockOrganizationCapacity(tx, object.organizationId);
            const [current] = await tx
              .select()
              .from(fileObjectsDb)
              .where(eq(fileObjectsDb.key, object.key))
              .for("update");
            if (current?.state !== "pending_delete") {
              return;
            }
            await this.storage.deleteObject(object.key);
            await tx
              .update(fileObjectsDb)
              .set({ state: "deleted", verifiedAt: new Date() })
              .where(eq(fileObjectsDb.key, object.key));
          });
        } catch (error) {
          this.failure("delete", object.key, error);
        }
      }
      objectCursor = pending.at(-1)!.key;
    }
  }

  @Cron("0 2 * * *", { name: "file-storage-inventory" })
  async inventory() {
    // Per-organization transactions serialize inventory with reservations. listAll is paginated;
    // no missing-object inference is made from a partial or completed listing.
    const ids = new Set(
      (
        await this.database.db
          .select({ id: organization.id })
          .from(organization)
      ).map((org) => org.id)
    );
    try {
      for await (const object of this.storage.listObjects("files/")) {
        const id = object.key.split("/")[1];
        if (id && id !== "__rollout__") {
          ids.add(id);
        }
      }
    } catch (error) {
      this.failure("inventory-discovery", "files", error);
      throw error;
    }
    for (const id of ids) {
      try {
        await this.inventoryOrganization(id);
      } catch (error) {
        this.failure("inventory", id, error);
      }
    }
  }

  async inventoryOrganization(organizationId: string) {
    await this.database.db.transaction(async (tx) => {
      await lockOrganizationCapacity(tx, organizationId);
      for await (const object of this.storage.listObjects(
        `files/${organizationId}/`
      )) {
        const [session] = await tx
          .select({ id: uploadSessionsDb.id })
          .from(uploadSessionsDb)
          .where(
            and(
              eq(uploadSessionsDb.objectKey, object.key),
              ne(uploadSessionsDb.state, "completed"),
              ne(uploadSessionsDb.state, "canceled")
            )
          );
        // Unfinished completion is still protected by its reservation; worker owns promotion.
        if (session) {
          continue;
        }
        const size = await this.storage.objectSize(object.key);
        if (size === null) {
          continue;
        }
        const [existing] = await tx
          .select()
          .from(fileObjectsDb)
          .where(eq(fileObjectsDb.key, object.key));
        const segments = object.key.split("/");
        const workspaceId = segments[2];
        const [workspace] = workspaceId
          ? await tx
              .select({ id: workspacesDb.id })
              .from(workspacesDb)
              .where(
                and(
                  eq(workspacesDb.id, workspaceId),
                  eq(workspacesDb.organizationId, organizationId)
                )
              )
          : [];
        if (existing) {
          if (existing.sizeBytes !== size || existing.state === "deleted") {
            log.warn({
              context: "StorageInventory",
              message: "Stored-byte discrepancy",
              organizationId,
              objectKey: object.key,
              recordedBytes: existing.sizeBytes,
              verifiedBytes: size,
            });
          }
          // Only a successful HEAD can correct an object's recorded size, never absence in LIST.
          await tx
            .update(fileObjectsDb)
            .set({
              sizeBytes: size,
              verifiedAt: new Date(),
              ...(existing.state === "deleted"
                ? { state: "orphan" as const }
                : {}),
            })
            .where(eq(fileObjectsDb.key, object.key));
          continue;
        }
        const legacyName = segments.length === 4 ? segments[3] : undefined;
        const dot = legacyName?.lastIndexOf(".") ?? -1;
        const fileId = dot > 0 ? legacyName!.slice(0, dot) : undefined;
        const [reference] =
          fileId && workspace
            ? await tx
                .select({ id: workspaceStorageSlotsDb.id })
                .from(workspaceStorageSlotsDb)
                .where(
                  and(
                    eq(workspaceStorageSlotsDb.workspaceId, workspace.id),
                    eq(workspaceStorageSlotsDb.kind, "file"),
                    eq(workspaceStorageSlotsDb.backingId, fileId)
                  )
                )
                .limit(1)
            : [];
        await tx.insert(fileObjectsDb).values({
          key: object.key,
          organizationId,
          workspaceId: workspace?.id,
          sizeBytes: size,
          state: reference ? "live" : "orphan",
        });
        if (fileId && workspace) {
          await tx
            .insert(storedFilesDb)
            .values({
              id: randomUUID(),
              organizationId,
              workspaceId: workspace.id,
              fileId,
              objectKey: object.key,
            })
            .onConflictDoNothing();
        }
      }
      const [rollout] = await tx
        .select()
        .from(organizationStorageDb)
        .where(eq(organizationStorageDb.organizationId, "__rollout__"));
      await tx
        .insert(organizationStorageDb)
        .values({
          organizationId,
          inventoryCompletedAt: new Date(),
          enforcementEnabled: rollout?.enforcementEnabled ?? false,
        })
        .onConflictDoUpdate({
          target: organizationStorageDb.organizationId,
          set: { inventoryCompletedAt: new Date() },
        });
    });
  }

  private failure(operation: string, id: string, error: unknown) {
    log.error({
      context: "StorageReconciliation",
      message: "Storage reconciliation failed",
      operation,
      id,
      error: parseError(error),
    });
  }
}
