import { randomUUID } from "node:crypto";
import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import { StorageService } from "@app/storage";
import { Injectable, NotFoundException } from "@nestjs/common";
import { LIMIT, PLAN, resolveEntitlements } from "@repo/auth/entitlements";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { log, parseError } from "evlog";
import { BillingService } from "../entitlements/billing/billing.service";
import { EntitlementsConfig } from "../entitlements/core/entitlements.config";
import { lockOrganizationCapacity } from "../entitlements/seats/organization-capacity";
import { assertWorkspaceAccess } from "../workspaces/core/workspace-access";
import { workspaceStorageSlotsDb } from "../workspaces/storage/workspace-storage.entity";
import {
  fileObjectsDb,
  storedFilesDb,
  uploadSessionsDb,
} from "./file-storage.entity";
import { readStorageAccounting } from "./storage-accounting";
import {
  assertStorageCapacity,
  partLength,
  storageError,
  UPLOAD_PART_BYTES,
  UPLOAD_SESSION_MS,
  verifyUploadParts,
} from "./storage-policy";

export interface FileSessionActor {
  organizationId: string;
  userId: string;
}
export interface CreateUploadSession {
  fileId: string;
  id: string;
  mediaType: string;
  replacementFileId?: string;
  replacementStorageId?: string;
  sizeBytes: number;
  workspaceId: string;
}
type UploadSession = typeof uploadSessionsDb.$inferSelect;

