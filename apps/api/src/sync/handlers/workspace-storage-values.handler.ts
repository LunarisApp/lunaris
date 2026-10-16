import { BadRequestError } from "@app/utils/errors";
import { permission } from "@repo/auth/permissions";
import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  workspaceStorageSlotsDb,
  workspaceStorageValuesDb,
} from "../../workspaces/storage/workspace-storage.entity";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import type { EntityHandler } from "../sync.handlers";

const table: PgTable = workspaceStorageValuesDb;

export const workspaceStorageValuesHandler: EntityHandler = {
  table: workspaceStorageValuesDb,
  idCol: workspaceStorageValuesDb.id,
  permissions: {
    DELETE: permission.content.delete,
    PATCH: permission.content.write,
    PUT: permission.content.write,
  },
  immutableKeys: ["storageId", "workspaceId", "key", "createdAt"],
  put: async (tx, id, mapped) => {
    await tx
      .insert(table)
      .values({ ...mapped, id })
      .onConflictDoUpdate({
        set: { ...mapped, id, syncedUpdatedAt: new Date() },
        target: [
          workspaceStorageValuesDb.storageId,
          workspaceStorageValuesDb.key,
        ],
      });
  },
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PUT") {
      const workspaceId = data?.workspaceId as string;
      const storageId = data?.storageId as string;
      await verifyWorkspaceOwnership(tx, workspaceId, organizationId, userId);
      const slot = await tx
        .select({ id: workspaceStorageSlotsDb.id })
        .from(workspaceStorageSlotsDb)
        .where(
          and(
            eq(workspaceStorageSlotsDb.id, storageId),
            eq(workspaceStorageSlotsDb.workspaceId, workspaceId),
            eq(workspaceStorageSlotsDb.kind, "key-value")
          )
        );
      if (!slot[0]) {
        throw new BadRequestError({
          message: "Invalid workspace storage value",
          reason: "validation.failed",
          why: "Storage is missing, cross-workspace, or not key-value",
        });
      }
      return;
    }
    await verifyChildOwnership(
      tx,
      workspaceStorageValuesDb,
      workspaceStorageValuesDb.id,
      id,
      organizationId,
      userId
    );
  },
};
