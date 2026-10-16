import type { DatabaseOrTx } from "@app/db/utils";
import { BadRequestException } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import {
  normalizeWorkspaceVisibility,
  WORKSPACE_VISIBILITY,
} from "@repo/auth/sync-access";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { useLogger } from "evlog/nestjs";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import { verifyWorkspaceOwnership } from "../sync.auth";
import { OrganizationMismatchError } from "../sync.errors";
import type { EntityHandler } from "../sync.handlers";
import { isUniqueViolation } from "../sync.handlers";

/** Generic table reference to bypass Drizzle's strict column typing. */
const table: PgTable = workspacesDb;

async function retryOnSlugConflict(
  db: DatabaseOrTx,
  mapped: Record<string, unknown>,
  op: (tx: DatabaseOrTx) => Promise<unknown>
) {
  try {
    await db.transaction(async (tx) => {
      await op(tx);
    });
  } catch (err) {
    if (isUniqueViolation(err, "slug") && typeof mapped.slug === "string") {
      const originalSlug = mapped.slug;
      mapped.slug = `${mapped.slug}-${randomBytes(2).toString("hex")}`;
      useLogger().set({
        sync: { slugConflict: true, originalSlug, newSlug: mapped.slug },
      });
      await db.transaction(async (tx) => {
        await op(tx);
      });
    } else {
      throw err;
    }
  }
}

export const workspacesHandler: EntityHandler = {
  table: workspacesDb,
  idCol: workspacesDb.id,
  permissions: {
    DELETE: permission.workspace.delete,
    PATCH: permission.workspace.update,
    PUT: permission.workspace.create,
  },
  immutableKeys: ["organizationId", "ownerId", "visibility", "createdAt"],
  put: async (db, id, mapped) => {
    await retryOnSlugConflict(db, mapped, (tx) =>
      tx.insert(table).values({ id, ...mapped })
    );
  },
  patch: async (db, id, mapped) => {
    await retryOnSlugConflict(db, mapped, (tx) =>
      tx
        .update(table)
        .set({ ...mapped, syncedUpdatedAt: new Date() })
        .where(eq(workspacesDb.id, id))
    );
  },
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PUT") {
      if (data?.organizationId !== organizationId) {
        throw new OrganizationMismatchError("Workspace", id, organizationId);
      }
      const visibility = normalizeWorkspaceVisibility(
        data.visibility ?? WORKSPACE_VISIBILITY.shared
      );
      if (!visibility || visibility === WORKSPACE_VISIBILITY.local) {
        throw new BadRequestException("Cloud workspace visibility is invalid");
      }
      if (visibility === WORKSPACE_VISIBILITY.private && !userId) {
        throw new BadRequestException("Private workspace owner is required");
      }
      data.visibility = visibility;
      data.ownerId =
        visibility === WORKSPACE_VISIBILITY.private ? userId : null;
    } else {
      await verifyWorkspaceOwnership(tx, id, organizationId, userId, "owner");
    }
  },
};
