import type { DatabaseOrTx } from "@app/db/utils";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { and, eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { useLogger } from "evlog/nestjs";
import { workspacesDb } from "../workspaces/core/workspaces.entity";
import { workspaceAccessCondition } from "../workspaces/core/workspace-access";
import { OrganizationMismatchError } from "./sync.errors";

/** Verify a workspace belongs to the given org. Throws ForbiddenException if not. */
export async function verifyWorkspaceOwnership(
  tx: DatabaseOrTx,
  workspaceId: string,
  organizationId: string,
  userId?: string,
  access: "owner" | "read" | "write" = "write"
): Promise<void> {
  const rows = await tx
    .select({ id: workspacesDb.id })
    .from(workspacesDb)
    .where(
      and(
        eq(workspacesDb.id, workspaceId),
        workspaceAccessCondition(organizationId, userId, access)
      )
    );
  if (rows.length === 0) {
    useLogger().set({
      authz: {
        entity: "workspace",
        workspaceId,
        organizationId,
        result: "denied",
      },
    });
    throw new OrganizationMismatchError(
      "Workspace",
      workspaceId,
      organizationId
    );
  }
}

/** Verify a child row's workspace belongs to the org via JOIN. Skips if row missing (idempotent DELETE). */
export async function verifyChildOwnership(
  tx: DatabaseOrTx,
  table: PgTable & { workspaceId: PgColumn },
  idCol: PgColumn,
  id: string,
  organizationId: string,
  userId?: string,
  access: "read" | "write" = "write"
): Promise<void> {
  const rows = await tx
    .select({
      hasAccess: workspaceAccessCondition(organizationId, userId, access),
      orgId: workspacesDb.organizationId,
      ownerId: workspacesDb.ownerId,
      visibility: workspacesDb.visibility,
    })
    .from(table)
    .innerJoin(workspacesDb, eq(table.workspaceId, workspacesDb.id))
    .where(eq(idCol, id));
  if (rows.length === 0) {
    return; // row missing — allow (idempotent)
  }
  const workspace = rows[0]!;
  // The fallback keeps lightweight database test doubles useful; PostgreSQL
  // always returns hasAccess.
  const hasAccess =
    typeof workspace.hasAccess === "boolean"
      ? workspace.hasAccess
      : workspace.orgId === organizationId &&
        (workspace.visibility === WORKSPACE_VISIBILITY.shared ||
          (workspace.visibility === WORKSPACE_VISIBILITY.private &&
            workspace.ownerId === userId));
  if (!hasAccess) {
    useLogger().set({
      authz: { entity: "child", id, organizationId, result: "denied" },
    });
    throw new OrganizationMismatchError("Child entity", id, organizationId);
  }
}
