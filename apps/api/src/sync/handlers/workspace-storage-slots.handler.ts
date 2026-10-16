import { lockOrganizationCapacity } from "../../entitlements/seats/organization-capacity";
import {
  uploadSessionsDb,
  fileObjectsDb,
  storedFilesDb,
} from "../../files/file-storage.entity";
import { inArray, ne } from "drizzle-orm";
import { BadRequestError } from "@app/utils/errors";
import { permission } from "@repo/auth/permissions";
import { and, eq } from "drizzle-orm";
import { workspaceStorageSlotsDb } from "../../workspaces/storage/workspace-storage.entity";
import { workspaceResourcesDb } from "../../workspaces/resources/workspace-resources.entity";
import { yjsDocumentsDb } from "../../yjs/yjs.entity";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import type { EntityHandler } from "../sync.handlers";

export const workspaceStorageSlotsHandler: EntityHandler = {
  table: workspaceStorageSlotsDb,
  idCol: workspaceStorageSlotsDb.id,
  permissions: {
    DELETE: permission.content.delete,
    PATCH: permission.content.write,
    PUT: permission.content.write,
  },
  immutableKeys: [
    "workspaceId",
    "resourceId",
    "pluginId",
    "name",
    "kind",
    "createdAt",
  ],
  authorize: async (tx, op, id, data, organizationId, userId) => {
    await lockOrganizationCapacity(tx, organizationId);
    const assertFileReference = async (workspaceId: string, kind: string) => {
      if (kind === "file" && typeof data?.backingId === "string") {
        const [replacement] = await tx
          .select({ id: uploadSessionsDb.replacementStorageId })
          .from(uploadSessionsDb)
          .where(
            and(
              eq(uploadSessionsDb.organizationId, organizationId),
              eq(uploadSessionsDb.workspaceId, workspaceId),
              eq(uploadSessionsDb.replacementFileId, data.backingId),
              ne(uploadSessionsDb.creditBytes, 0),
              inArray(uploadSessionsDb.state, [
                "creating",
                "uploading",
                "completing",
                "canceling",
              ])
            )
          );
        const [retired] = await tx
          .select({ id: storedFilesDb.id })
          .from(storedFilesDb)
          .innerJoin(
            fileObjectsDb,
            eq(storedFilesDb.objectKey, fileObjectsDb.key)
          )
          .where(
            and(
              eq(storedFilesDb.organizationId, organizationId),
              eq(storedFilesDb.workspaceId, workspaceId),
              eq(storedFilesDb.fileId, data.backingId),
              inArray(fileObjectsDb.state, ["pending_delete", "deleted"])
            )
          );
        if (retired || (replacement && replacement.id !== id)) {
          throw new BadRequestError({
            message: "File is being replaced or deleted",
            reason: "validation.failed",
            why: "New references cannot restore a retired file object",
          });
        }
      }
    };
    const invalid = (why: string) => {
      throw new BadRequestError({
        message: "Invalid workspace storage slot",
        reason: "validation.failed",
        why,
      });
    };
    if (op === "PUT") {
      const workspaceId = data?.workspaceId as string;
      const resourceId = data?.resourceId as string | null | undefined;
      const pluginId = data?.pluginId as string | null | undefined;
      const kind = data?.kind as string;
      const backingId = data?.backingId as string | null | undefined;
      await verifyWorkspaceOwnership(tx, workspaceId, organizationId, userId);
      await assertFileReference(workspaceId, kind);
      if (!(data?.name && ["file", "key-value", "yjs"].includes(kind))) {
        invalid("Slot name and supported kind are required");
      }
      if (Object.hasOwn(data ?? {}, "metadata") && kind !== "file") {
        invalid("Only file storage accepts metadata");
      }
      if (resourceId) {
        if (pluginId) {
          invalid("Resource storage cannot declare a plugin namespace");
        }
        const resource = await tx
          .select({ id: workspaceResourcesDb.id })
          .from(workspaceResourcesDb)
          .where(
            and(
              eq(workspaceResourcesDb.id, resourceId),
              eq(workspaceResourcesDb.workspaceId, workspaceId)
            )
          );
        if (!resource[0]) {
          invalid("Resource does not belong to the slot workspace");
        }
      } else if (!pluginId || kind !== "key-value") {
        invalid("Workspace storage must be a plugin-owned key-value slot");
      }
      if (kind === "yjs") {
        if (!backingId) {
          invalid("Yjs storage requires a backing document");
        }
        const document = await tx
          .select({ id: yjsDocumentsDb.id })
          .from(yjsDocumentsDb)
          .where(
            and(
              eq(yjsDocumentsDb.id, backingId!),
              eq(yjsDocumentsDb.workspaceId, workspaceId)
            )
          );
        if (!document[0]) {
          invalid("Yjs document does not belong to the slot workspace");
        }
      } else if (kind === "key-value" && backingId) {
        invalid("Key-value storage cannot have a backing object");
      }
      return;
    }
    await verifyChildOwnership(
      tx,
      workspaceStorageSlotsDb,
      workspaceStorageSlotsDb.id,
      id,
      organizationId,
      userId
    );
    if (op !== "PATCH") {
      return;
    }
    const [slot] = await tx
      .select({
        backingId: workspaceStorageSlotsDb.backingId,
        kind: workspaceStorageSlotsDb.kind,
        workspaceId: workspaceStorageSlotsDb.workspaceId,
      })
      .from(workspaceStorageSlotsDb)
      .where(eq(workspaceStorageSlotsDb.id, id))
      .limit(1);
    if (!slot) {
      invalid("Storage slot does not exist");
    }
    await assertFileReference(slot!.workspaceId, slot!.kind);
    if (Object.hasOwn(data ?? {}, "metadata") && slot!.kind !== "file") {
      invalid("Only file storage accepts metadata");
    }
    if (!Object.hasOwn(data ?? {}, "backingId")) {
      return;
    }
    const backingId = data?.backingId as string | null | undefined;
    if (slot!.kind === "key-value" && backingId) {
      invalid("Key-value storage cannot have a backing object");
    }
    if (slot!.kind === "yjs") {
      if (!backingId) {
        invalid("Yjs storage requires a backing document");
      }
      const [document] = await tx
        .select({ id: yjsDocumentsDb.id })
        .from(yjsDocumentsDb)
        .where(
          and(
            eq(yjsDocumentsDb.id, backingId!),
            eq(yjsDocumentsDb.workspaceId, slot!.workspaceId)
          )
        )
        .limit(1);
      if (!document) {
        invalid("Yjs document does not belong to the slot workspace");
      }
    }
  },
};
