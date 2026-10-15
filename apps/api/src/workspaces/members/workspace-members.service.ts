import { DatabaseService, isUniqueViolation } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  WORKSPACE_ROLE,
  WORKSPACE_VISIBILITY,
  type WorkspaceRole,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import { and, eq } from "drizzle-orm";
import { member, user } from "../../auth/auth.entity";
import { workspacesDb } from "../core/workspaces.entity";
import { workspaceMembersDb } from "./workspace-members.entity";

interface OwnerContext {
  organizationId: string;
  ownerId: string;
  workspaceId: string;
}

interface OwnedWorkspace {
  id: string;
  visibility: WorkspaceVisibility;
}

const workspaceMemberSelection = {
  createdAt: workspaceMembersDb.createdAt,
  email: user.email,
  id: workspaceMembersDb.id,
  image: user.image,
  name: user.name,
  workspaceId: workspaceMembersDb.workspaceId,
  role: workspaceMembersDb.role,
  updatedAt: workspaceMembersDb.updatedAt,
  userId: user.id,
};

@Injectable()
export class WorkspaceMembersService {
  constructor(private readonly database: DatabaseService) {}

  async list(workspaceId: string, organizationId: string, userId: string) {
    await this.requireOwner({
      organizationId,
      ownerId: userId,
      workspaceId,
    });
    const rows = await this.database.db
      .select(workspaceMemberSelection)
      .from(workspaceMembersDb)
      .innerJoin(member, eq(member.id, workspaceMembersDb.organizationMemberId))
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(workspaceMembersDb.workspaceId, workspaceId))
      .orderBy(workspaceMembersDb.createdAt, workspaceMembersDb.id);
    return { items: rows.map(toDto) };
  }

  async add(params: {
    organizationId: string;
    ownerId: string;
    workspaceId: string;
    role: WorkspaceRole;
    userId: string;
  }) {
    try {
      return await this.withOwnerLock(params, async (tx, workspace) => {
        if (workspace.visibility !== WORKSPACE_VISIBILITY.private) {
          throw new UnprocessableEntityException(
            "Only private workspaces have members",
          );
        }
        if (params.userId === params.ownerId) {
          throw new ConflictException("Workspace owner already has access");
        }
        const organizationMemberId = await this.requireOrganizationMember(
          params.organizationId,
          params.userId,
          tx,
        );
        const [created] = await tx
          .insert(workspaceMembersDb)
          .values({
            workspaceId: params.workspaceId,
            role: params.role,
            organizationMemberId,
          })
          .returning({ id: workspaceMembersDb.id });
        return this.getById(created!.id, tx);
      });
    } catch (error) {
      if (
        isUniqueViolation(
          error,
          "workspace_members_workspace_organization_member_unique",
        )
      ) {
        throw new ConflictException("Workspace member already exists");
      }
      throw error;
    }
  }

  async update(params: {
    memberId: string;
    organizationId: string;
    ownerId: string;
    workspaceId: string;
    role: WorkspaceRole;
  }) {
    return this.withOwnerLock(params, async (tx) => {
      const [updated] = await tx
        .update(workspaceMembersDb)
        .set({ role: params.role, updatedAt: new Date() })
        .where(
          and(
            eq(workspaceMembersDb.id, params.memberId),
            eq(workspaceMembersDb.workspaceId, params.workspaceId),
          ),
        )
        .returning({ id: workspaceMembersDb.id });
      if (!updated) throw new NotFoundException("Workspace member not found");
      return this.getById(updated.id, tx);
    });
  }

  async remove(params: {
    memberId: string;
    organizationId: string;
    ownerId: string;
    workspaceId: string;
  }) {
    return this.withOwnerLock(params, async (tx) => {
      const [removed] = await tx
        .delete(workspaceMembersDb)
        .where(
          and(
            eq(workspaceMembersDb.id, params.memberId),
            eq(workspaceMembersDb.workspaceId, params.workspaceId),
          ),
        )
        .returning({ id: workspaceMembersDb.id });
      if (!removed) throw new NotFoundException("Workspace member not found");
      return removed;
    });
  }

  async transfer(params: {
    organizationId: string;
    ownerId: string;
    workspaceId: string;
    userId: string;
  }) {
    if (params.userId === params.ownerId) {
      throw new ConflictException("User already owns workspace");
    }
    await this.withOwnerLock(params, async (tx) => {
      const nextOwnerMembershipId = await this.requireOrganizationMember(
        params.organizationId,
        params.userId,
        tx,
      );
      const previousOwnerMembershipId = await this.requireOrganizationMember(
        params.organizationId,
        params.ownerId,
        tx,
      );
      await tx
        .delete(workspaceMembersDb)
        .where(
          and(
            eq(workspaceMembersDb.workspaceId, params.workspaceId),
            eq(workspaceMembersDb.organizationMemberId, nextOwnerMembershipId),
          ),
        );
      await tx
        .insert(workspaceMembersDb)
        .values({
          workspaceId: params.workspaceId,
          role: WORKSPACE_ROLE.editor,
          organizationMemberId: previousOwnerMembershipId,
        })
        .onConflictDoUpdate({
          set: { role: WORKSPACE_ROLE.editor, updatedAt: new Date() },
          target: [
            workspaceMembersDb.workspaceId,
            workspaceMembersDb.organizationMemberId,
          ],
        });
      const [transferred] = await tx
        .update(workspacesDb)
        .set({
          ownerId: params.userId,
          syncedUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspacesDb.id, params.workspaceId),
            eq(workspacesDb.ownerId, params.ownerId),
          ),
        )
        .returning({ id: workspacesDb.id });
      if (!transferred) throw new ConflictException("Workspace owner changed");
    });
    return { id: params.workspaceId };
  }

  private async getById(
    id: string,
    db: DatabaseOrTx = this.database.db,
  ) {
    const [row] = await db
      .select(workspaceMemberSelection)
      .from(workspaceMembersDb)
      .innerJoin(member, eq(member.id, workspaceMembersDb.organizationMemberId))
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(workspaceMembersDb.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Workspace member not found");
    return toDto(row);
  }

  private async requireOwner(
    params: OwnerContext,
    db: DatabaseOrTx = this.database.db,
    lock = false,
  ): Promise<OwnedWorkspace> {
    const query = db
      .select({
        id: workspacesDb.id,
        visibility: workspacesDb.visibility,
      })
      .from(workspacesDb)
      .where(
        and(
          eq(workspacesDb.id, params.workspaceId),
          eq(workspacesDb.organizationId, params.organizationId),
          eq(workspacesDb.ownerId, params.ownerId),
        ),
      );
    const rows = lock
      ? await query.for("update").limit(1)
      : await query.limit(1);
    const workspace = rows[0];
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  private withOwnerLock<T>(
    params: OwnerContext,
    operation: (tx: DatabaseOrTx, workspace: OwnedWorkspace) => Promise<T>,
  ): Promise<T> {
    return this.database.db.transaction(async (tx) => {
      const workspace = await this.requireOwner(params, tx, true);
      return operation(tx, workspace);
    });
  }

  private async requireOrganizationMember(
    organizationId: string,
    userId: string,
    db: DatabaseOrTx = this.database.db,
  ) {
    const [organizationMember] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);
    if (!organizationMember) throw new NotFoundException("Organization member not found");
    return organizationMember.id;
  }
}

function toDto(row: {
  createdAt: Date;
  email: string;
  id: string;
  image: string | null;
  name: string;
  workspaceId: string;
  role: WorkspaceRole;
  updatedAt: Date;
  userId: string;
}) {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    workspaceId: row.workspaceId,
    role: row.role,
    updatedAt: row.updatedAt.toISOString(),
    user: {
      email: row.email,
      id: row.userId,
      image: row.image,
      name: row.name,
    },
  };
}
