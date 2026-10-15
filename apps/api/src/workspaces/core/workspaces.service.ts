import { randomBytes } from "node:crypto";
import { DatabaseService, isUniqueViolation } from "@app/db";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { workspaceMembersDb } from "../members/workspace-members.entity";
import {
  decodeCursor,
  toPage,
} from "@app/utils/pagination";
import { workspaceAccessCondition } from "./workspace-access";
import { workspacesDb } from "./workspaces.entity";
import {
  type CreateWorkspaceInput,
  type WorkspaceDto,
  workspaceCursorSchema,
  type UpdateWorkspaceInput,
} from "./workspaces.schema";

type WorkspaceRow = typeof workspacesDb.$inferSelect;

@Injectable()
export class WorkspacesService {
  constructor(private readonly database: DatabaseService) {}

  async list(params: {
    cursor?: string;
    limit: number;
    organizationId: string;
    userId?: string;
  }) {
    const cursor = decodeCursor(params.cursor, workspaceCursorSchema.parse);
    const cursorDate = cursor ? new Date(cursor.updatedAt) : undefined;
    const filters = [
      workspaceAccessCondition(params.organizationId, params.userId),
    ];
    if (cursor && cursorDate) {
      filters.push(
        or(
          lt(workspacesDb.updatedAt, cursorDate),
          and(
            eq(workspacesDb.updatedAt, cursorDate),
            gt(workspacesDb.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.database.db
      .select()
      .from(workspacesDb)
      .where(and(...filters))
      .orderBy(desc(workspacesDb.updatedAt), asc(workspacesDb.id))
      .limit(params.limit + 1);

    return toPage({
      encode: (row: WorkspaceRow) => ({
        id: row.id,
        updatedAt: row.updatedAt.toISOString(),
      }),
      limit: params.limit,
      map: toWorkspaceDto,
      rows,
    });
  }

  async get(workspaceId: string, organizationId: string, userId?: string) {
    const workspace = await this.find(workspaceId, organizationId, userId);
    return toWorkspaceDto(workspace);
  }

  async create(
    input: CreateWorkspaceInput,
    organizationId: string,
    userId?: string,
  ) {
    const visibility = input.visibility ?? WORKSPACE_VISIBILITY.shared;
    if (visibility === WORKSPACE_VISIBILITY.local) {
      throw new UnprocessableEntityException({
        code: "DESKTOP_ONLY",
        message: "Local workspaces can only be created by Lunaris Desktop",
      });
    }
    if (visibility === WORKSPACE_VISIBILITY.private && !userId) {
      throw new UnprocessableEntityException({
        code: "OWNER_REQUIRED",
        message: "Private workspaces require an owner",
      });
    }
    const now = new Date();
    const workspace = await this.retryHiddenSlugConflict(
      input.slug,
      organizationId,
      userId,
      async (slug) => {
        const [workspace] = await this.database.db
          .insert(workspacesDb)
          .values({
            createdAt: now,
            name: input.name,
            organizationId,
            ownerId:
              visibility === WORKSPACE_VISIBILITY.private ? userId : null,
            slug: slug!,
            updatedAt: now,
            visibility,
          })
          .returning();
        return workspace;
      },
    );
    return toWorkspaceDto(workspace!);
  }

  async update(
    workspaceId: string,
    input: UpdateWorkspaceInput,
    organizationId: string,
    expectedRevision?: string,
    userId?: string,
  ) {
    if (input.visibility !== undefined) {
      return this.updateVisibility(
        workspaceId,
        input.visibility,
        organizationId,
        expectedRevision,
        userId,
      );
    }
    const { visibility: _visibility, ...detailsInput } = input;
    const filters = [
      eq(workspacesDb.id, workspaceId),
      workspaceAccessCondition(organizationId, userId, "owner"),
    ];
    if (expectedRevision) {
      filters.push(eq(workspacesDb.updatedAt, revisionDate(expectedRevision)));
    }
    const workspace = await this.retryHiddenSlugConflict(
      detailsInput.slug,
      organizationId,
      userId,
      async (slug) => {
        const [updated] = await this.database.db
          .update(workspacesDb)
          .set({
            ...detailsInput,
            ...(slug === undefined ? {} : { slug }),
            syncedUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(...filters))
          .returning();
        return updated;
      },
    );
    if (!workspace) {
      if (expectedRevision) {
        await this.find(workspaceId, organizationId, userId, "owner");
        throw new ConflictException(
          "Resource revision does not match If-Match",
        );
      }
      throw new NotFoundException("Workspace not found");
    }
    return toWorkspaceDto(workspace);
  }

  private async updateVisibility(
    workspaceId: string,
    visibility:
      | typeof WORKSPACE_VISIBILITY.private
      | typeof WORKSPACE_VISIBILITY.shared,
    organizationId: string,
    expectedRevision?: string,
    userId?: string,
  ) {
    if (visibility === WORKSPACE_VISIBILITY.private && !userId) {
      throw new UnprocessableEntityException({
        code: "OWNER_REQUIRED",
        message: "Private workspaces require an owner",
      });
    }

    const filters = [
      eq(workspacesDb.id, workspaceId),
      workspaceAccessCondition(organizationId, userId, "owner"),
    ];
    if (expectedRevision) {
      filters.push(eq(workspacesDb.updatedAt, revisionDate(expectedRevision)));
    }

    const workspace = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workspacesDb)
        .set({
          ownerId:
            visibility === WORKSPACE_VISIBILITY.private ? userId : null,
          syncedUpdatedAt: new Date(),
          updatedAt: new Date(),
          visibility,
        })
        .where(and(...filters))
        .returning();

      if (updated && visibility === WORKSPACE_VISIBILITY.shared) {
        await tx
          .delete(workspaceMembersDb)
          .where(eq(workspaceMembersDb.workspaceId, workspaceId));
      }
      return updated;
    });

    if (!workspace) {
      if (expectedRevision) {
        await this.find(workspaceId, organizationId, userId, "owner");
        throw new ConflictException(
          "Resource revision does not match If-Match",
        );
      }
      throw new NotFoundException("Workspace not found");
    }
    return toWorkspaceDto(workspace);
  }

  async delete(workspaceId: string, organizationId: string, userId?: string) {
    const [workspace] = await this.database.db
      .delete(workspacesDb)
      .where(
        and(
          eq(workspacesDb.id, workspaceId),
          workspaceAccessCondition(organizationId, userId, "owner"),
        ),
      )
      .returning({ id: workspacesDb.id });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  private async find(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    access: "owner" | "read" = "read",
  ) {
    const [workspace] = await this.database.db
      .select()
      .from(workspacesDb)
      .where(
        and(
          eq(workspacesDb.id, workspaceId),
          workspaceAccessCondition(organizationId, userId, access),
        ),
      )
      .limit(1);
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  private async retryHiddenSlugConflict<T>(
    slug: string | undefined,
    organizationId: string,
    userId: string | undefined,
    operation: (slug: string | undefined) => Promise<T>,
  ) {
    try {
      return await operation(slug);
    } catch (error) {
      if (!isUniqueViolation(error, "workspaces_org_slug_unique")) throw error;
      if (
        !slug ||
        (await this.hasAccessibleSlug(slug, organizationId, userId))
      ) {
        throw new ConflictException("Workspace slug already exists");
      }
    }

    try {
      return await operation(`${slug}-${randomBytes(2).toString("hex")}`);
    } catch (error) {
      if (isUniqueViolation(error, "workspaces_org_slug_unique")) {
        throw new ConflictException("Workspace slug already exists");
      }
      throw error;
    }
  }

  private async hasAccessibleSlug(
    slug: string,
    organizationId: string,
    userId?: string,
  ) {
    const [workspace] = await this.database.db
      .select({ id: workspacesDb.id })
      .from(workspacesDb)
      .where(
        and(
          eq(workspacesDb.slug, slug),
          workspaceAccessCondition(organizationId, userId),
        ),
      )
      .limit(1);
    return Boolean(workspace);
  }
}

function revisionDate(value: string) {
  const date = new Date(value.replaceAll('"', ""));
  if (Number.isNaN(date.getTime())) {
    throw new ConflictException("Resource revision does not match If-Match");
  }
  return date;
}

export function toWorkspaceDto(workspace: WorkspaceRow): WorkspaceDto {
  return {
    createdAt: workspace.createdAt.toISOString(),
    id: workspace.id,
    name: workspace.name,
    organizationId: workspace.organizationId,
    slug: workspace.slug,
    updatedAt: workspace.updatedAt.toISOString(),
    lastActivityAt: (workspace.lastActivityAt ?? workspace.updatedAt).toISOString(),
    visibility:
      workspace.visibility === WORKSPACE_VISIBILITY.private
        ? WORKSPACE_VISIBILITY.private
        : WORKSPACE_VISIBILITY.shared,
  };
}
