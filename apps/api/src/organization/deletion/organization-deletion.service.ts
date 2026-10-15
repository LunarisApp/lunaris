import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, or } from "drizzle-orm";
import { useLogger } from "evlog/nestjs";
import { member, organization } from "../../auth/auth.entity";
import { workspaceMembersDb } from "../../workspaces/members/workspace-members.entity";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import { organizationDeletionsDb } from "./organization-deletion.entity";

export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const FRESH_SESSION_MS = 15 * 60 * 1000;

@Injectable()
export class OrganizationDeletionService {
  constructor(private readonly database: DatabaseService) {}

  async requestDeletion(
    user: { id: string },
    organizationId: string,
    confirmationSlug: string,
    sessionCreatedAt: Date,
  ) {
    if (
      !Number.isFinite(new Date(sessionCreatedAt).getTime()) ||
      Date.now() - new Date(sessionCreatedAt).getTime() > FRESH_SESSION_MS
    ) {
      throw new ForbiddenException(
        "Sign out and sign in again before scheduling organization deletion.",
      );
    }
    await this.database.db.transaction(async (tx) => {
      const org = await this.requireOwner(tx, organizationId, user.id);
      if (org.isPersonal)
        throw new ForbiddenException("Cannot delete a personal organization");
      if (org.slug !== confirmationSlug)
        throw new BadRequestException("Organization slug does not match");
      if (org.deletionRequestedAt) return;
      const now = new Date();
      const purgeAfter = new Date(now.getTime() + DELETION_GRACE_MS);
      await tx.insert(organizationDeletionsDb).values({
        organizationId,
        requestedBy: user.id,
        requestedAt: now,
        purgeAfter,
      });
      await tx
        .update(organization)
        .set({ deletionRequestedAt: now, deletionPurgeAfter: purgeAfter })
        .where(eq(organization.id, organizationId));
    });
    useLogger().set({
      organization: { id: organizationId },
      deletion: { action: "schedule", userId: user.id },
    });
    return this.getStatus(user.id, organizationId);
  }

  async getStatus(userId: string, organizationId: string) {
    const [membership] = await this.database.db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);
    if (!membership)
      return {
        success: true,
        status: "unavailable" as const,
        workspaceIds: [],
        purgeAfter: null,
        canRestore: false,
        billingStopped: false,
      };
    const [deletion] = await this.database.db
      .select()
      .from(organizationDeletionsDb)
      .where(eq(organizationDeletionsDb.organizationId, organizationId));
    const workspaces = deletion
      ? await this.database.db
          .select({ id: workspacesDb.id })
          .from(workspacesDb)
          .where(
            and(
              eq(workspacesDb.organizationId, organizationId),
              or(
                eq(workspacesDb.visibility, "shared"),
                eq(workspacesDb.ownerId, userId),
                inArray(
                  workspacesDb.id,
                  this.database.db
                    .select({ workspaceId: workspaceMembersDb.workspaceId })
                    .from(workspaceMembersDb)
                    .where(
                      eq(
                        workspaceMembersDb.organizationMemberId,
                        membership.id,
                      ),
                    ),
                ),
              ),
            ),
          )
      : [];
    return {
      workspaceIds: workspaces.map((workspace) => workspace.id),
      success: true,
      purgeAfter: deletion?.purgeAfter.toISOString() ?? null,
      status: deletion
        ? deletion.purgeStartedAt
          ? ("purging" as const)
          : ("scheduled" as const)
        : ("active" as const),
      canRestore:
        membership.role === "owner" &&
        Boolean(
          deletion &&
            !deletion.purgeStartedAt &&
            deletion.purgeAfter.getTime() > Date.now(),
        ),
      billingStopped: Boolean(deletion?.billingStoppedAt),
    };
  }

  async restore(userId: string, organizationId: string) {
    await this.database.db.transaction(async (tx) => {
      await this.requireOwner(tx, organizationId, userId);
      const [deletion] = await tx
        .select()
        .from(organizationDeletionsDb)
        .where(eq(organizationDeletionsDb.organizationId, organizationId))
        .for("update");
      if (!deletion) return;
      if (
        deletion.purgeStartedAt ||
        deletion.purgeAfter.getTime() <= Date.now()
      )
        throw new ConflictException("The recovery period has ended");
      await tx
        .update(organization)
        .set({ deletionRequestedAt: null, deletionPurgeAfter: null })
        .where(eq(organization.id, organizationId));
      await tx
        .delete(organizationDeletionsDb)
        .where(eq(organizationDeletionsDb.organizationId, organizationId));
    });
    useLogger().set({
      organization: { id: organizationId },
      deletion: { action: "restore", userId },
    });
    return this.getStatus(userId, organizationId);
  }

  private async requireOwner(
    db: DatabaseOrTx,
    organizationId: string,
    userId: string,
  ) {
    // Same lock order as worker: organization first, deletion second.
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for("update");
    if (!org) throw new NotFoundException("Organization not found");
    const [membership] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);
    if (membership?.role !== "owner")
      throw new ForbiddenException(
        "Only organization owners can manage deletion",
      );
    return org;
  }
}
