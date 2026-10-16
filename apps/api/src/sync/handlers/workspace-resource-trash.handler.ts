import { BadRequestError } from "@app/utils/errors";
import { permission } from "@repo/auth/permissions";
import { and, eq } from "drizzle-orm";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "../../workspaces/resources/workspace-resources.entity";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordStandaloneComplianceAudit } from "../../audit/recording/audit-log";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import type { EntityHandler } from "../sync.handlers";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const workspaceResourceTrashHandler: EntityHandler = {
  table: workspaceResourceTrashDb,
  idCol: workspaceResourceTrashDb.id,
  permissions: {
    DELETE: permission.content.write,
    PATCH: permission.content.delete,
    PUT: permission.content.delete,
  },
  immutableKeys: ["workspaceId"],
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PUT") {
      const workspaceId = data?.workspaceId;
      const trashRootId = data?.trashRootId;
      if (typeof workspaceId !== "string" || typeof trashRootId !== "string") {
        throw new BadRequestError({
          message: "Invalid resource trash marker",
          reason: "validation.failed",
        });
      }
      await verifyWorkspaceOwnership(tx, workspaceId, organizationId, userId);
      const resources = await tx
        .select({ id: workspaceResourcesDb.id })
        .from(workspaceResourcesDb)
        .where(
          and(
            eq(workspaceResourcesDb.workspaceId, workspaceId),
            eq(workspaceResourcesDb.id, id)
          )
        );
      const roots = await tx
        .select({ id: workspaceResourcesDb.id })
        .from(workspaceResourcesDb)
        .where(
          and(
            eq(workspaceResourcesDb.workspaceId, workspaceId),
            eq(workspaceResourcesDb.id, trashRootId)
          )
        );
      if (resources.length === 0 || roots.length === 0) {
        throw new BadRequestError({
          message: "Resource trash target was not found",
          reason: "validation.failed",
        });
      }
      return;
    }
    if (op === "PATCH") {
      await verifyChildOwnership(
        tx,
        workspaceResourceTrashDb,
        workspaceResourceTrashDb.id,
        id,
        organizationId,
        userId
      );
      const trashRootId = data?.trashRootId;
      if (typeof trashRootId !== "string") {
        throw new BadRequestError({
          message: "Invalid resource trash root",
          reason: "validation.failed",
        });
      }
      const [marker] = await tx
        .select({ workspaceId: workspaceResourceTrashDb.workspaceId })
        .from(workspaceResourceTrashDb)
        .where(eq(workspaceResourceTrashDb.id, id));
      const roots = marker
        ? await tx
            .select({ id: workspaceResourcesDb.id })
            .from(workspaceResourcesDb)
            .where(
              and(
                eq(workspaceResourcesDb.workspaceId, marker.workspaceId),
                eq(workspaceResourcesDb.id, trashRootId)
              )
            )
        : [];
      if (roots.length === 0) {
        throw new BadRequestError({
          message: "Resource trash root was not found",
          reason: "validation.failed",
        });
      }
      return;
    }
    await verifyChildOwnership(
      tx,
      workspaceResourceTrashDb,
      workspaceResourceTrashDb.id,
      id,
      organizationId,
      userId
    );
  },
  prepareAudit: async (_tx, op, id, data, organizationId, userId) => {
    if (op !== "PUT" || data?.trashRootId !== id) {
      return;
    }
    return () =>
      recordStandaloneComplianceAudit(
        AuditActions.workspaceResourceTrashed({
          actor: userId
            ? { id: userId, type: "user" }
            : { id: "system", type: "system" },
          outcome: "success",
          target: {
            id,
            workspaceId: data.workspaceId as string,
            tenantId: organizationId,
          },
        }),
        { tenantId: organizationId }
      );
  },
  patch: async (tx, id, mapped) => {
    const now = new Date();
    await tx
      .update(workspaceResourceTrashDb)
      .set({
        trashRootId: mapped.trashRootId as string,
        trashedAt: now,
        purgeAt: new Date(now.getTime() + RETENTION_MS),
        syncedUpdatedAt: now,
      })
      .where(eq(workspaceResourceTrashDb.id, id));
  },
  put: async (tx, id, mapped) => {
    const now = new Date();
    await tx.insert(workspaceResourceTrashDb).values({
      id,
      workspaceId: mapped.workspaceId as string,
      trashRootId: mapped.trashRootId as string,
      trashedAt: now,
      purgeAt: new Date(now.getTime() + RETENTION_MS),
    });
  },
};
