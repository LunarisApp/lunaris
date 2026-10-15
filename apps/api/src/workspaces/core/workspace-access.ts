import type { DatabaseOrTx } from "@app/db/utils";
import { NotFoundException } from "@nestjs/common";
import { WORKSPACE_ROLE, WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { and, eq, or, sql } from "drizzle-orm";
import { member, organization } from "../../auth/auth.entity";
import { workspaceMembersDb } from "../members/workspace-members.entity";
import { workspacesDb } from "./workspaces.entity";

export type WorkspaceAccessLevel = "read" | "write" | "owner";

export function workspaceAccessCondition(
  organizationId: string,
  userId?: string,
  access: WorkspaceAccessLevel = "read",
) {
  return and(
    eq(workspacesDb.organizationId, organizationId),
    sql`EXISTS (SELECT 1 FROM ${organization} WHERE ${organization.id} = ${organizationId} AND ${organization.deletionRequestedAt} IS NULL)`,
    userId
      ? and(
          organizationMembershipCondition(organizationId, userId),
          or(
            eq(workspacesDb.visibility, WORKSPACE_VISIBILITY.shared),
            and(
              eq(workspacesDb.visibility, WORKSPACE_VISIBILITY.private),
              or(
                eq(workspacesDb.ownerId, userId),
                access === "owner"
                  ? undefined
                  : workspaceMembershipCondition(userId, access),
              ),
            ),
          ),
        )
      : eq(workspacesDb.visibility, WORKSPACE_VISIBILITY.shared),
  )!;
}

function organizationMembershipCondition(
  organizationId: string,
  userId: string,
) {
  return sql`EXISTS (
    SELECT 1
    FROM ${member}
    WHERE ${member.organizationId} = ${organizationId}
      AND ${member.userId} = ${userId}
  )`;
}

function workspaceMembershipCondition(
  userId: string,
  access: Exclude<WorkspaceAccessLevel, "owner">,
) {
  return sql`EXISTS (
    SELECT 1
    FROM ${workspaceMembersDb}
    INNER JOIN ${member}
      ON ${member.id} = ${workspaceMembersDb.organizationMemberId}
    WHERE ${workspaceMembersDb.workspaceId} = ${workspacesDb.id}
      AND ${member.userId} = ${userId}
      ${access === "write" ? sql`AND ${workspaceMembersDb.role} = ${WORKSPACE_ROLE.editor}` : sql``}
  )`;
}

export async function assertWorkspaceAccess(
  db: DatabaseOrTx,
  workspaceId: string,
  organizationId: string,
  userId?: string,
  access: WorkspaceAccessLevel = "read",
) {
  const [workspace] = await db
    .select({ id: workspacesDb.id })
    .from(workspacesDb)
    .where(
      and(
        eq(workspacesDb.id, workspaceId),
        workspaceAccessCondition(organizationId, userId, access),
      ),
    )
    .limit(1);
  if (!workspace) throw new NotFoundException("Workspace not found");
}
