import { DatabaseService } from "@app/db";
import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  type AppPermission,
  hasOrganizationPermission,
} from "@repo/auth/permissions";
import { and, eq, isNull } from "drizzle-orm";
import { member, organization } from "../../auth/auth.entity";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import {
  type WorkspaceAccessLevel,
  workspaceAccessCondition,
} from "../../workspaces/core/workspace-access";

export interface OrganizationPrincipal {
  organizationId: string | undefined;
  role?: string | null;
  userId: string | undefined;
  workspaceId?: string;
}

@Injectable()
export class PermissionService {
  constructor(private readonly database: DatabaseService) {}

  async hasPermission(
    required: AppPermission,
    principal: OrganizationPrincipal,
  ): Promise<boolean> {
    if (!principal.organizationId) return false;
    const [active] = await this.database.db
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.id, principal.organizationId),
          isNull(organization.deletionRequestedAt),
        ),
      )
      .limit(1);
    if (!active) return false;
    const workspaceDecision = await this.hasPrivateWorkspacePermission(
      required,
      principal,
    );
    if (workspaceDecision !== undefined) return workspaceDecision;
    const role = Object.hasOwn(principal, "role")
      ? principal.role
      : await this.getOrganizationRole(principal);
    return hasOrganizationPermission(role, required);
  }

  private async hasPrivateWorkspacePermission(
    required: AppPermission,
    principal: OrganizationPrincipal,
  ): Promise<boolean | undefined> {
    if (
      !principal.workspaceId ||
      !principal.organizationId ||
      !principal.userId ||
      (required.resource !== "workspace" && required.resource !== "content")
    ) {
      return undefined;
    }
    const access: WorkspaceAccessLevel =
      required.resource === "workspace" && required.action !== "read"
        ? "owner"
        : required.resource === "content" && required.action !== "read"
          ? "write"
          : "read";
    const [workspace] = await this.database.db
      .select({ visibility: workspacesDb.visibility })
      .from(workspacesDb)
      .where(
        and(
          eq(workspacesDb.id, principal.workspaceId),
          workspaceAccessCondition(
            principal.organizationId,
            principal.userId,
            access,
          ),
        ),
      )
      .limit(1);
    if (!workspace) return false;
    return workspace.visibility === "private" ? true : undefined;
  }

  async getOrganizationRole(
    principal: Omit<OrganizationPrincipal, "role">,
  ): Promise<string | null> {
    if (!principal.organizationId || !principal.userId) return null;
    const [membership] = await this.database.db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, principal.organizationId),
          eq(member.userId, principal.userId),
        ),
      )
      .limit(1);

    return membership?.role ?? null;
  }

  async requirePermission(
    required: AppPermission,
    principal: OrganizationPrincipal,
  ): Promise<void> {
    if (!(await this.hasPermission(required, principal))) {
      throw new ForbiddenException(
        `Missing permission: ${required.resource}:${required.action}`,
      );
    }
  }
}