@Injectable()
export class UploadSessionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly billing: BillingService,
    private readonly config: EntitlementsConfig
  ) {}

  async create(actor: FileSessionActor, input: CreateUploadSession) {
    try {
      await this.database.db.transaction(async (tx) => {
        await lockOrganizationCapacity(tx, actor.organizationId);
        await assertWorkspaceAccess(
          tx,
          input.workspaceId,
          actor.organizationId,
          actor.userId,
          "write"
        );
        const [existing] = await tx
          .select()
          .from(uploadSessionsDb)
          .where(eq(uploadSessionsDb.id, input.id));
        if (existing) {
          if (
            existing.organizationId !== actor.organizationId ||
            existing.workspaceId !== input.workspaceId ||
            existing.fileId !== input.fileId ||
            existing.sizeBytes !== input.sizeBytes ||
            existing.mediaType !== input.mediaType ||
            existing.replacementFileId !== (input.replacementFileId ?? null) ||
            existing.replacementStorageId !==
              (input.replacementStorageId ?? null)
          ) {
            storageError("UPLOAD_CONFLICT", "Upload session identity changed");
          }
          return;
        }
        const file = await this.findFile(
          tx,
          actor.organizationId,
          input.workspaceId,
          input.fileId
        );
        if (file && input.replacementFileId !== input.fileId) {
          storageError(
            "FILE_EXISTS",
            "File identity already exists; a replacement target is required"
          );
        }
        const targets = [
          input.fileId,
          ...(input.replacementFileId ? [input.replacementFileId] : []),
        ];
        const [active] = await tx
          .select({ id: uploadSessionsDb.id })
          .from(uploadSessionsDb)
          .where(
            and(
              eq(uploadSessionsDb.organizationId, actor.organizationId),
              eq(uploadSessionsDb.workspaceId, input.workspaceId),
              inArray(uploadSessionsDb.state, [
                "creating",
                "uploading",
                "completing",
                "canceling",
              ]),
              or(
                inArray(uploadSessionsDb.fileId, targets),
                inArray(uploadSessionsDb.replacementFileId, targets)
              )
            )
          );
        if (active) {
          storageError(
            "UPLOAD_IN_PROGRESS",
            "A file already has an active upload"
          );
        }
        const previous = input.replacementFileId
          ? await this.findFile(
              tx,
              actor.organizationId,
              input.workspaceId,
              input.replacementFileId
            )
          : undefined;
        const credit =
          previous &&
          (await this.canRetire(tx, previous, input.replacementStorageId))
            ? previous.sizeBytes
            : 0;
        const accounting = await readStorageAccounting(
          tx,
          actor.organizationId
        );
        const limits = await this.limits(
          tx,
          actor.organizationId,
          accounting.enterpriseOverrideBytes
        );
        // Initial inventory is a rollout gate, never an unmetered upload path.
        if (!accounting.enforcementEnabled) {
          storageError(
            "STORAGE_INITIALIZING",
            "Storage inventory is not ready for uploads",
            503
          );
        }
        const reservedBytes = assertStorageCapacity({
          size: input.sizeBytes,
          credit,
          committed: accounting.committedBytes,
          reserved: accounting.reservedBytes,
          maxStorage: limits.limit(LIMIT.maxStorageBytes),
          maxFile: limits.limit(LIMIT.maxFileBytes),
        });
        await tx.insert(uploadSessionsDb).values({
          ...input,
          organizationId: actor.organizationId,
          objectKey: `files/${actor.organizationId}/${input.workspaceId}/${input.fileId}/${randomUUID()}`,
          state: "creating",
          reservedBytes,
          creditBytes: credit,
          previousObjectKey: previous?.objectKey,
          expiresAt: new Date(Date.now() + UPLOAD_SESSION_MS),
        });
      });
      return this.resume(actor, input.id);
    } catch (error) {
      log.warn({
        context: "UploadSessionsService",
        message: "File upload blocked",
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        fileId: input.fileId,
        error: parseError(error),
      });
      throw error;
    }
  }

  async resume(actor: FileSessionActor, id: string) {
    return this.withSession(id, actor, async (tx, session) => {
      this.assertActive(session, true);
      if (session.state === "creating") {
        // Recover a provider create that succeeded before the DB transaction committed.
        await this.storage.abortMultipartForKey(session.objectKey);
        const uploadId = await this.storage.createMultipart(
          session.objectKey,
          session.mediaType
        );
        await tx
          .update(uploadSessionsDb)
          .set({ uploadId, state: "uploading" })
          .where(eq(uploadSessionsDb.id, id));
        session = { ...session, uploadId, state: "uploading" };
      }
      const parts =
        session.state === "uploading" && session.uploadId
          ? await this.storage.listParts(session.objectKey, session.uploadId)
          : [];
      return {
        id,
        state: session.state,
        sizeBytes: session.sizeBytes,
        partSize: UPLOAD_PART_BYTES,
        expiresAt: session.expiresAt.toISOString(),
        // Only provider-verified part lengths can be skipped by resumed clients.
        uploadedParts: parts
          .filter(
            (part) =>
              part.PartNumber &&
              part.ETag &&
              part.PartNumber <=
                Math.max(1, Math.ceil(session.sizeBytes / UPLOAD_PART_BYTES)) &&
              part.Size === partLength(session.sizeBytes, part.PartNumber)
          )
          .map((part) => part.PartNumber!),
      };
    });
  }

  async signPart(actor: FileSessionActor, id: string, partNumber: number) {
    return this.withSession(id, actor, async (_tx, session) => {
      this.assertActive(session);
      if (session.state !== "uploading" || !session.uploadId) {
        storageError("UPLOAD_NOT_READY", "Upload is not accepting parts");
      }
      const sizeBytes = partLength(session.sizeBytes, partNumber);
      return {
        url: await this.storage.signPart(
          session.objectKey,
          session.uploadId,
          partNumber,
          sizeBytes
        ),
        sizeBytes,
      };
    });
  }

  async complete(actor: FileSessionActor, id: string) {
    // Durable intent lets reconciliation finish after a provider success/DB failure.
    await this.withSession(id, actor, async (tx, session) => {
      this.assertActive(session, true);
      if (session.state === "completed") {
        return;
      }
      if (!session.uploadId) {
        storageError("UPLOAD_NOT_READY", "Upload has not started");
      }
      await tx
        .update(uploadSessionsDb)
        .set({
          state: "completing",
          // Completion can create a physical object before its ledger transaction
          // commits. Charge full overlap durably until promotion or cleanup.
          reservedBytes: session.sizeBytes,
        })
        .where(eq(uploadSessionsDb.id, id));
    });
    if (!(await this.finish(id, actor))) {
      storageError(
        "UPLOAD_CANCELED",
        "Upload was canceled before completion",
        410
      );
    }
    return { id, state: "completed" as const };
  }

  async finish(id: string, actor?: FileSessionActor) {
    return this.withSession(id, actor, async (tx, session) => {
      if (session.state === "completed") {
        return true;
      }
      if (session.state !== "completing" || !session.uploadId) {
        return false;
      }
      // HEAD recovers an interrupted CompleteMultipartUpload; never trust client metadata.
      let size = await this.storage.objectSize(session.objectKey);
      if (size === null) {
        const parts = await this.storage.listParts(
          session.objectKey,
          session.uploadId
        );
        verifyUploadParts(session.sizeBytes, parts);
        await this.storage.completeMultipart(
          session.objectKey,
          session.uploadId,
          parts
        );
        size = await this.storage.objectSize(session.objectKey);
      }
      if (size !== session.sizeBytes) {
        storageError(
          "UPLOAD_SIZE_MISMATCH",
          "Stored file size does not match reservation",
          400
        );
      }
      const accounting = await readStorageAccounting(
        tx,
        session.organizationId
      );
      const limits = await this.limits(
        tx,
        session.organizationId,
        accounting.enterpriseOverrideBytes
      );
      const previous = session.replacementFileId
        ? await this.findFile(
            tx,
            session.organizationId,
            session.workspaceId,
            session.replacementFileId
          )
        : undefined;
      const canRetire =
        previous?.objectKey === session.previousObjectKey &&
        (await this.canRetire(tx, previous));
      if (session.creditBytes > 0 && !canRetire && previous?.state === "live") {
        storageError(
          "REPLACEMENT_METADATA_PENDING",
          "Waiting for replacement metadata to synchronize"
        );
      }
      const credit = canRetire ? previous!.sizeBytes : 0;
      // Membership/plan changes take effect before publishing the completed object.
      assertStorageCapacity({
        size,
        credit,
        committed: accounting.committedBytes,
        reserved: accounting.reservedBytes - session.reservedBytes,
        maxStorage: limits.limit(LIMIT.maxStorageBytes),
        maxFile: limits.limit(LIMIT.maxFileBytes),
      });
      await tx.insert(fileObjectsDb).values({
        key: session.objectKey,
        organizationId: session.organizationId,
        workspaceId: session.workspaceId,
        sizeBytes: size,
        state: "live",
        verifiedAt: new Date(),
      });
      await tx
        .insert(storedFilesDb)
        .values({
          id: randomUUID(),
          organizationId: session.organizationId,
          workspaceId: session.workspaceId,
          fileId: session.fileId,
          objectKey: session.objectKey,
        })
        .onConflictDoUpdate({
          target: [
            storedFilesDb.organizationId,
            storedFilesDb.workspaceId,
            storedFilesDb.fileId,
          ],
          set: { objectKey: session.objectKey },
        });
      if (canRetire && session.previousObjectKey) {
        await tx
          .update(fileObjectsDb)
          .set({ state: "pending_delete" })
          .where(eq(fileObjectsDb.key, session.previousObjectKey));
      }
      await tx
        .update(uploadSessionsDb)
        .set({ state: "completed", reservedBytes: 0 })
        .where(eq(uploadSessionsDb.id, id));
      return true;
    });
  }

  async cancel(actor: FileSessionActor | undefined, id: string) {
    await this.withSession(id, actor, async (tx, session) => {
      if (session.state === "completed" || session.state === "canceled") {
        return;
      }
      await tx
        .update(uploadSessionsDb)
        .set({ state: "canceling" })
        .where(eq(uploadSessionsDb.id, id));
    });
    return this.withSession(id, actor, async (tx, session) => {
      if (session.state !== "canceling") {
        return { id, state: session.state };
      }
      await this.storage.abortMultipartForKey(session.objectKey);
      // A failed completion may have left a full object. Retain reservation until both are gone.
      await this.storage.deleteObject(session.objectKey);
      await tx
        .update(uploadSessionsDb)
        .set({ state: "canceled", reservedBytes: 0 })
        .where(eq(uploadSessionsDb.id, id));
      return { id, state: "canceled" as const };
    });
  }

  async withSession<T>(
    id: string,
    actor: FileSessionActor | undefined,
    run: (tx: DatabaseOrTx, session: UploadSession) => Promise<T>
  ) {
    return this.database.db.transaction(async (tx) => {
      const [identity] = await tx
        .select({ organizationId: uploadSessionsDb.organizationId })
        .from(uploadSessionsDb)
        .where(eq(uploadSessionsDb.id, id));
      if (
        !identity ||
        (actor && actor.organizationId !== identity.organizationId)
      ) {
        throw new NotFoundException("Upload session not found");
      }
      await lockOrganizationCapacity(tx, identity.organizationId);
      // Row lock still serializes cleanup after the organization row has been deleted.
      const [session] = await tx
        .select()
        .from(uploadSessionsDb)
        .where(eq(uploadSessionsDb.id, id))
        .for("update");
      if (!session) {
        throw new NotFoundException("Upload session not found");
      }
      if (actor) {
        await assertWorkspaceAccess(
          tx,
          session.workspaceId,
          actor.organizationId,
          actor.userId,
          "write"
        );
      }
      return run(tx, session);
    });
  }

  private assertActive(session: UploadSession, allowCompleted = false) {
    if (allowCompleted && session.state === "completed") {
      return;
    }
    if (
      ["canceling", "canceled"].includes(session.state) ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      storageError(
        "UPLOAD_EXPIRED",
        "Upload session expired or was canceled",
        410
      );
    }
  }

  private async limits(
    tx: DatabaseOrTx,
    organizationId: string,
    override?: number | null
  ) {
    const active = this.config.developmentPlan
      ? null
      : await this.billing.readActiveSubscription(tx, organizationId);
    return resolveEntitlements(
      this.config.developmentPlan ?? active?.planSlug ?? PLAN.free,
      override
    );
  }

  private async findFile(
    tx: DatabaseOrTx,
    organizationId: string,
    workspaceId: string,
    fileId: string
  ) {
    const [file] = await tx
      .select({
        id: storedFilesDb.id,
        fileId: storedFilesDb.fileId,
        workspaceId: storedFilesDb.workspaceId,
        objectKey: storedFilesDb.objectKey,
        sizeBytes: fileObjectsDb.sizeBytes,
        state: fileObjectsDb.state,
      })
      .from(storedFilesDb)
      .innerJoin(fileObjectsDb, eq(storedFilesDb.objectKey, fileObjectsDb.key))
      .where(
        and(
          eq(storedFilesDb.organizationId, organizationId),
          eq(storedFilesDb.workspaceId, workspaceId),
          eq(storedFilesDb.fileId, fileId)
        )
      );
    return file;
  }

  private async canRetire(
    tx: DatabaseOrTx,
    file: {
      id: string;
      fileId: string;
      workspaceId: string;
      objectKey: string;
      state: string;
    },
    storageId?: string
  ) {
    if (file.state !== "live") {
      return false;
    }
    const [shared] = await tx
      .select({ id: storedFilesDb.id })
      .from(storedFilesDb)
      .where(
        and(
          eq(storedFilesDb.objectKey, file.objectKey),
          ne(storedFilesDb.id, file.id)
        )
      )
      .limit(1);
    if (shared) {
      return false;
    }
    const references = await tx
      .select({ id: workspaceStorageSlotsDb.id })
      .from(workspaceStorageSlotsDb)
      .where(
        and(
          eq(workspaceStorageSlotsDb.workspaceId, file.workspaceId),
          eq(workspaceStorageSlotsDb.kind, "file"),
          eq(workspaceStorageSlotsDb.backingId, file.fileId)
        )
      );
    return references.every((reference) => reference.id === storageId);
  }
}
