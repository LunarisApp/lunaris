import { lockOrganizationCapacity } from "../../entitlements/seats/organization-capacity";
import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import { RESEND_CLIENT } from "@app/resend";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateWorkspaceResourceInput,
  PaginationInput,
  WorkspaceResourceFilters,
  WorkspaceResourceSearchInput,
} from "@repo/agent-contracts";
import { syncOrganizationMemberSeats } from "@repo/auth/server";
import { createId } from "@repo/utils";
import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  ilike,
  inArray,
  isNull,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { useLogger } from "evlog/nestjs";
import type { Resend } from "resend";
import { z } from "zod";
import { AppConfig } from "../../app.config";
import { invitation, member, organization, user } from "../../auth/auth.entity";
import { EntitlementsService } from "../../entitlements";
import { FilesService } from "../../files/files.service";
import { workspaceExtensionsDb } from "../../workspaces/extensions/workspace-extensions.entity";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "../../workspaces/resources/workspace-resources.entity";
import {
  workspaceStorageSlotsDb,
  workspaceStorageValuesDb,
} from "../../workspaces/storage/workspace-storage.entity";
import { workspaceResourceCursorSchema } from "../../workspaces/resources/workspace-resources.schema";
import {
  getStorageHandles,
  WorkspaceResourcesService,
  toWorkspaceResourceDto,
} from "../../workspaces/resources/workspace-resources.service";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import { WorkspacesService } from "../../workspaces/core/workspaces.service";
import { decodeCursor, toPage } from "@app/utils/pagination";
import {
  assertWorkspaceAccess,
  workspaceAccessCondition,
} from "../../workspaces/core/workspace-access";
import { yjsDocumentsDb } from "../../yjs/yjs.entity";
import { YjsDocumentsService } from "../../yjs/yjs-documents.service";
import type { AgentPrincipal } from "./access/agent-principal";
import { AgentSafetyService, fingerprint } from "./safety/agent-safety.service";

type WorkspaceResourceSearchRow = typeof workspaceResourcesDb.$inferSelect & {
  itemSortName: string;
  workspaceName: string;
  workspaceSortName: string;
  rank: number;
};

@Injectable()
export class AgentControlService {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly files: FilesService,
    private readonly items: WorkspaceResourcesService,
    private readonly workspaces: WorkspacesService,
    private readonly safety: AgentSafetyService,
    private readonly yjs: YjsDocumentsService,
    @Inject(RESEND_CLIENT) private readonly resend: Resend | null
  ) {}

  async listOrganizations(
    principal: AgentPrincipal,
    limit: number,
    cursor?: string
  ) {
    const filters = [eq(member.userId, principal.actorId)];
    if (principal.organizationIds) {
      filters.push(inArray(member.organizationId, principal.organizationIds));
    }
    const decoded = decodeCursor(cursor, organizationCursorSchema.parse);
    if (decoded) {
      filters.push(
        or(
          gt(organization.name, decoded.name),
          and(
            eq(organization.name, decoded.name),
            gt(organization.id, decoded.id)
          )
        )!
      );
    }
    const rows = await this.database.db
      .select({
        createdAt: organization.createdAt,
        id: organization.id,
        logo: organization.logo,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .innerJoin(member, eq(member.organizationId, organization.id))
      .where(and(...filters))
      .orderBy(asc(organization.name), asc(organization.id))
      .limit(limit + 1);
    return withCloudPage(
      toPage({
        encode: (row) => ({ id: row.id, name: row.name }),
        limit,
        map: (row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          revision: organizationRevision(row),
        }),
        rows,
      })
    );
  }

  async getOrganization(organizationId: string) {
    const [row] = await this.database.db
      .select({
        createdAt: organization.createdAt,
        id: organization.id,
        logo: organization.logo,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Organization not found");
    }
    return withCloudProvenance({
      ...row,
      createdAt: row.createdAt.toISOString(),
      revision: organizationRevision(row),
    });
  }

  async updateOrganization(
    organizationId: string,
    input: { logo?: string | null; name?: string },
    expectedRevision: string
  ) {
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          createdAt: organization.createdAt,
          id: organization.id,
          logo: organization.logo,
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update")
        .limit(1);
      if (!current) {
        throw new NotFoundException("Organization not found");
      }
      if (organizationRevision(current) !== expectedRevision) {
        throw new ConflictException(
          "Resource revision does not match If-Match"
        );
      }
      const [row] = await tx
        .update(organization)
        .set(input)
        .where(eq(organization.id, organizationId))
        .returning();
      return withCloudProvenance({
        createdAt: row!.createdAt.toISOString(),
        id: row!.id,
        logo: row!.logo,
        name: row!.name,
        revision: organizationRevision(row!),
        slug: row!.slug,
      });
    });
  }

  async listMembers(organizationId: string, limit: number, cursor?: string) {
    const decoded = decodeCursor(cursor, memberCursorSchema.parse);
    const filters = [eq(member.organizationId, organizationId)];
    if (decoded) {
      const createdAt = new Date(decoded.createdAt);
      filters.push(
        or(
          gt(member.createdAt, createdAt),
          and(eq(member.createdAt, createdAt), gt(member.id, decoded.id))
        )!
      );
    }
    const rows = await this.database.db
      .select({
        createdAt: member.createdAt,
        email: user.email,
        id: member.id,
        name: user.name,
        role: member.role,
        userId: member.userId,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(...filters))
      .orderBy(asc(member.createdAt), asc(member.id))
      .limit(limit + 1);
    return withCloudPage(
      toPage({
        encode: (row) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
        }),
        limit,
        map: (row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        }),
        rows,
      })
    );
  }

  async assertOrganizationOwner(actorId: string, organizationId: string) {
    const [membership] = await this.database.db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, actorId)
        )
      )
      .limit(1);
    if (membership?.role !== "owner") {
      throw new ForbiddenException("Organization owner role required");
    }
  }

  async assertAgentEligible(actorId: string) {
    const [actor] = await this.database.db
      .select({ isAnonymous: user.isAnonymous })
      .from(user)
      .where(eq(user.id, actorId))
      .limit(1);
    if (!actor || actor.isAnonymous) {
      throw new ForbiddenException("Agent access requires a claimed account");
    }
  }

  async inviteMember(
    organizationId: string,
    body: { email: string; role: "editor" | "viewer" },
    actorId: string
  ) {
    const email = body.email.trim().toLowerCase();
    const details = await this.entitlements.withMemberCapacity(
      organizationId,
      async (tx) => {
        const [organizationRow] = await tx
          .select({
            isPersonal: organization.isPersonal,
            name: organization.name,
          })
          .from(organization)
          .where(eq(organization.id, organizationId))
          .limit(1);
        if (!organizationRow) {
          throw new NotFoundException("Organization not found");
        }
        if (organizationRow.isPersonal) {
          throw new ForbiddenException(
            "Personal organizations cannot invite members"
          );
        }
        const [inviter] = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, actorId))
          .limit(1);
        if (!inviter) {
          throw new NotFoundException("Inviter not found");
        }
        const existing = await tx
          .select({ id: invitation.id })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, organizationId),
              eq(invitation.email, email),
              eq(invitation.status, "pending")
            )
          )
          .limit(1);
        if (existing.length > 0) {
          throw new ConflictException("Invitation already pending");
        }

        const id = createId("invitation");
        const [created] = await tx
          .insert(invitation)
          .values({
            email,
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            id,
            inviterId: actorId,
            organizationId,
            role: body.role,
            status: "pending",
          })
          .returning();
        if (!created) {
          throw new InternalServerErrorException("Invitation was not created");
        }
        return {
          created,
          inviterName: inviter.name,
          organizationName: organizationRow.name,
        };
      }
    );
    try {
      await this.sendInvitation({
        email,
        id: details.created.id,
        inviterName: details.inviterName,
        role: body.role,
        organizationName: details.organizationName,
      });
    } catch (error) {
      const cause =
        error instanceof Error
          ? error
          : new Error("Invitation email failed", { cause: error });
      useLogger().error(cause, {
        invitation: { delivery: "failed", id: details.created.id },
      });
    }
    return {
      email: details.created.email,
      id: details.created.id,
      organizationId: details.created.organizationId,
      role: details.created.role,
      status: details.created.status,
    };
  }

  async listResources(
    organizationId: string,
    workspaceId: string,
    filters: WorkspaceResourceFilters,
    userId?: string
  ) {
    if (
      !(filters.name || filters.resourceTypeId) &&
      filters.parentId === undefined
    ) {
      return withCloudPage(
        await this.items.list({
          cursor: filters.cursor,
          limit: filters.limit ?? 50,
          organizationId,
          workspaceId,
          userId,
        })
      );
    }
    await this.workspaces.get(workspaceId, organizationId, userId);
    const cursor = decodeCursor(
      filters.cursor,
      workspaceResourceCursorSchema.parse
    );
    const cursorDate = cursor ? new Date(cursor.createdAt) : undefined;
    const where: SQL[] = [
      eq(workspaceResourcesDb.workspaceId, workspaceId),
      notExists(
        this.database.db
          .select({ id: workspaceResourceTrashDb.id })
          .from(workspaceResourceTrashDb)
          .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
      ),
    ];
    if (filters.name) {
      where.push(ilike(workspaceResourcesDb.name, `%${filters.name}%`));
    }
    if (filters.resourceTypeId) {
      where.push(
        eq(workspaceResourcesDb.resourceTypeId, filters.resourceTypeId)
      );
    }
    if (filters.parentId !== undefined) {
      where.push(
        filters.parentId === null
          ? isNull(workspaceResourcesDb.parentId)
          : eq(workspaceResourcesDb.parentId, filters.parentId)
      );
    }
    if (cursor && cursorDate) {
      where.push(
        or(
          gt(workspaceResourcesDb.position, cursor.position),
          and(
            eq(workspaceResourcesDb.position, cursor.position),
            gt(workspaceResourcesDb.createdAt, cursorDate)
          ),
          and(
            eq(workspaceResourcesDb.position, cursor.position),
            eq(workspaceResourcesDb.createdAt, cursorDate),
            gt(workspaceResourcesDb.id, cursor.id)
          )
        )!
      );
    }
    const rows = await this.database.db
      .select(getTableColumns(workspaceResourcesDb))
      .from(workspaceResourcesDb)
      .where(and(...where))
      .orderBy(
        asc(workspaceResourcesDb.position),
        asc(workspaceResourcesDb.createdAt),
        asc(workspaceResourcesDb.id)
      )
      .limit((filters.limit ?? 50) + 1);
    const storage = await getStorageHandles(
      this.database.db,
      rows.map((row) => row.id)
    );
    return withCloudPage(
      toPage({
        encode: (row: typeof workspaceResourcesDb.$inferSelect) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          position: row.position,
        }),
        limit: filters.limit ?? 50,
        map: (row) => toWorkspaceResourceDto(row, storage.get(row.id)),
        rows: rows as (typeof workspaceResourcesDb.$inferSelect)[],
      })
    );
  }

  async searchResources(
    organizationId: string,
    input: WorkspaceResourceSearchInput,
    userId?: string
  ) {
    if (input.workspaceId) {
      await this.workspaces.get(input.workspaceId, organizationId, userId);
    }

    const search = input.search.trim();
    const escapedSearch = escapeLikePattern(search);
    const escapeCharacter = "\\";
    const rank = sql<number>`case
      when lower(${workspaceResourcesDb.name}) = lower(${search})
        or lower(${workspacesDb.name}) = lower(${search}) then 0
      when ${workspaceResourcesDb.name} ilike ${`${escapedSearch}%`} escape ${escapeCharacter}
        or ${workspacesDb.name} ilike ${`${escapedSearch}%`} escape ${escapeCharacter} then 1
      else 2
    end`;
    const itemSortName = sql<string>`lower(${workspaceResourcesDb.name})`;
    const workspaceSortName = sql<string>`lower(${workspacesDb.name})`;
    const cursor = decodeCursor(
      input.cursor,
      workspaceResourceSearchCursorSchema.parse
    );
    const filters: SQL[] = [
      workspaceAccessCondition(organizationId, userId),
      notExists(
        this.database.db
          .select({ id: workspaceResourceTrashDb.id })
          .from(workspaceResourceTrashDb)
          .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
      ),
      or(
        sql`${workspaceResourcesDb.name} ilike ${`%${escapedSearch}%`} escape ${escapeCharacter}`,
        sql`${workspacesDb.name} ilike ${`%${escapedSearch}%`} escape ${escapeCharacter}`
      )!,
    ];
    if (input.workspaceId) {
      filters.push(eq(workspaceResourcesDb.workspaceId, input.workspaceId));
    }
    if (cursor) {
      filters.push(sql`(
        ${rank},
        ${itemSortName},
        ${workspaceSortName},
        ${workspaceResourcesDb.id}
      ) > (
        ${cursor.rank},
        ${cursor.itemName},
        ${cursor.workspaceName},
        ${cursor.resourceId}
      )`);
    }

    const limit = input.limit ?? 50;
    const rows = await this.database.db
      .select({
        ...getTableColumns(workspaceResourcesDb),
        itemSortName,
        workspaceName: workspacesDb.name,
        workspaceSortName,
        rank,
      })
      .from(workspaceResourcesDb)
      .innerJoin(
        workspacesDb,
        eq(workspaceResourcesDb.workspaceId, workspacesDb.id)
      )
      .where(and(...filters))
      .orderBy(
        asc(rank),
        asc(itemSortName),
        asc(workspaceSortName),
        asc(workspaceResourcesDb.id)
      )
      .limit(limit + 1);

    const storage = await getStorageHandles(
      this.database.db,
      rows.map((row) => row.id)
    );
    return withCloudPage(
      toPage({
        encode: (row) => ({
          resourceId: row.id,
          itemName: row.itemSortName,
          workspaceName: row.workspaceSortName,
          rank: row.rank,
        }),
        limit,
        map: (row) => ({
          ...toWorkspaceResourceDto(row, storage.get(row.id)),
          workspaceName: row.workspaceName,
        }),
        rows: rows as WorkspaceResourceSearchRow[],
      })
    );
  }

  async listWorkspaces(
    organizationId: string,
    input: PaginationInput = {},
    userId?: string
  ) {
    return withCloudPage(
      await this.workspaces.list({
        ...input,
        limit: input.limit ?? 50,
        organizationId,
        userId,
      })
    );
  }

  async getWorkspace(
    organizationId: string,
    workspaceId: string,
    userId?: string
  ) {
    return withCloudProvenance(
      await this.workspaces.get(workspaceId, organizationId, userId)
    );
  }

  async getResource(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    userId?: string
  ) {
    return withCloudProvenance(
      await this.items.get(resourceId, workspaceId, organizationId, userId)
    );
  }

  async createResource(params: {
    actorId: string;
    expectedParentResourceTypeId?: string;
    input: CreateWorkspaceResourceInput;
    workspaceId: string;
    organizationId: string;
  }) {
    if (!params.expectedParentResourceTypeId) {
      return this.items.create(
        params.input,
        params.workspaceId,
        params.organizationId,
        params.actorId
      );
    }
    return this.database.db.transaction(async (tx) => {
      if (params.expectedParentResourceTypeId) {
        await assertWorkspaceAccess(
          tx,
          params.workspaceId,
          params.organizationId,
          params.actorId,
          "write"
        );
        if (!params.input.parentId) {
          throw new NotFoundException("Parent workspace resource not found");
        }
        const [parent] = await tx
          .select({ id: workspaceResourcesDb.id })
          .from(workspaceResourcesDb)
          .where(
            and(
              eq(workspaceResourcesDb.id, params.input.parentId),
              eq(workspaceResourcesDb.workspaceId, params.workspaceId),
              eq(
                workspaceResourcesDb.resourceTypeId,
                params.expectedParentResourceTypeId
              )
            )
          )
          .limit(1);
        if (!parent) {
          throw new NotFoundException("Parent workspace resource not found");
        }
      }
      return this.items.createWithDb(
        tx,
        params.input,
        params.workspaceId,
        params.organizationId,
        params.actorId
      );
    });
  }

  async getYjsStorageJson(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    userId?: string
  ) {
    const slot = await this.resolveStorage(
      organizationId,
      workspaceId,
      storageId,
      "yjs",
      userId
    );
    const document = await this.yjs.getJson(
      slot.backingId,
      workspaceId,
      organizationId,
      userId
    );
    return {
      data: document.data,
      resourceId: slot.resourceId,
      resourceTypeId: slot.resourceTypeId,
      provenance: cloudProvenance(),
      revision: document.updatedAt,
      storageId,
      updatedAt: document.updatedAt,
    };
  }

  async getYjsStorageState(params: {
    workspaceId: string;
    stateVectorB64?: string;
    storageId: string;
    userId?: string;
    organizationId: string;
  }) {
    const slot = await this.resolveStorage(
      params.organizationId,
      params.workspaceId,
      params.storageId,
      "yjs",
      params.userId
    );
    const state = await this.yjs.getState({
      documentId: slot.backingId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      stateVectorB64: params.stateVectorB64,
      userId: params.userId,
    });
    return withCloudProvenance({
      encoding: state.encoding,
      resourceId: slot.resourceId,
      stateVectorB64: state.stateVectorB64,
      storageId: params.storageId,
      updateB64: state.updateB64,
      updatedAt: state.updatedAt,
    });
  }

  async listKeyValueStorage(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    userId?: string
  ) {
    const slot = await this.resolveStorage(
      organizationId,
      workspaceId,
      storageId,
      "key-value",
      userId
    );
    const items = await this.database.db
      .select({
        key: workspaceStorageValuesDb.key,
        updatedAt: workspaceStorageValuesDb.updatedAt,
        value: workspaceStorageValuesDb.value,
      })
      .from(workspaceStorageValuesDb)
      .where(
        and(
          eq(workspaceStorageValuesDb.workspaceId, workspaceId),
          eq(workspaceStorageValuesDb.storageId, storageId)
        )
      )
      .orderBy(asc(workspaceStorageValuesDb.key));
    return withCloudProvenance({
      items: items.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
      resourceId: slot.resourceId,
      storageId,
    });
  }

  async getFileDownloadUrl(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    userId?: string
  ) {
    const slot = await this.resolveStorage(
      organizationId,
      workspaceId,
      storageId,
      "file",
      userId
    );
    const metadata = fileStorageMetadataSchema.safeParse(
      parseJson(slot.metadata)
    );
    if (!metadata.success) {
      throw new BadRequestException("File storage metadata is invalid");
    }
    return withCloudProvenance(
      await this.files.getDownloadUrl({
        fileExtension: metadata.data.fileExtension,
        fileId: slot.backingId,
        filename: metadata.data.filename,
        organizationId,
        workspaceId,
        userId,
      })
    );
  }

  async previewWorkspace(
    organizationId: string,
    workspaceId: string,
    actorId: string
  ) {
    const snapshot = await this.workspaceSnapshot(
      organizationId,
      workspaceId,
      undefined,
      actorId
    );
    return this.safety.issuePreview({
      action: "delete_workspace",
      actorId,
      fingerprint: fingerprint(snapshot),
      impact: {
        documents: snapshot.documents.length,
        resources: snapshot.items.length,
        members: 0,
        workspaces: 1,
      },
      targetId: workspaceId,
      organizationId,
    });
  }

  async deleteWorkspace(params: {
    actorId: string;
    idempotencyKey: string;
    previewToken: string;
    workspaceId: string;
    organizationId: string;
  }) {
    return this.safety.idempotent({
      actorId: params.actorId,
      key: params.idempotencyKey,
      operation: "delete_workspace",
      request: params,
      run: () =>
        this.safety.executePreview({
          action: "delete_workspace",
          actorId: params.actorId,
          fingerprint: (tx) =>
            this.currentPreviewFingerprint(() =>
              this.workspaceSnapshot(
                params.organizationId,
                params.workspaceId,
                tx,
                params.actorId
              )
            ),
          previewToken: params.previewToken,
          run: async (tx) => {
            const [removed] = await tx
              .delete(workspacesDb)
              .where(
                and(
                  eq(workspacesDb.id, params.workspaceId),
                  workspaceAccessCondition(
                    params.organizationId,
                    params.actorId,
                    "owner"
                  )
                )
              )
              .returning({ id: workspacesDb.id });
            if (!removed) {
              throw new NotFoundException("Workspace not found");
            }
            return removed;
          },
          targetId: params.workspaceId,
          organizationId: params.organizationId,
        }),
    });
  }

  async previewResource(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    actorId: string,
    expectedResourceTypeId?: string
  ) {
    const snapshot = await this.resourceSnapshot(
      organizationId,
      workspaceId,
      resourceId,
      undefined,
      actorId,
      expectedResourceTypeId
    );
    return this.safety.issuePreview({
      action: "delete_resource",
      actorId,
      fingerprint: fingerprint(snapshot),
      impact: {
        documents: 0,
        resources: snapshot.length,
        members: 0,
        workspaces: 0,
      },
      targetId: resourceId,
      organizationId,
    });
  }

  async deleteResource(params: {
    actorId: string;
    expectedResourceTypeId?: string;
    idempotencyKey: string;
    resourceId: string;
    previewToken: string;
    workspaceId: string;
    organizationId: string;
  }) {
    return this.safety.idempotent({
      actorId: params.actorId,
      key: params.idempotencyKey,
      operation: "delete_resource",
      request: params,
      run: async () =>
        this.safety.executePreview({
          action: "delete_resource",
          actorId: params.actorId,
          fingerprint: (tx) =>
            this.currentPreviewFingerprint(() =>
              this.resourceSnapshot(
                params.organizationId,
                params.workspaceId,
                params.resourceId,
                tx,
                params.actorId,
                params.expectedResourceTypeId
              )
            ),
          previewToken: params.previewToken,
          run: (tx) =>
            this.items.trashWithDb(
              tx,
              params.resourceId,
              params.workspaceId,
              params.organizationId,
              params.actorId,
              params.expectedResourceTypeId
            ),
          targetId: params.resourceId,
          organizationId: params.organizationId,
        }),
    });
  }

  async previewRemoveMember(
    organizationId: string,
    memberId: string,
    actorId: string
  ) {
    const target = await this.memberSnapshot(organizationId, memberId);
    if (target.role === "owner") {
      throw new ForbiddenException("Organization owner cannot be removed");
    }
    return this.safety.issuePreview({
      action: "remove_organization_member",
      actorId,
      fingerprint: fingerprint(target),
      impact: { documents: 0, members: 1, workspaces: 0, resources: 0 },
      targetId: memberId,
      organizationId,
    });
  }

  async removeMember(params: {
    actorId: string;
    idempotencyKey: string;
    memberId: string;
    previewToken: string;
    organizationId: string;
  }) {
    return this.safety.idempotent({
      actorId: params.actorId,
      key: params.idempotencyKey,
      operation: "remove_organization_member",
      request: params,
      run: async () => {
        const removed = await this.safety.executePreview({
          action: "remove_organization_member",
          actorId: params.actorId,
          fingerprint: (tx) =>
            this.currentPreviewFingerprint(async () => {
              const target = await this.memberSnapshot(
                params.organizationId,
                params.memberId,
                tx
              );
              if (target.role === "owner") {
                throw new ForbiddenException(
                  "Organization owner cannot be removed"
                );
              }
              return target;
            }),
          previewToken: params.previewToken,
          run: async (tx) => {
            await lockOrganizationCapacity(tx, params.organizationId);
            const [target] = await tx
              .delete(member)
              .where(
                and(
                  eq(member.id, params.memberId),
                  eq(member.organizationId, params.organizationId)
                )
              )
              .returning({ id: member.id });
            if (!target) {
              throw new NotFoundException("Organization member not found");
            }
            return target;
          },
          targetId: params.memberId,
          organizationId: params.organizationId,
        });
        await syncOrganizationMemberSeats(
          this.entitlements,
          params.organizationId
        );
        return removed;
      },
    });
  }

  private async workspaceSnapshot(
    organizationId: string,
    workspaceId: string,
    db: DatabaseOrTx = this.database.db,
    userId?: string,
    _expectedResourceTypeId?: string
  ) {
    const [workspace] = await db
      .select({ id: workspacesDb.id, updatedAt: workspacesDb.updatedAt })
      .from(workspacesDb)
      .where(
        and(
          eq(workspacesDb.id, workspaceId),
          workspaceAccessCondition(organizationId, userId, "owner")
        )
      )
      .limit(1);
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }
    const [items, documents, extensions, slots, values] = await Promise.all([
      db
        .select({
          id: workspaceResourcesDb.id,
          updatedAt: workspaceResourcesDb.updatedAt,
        })
        .from(workspaceResourcesDb)
        .where(
          and(
            eq(workspaceResourcesDb.workspaceId, workspaceId),
            notExists(
              db
                .select({ id: workspaceResourceTrashDb.id })
                .from(workspaceResourceTrashDb)
                .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
            )
          )
        )
        .orderBy(asc(workspaceResourcesDb.id)),
      db
        .select({ id: yjsDocumentsDb.id, updatedAt: yjsDocumentsDb.updatedAt })
        .from(yjsDocumentsDb)
        .where(eq(yjsDocumentsDb.workspaceId, workspaceId))
        .orderBy(asc(yjsDocumentsDb.id)),
      db
        .select({
          descriptorBytes: workspaceExtensionsDb.descriptorBytes,
          descriptorSha256: workspaceExtensionsDb.descriptorSha256,
          descriptorUrl: workspaceExtensionsDb.descriptorUrl,
          enabled: workspaceExtensionsDb.enabled,
          extensionId: workspaceExtensionsDb.extensionId,
          id: workspaceExtensionsDb.id,
          registryId: workspaceExtensionsDb.registryId,
          updatedAt: workspaceExtensionsDb.updatedAt,
          version: workspaceExtensionsDb.version,
        })
        .from(workspaceExtensionsDb)
        .where(eq(workspaceExtensionsDb.workspaceId, workspaceId))
        .orderBy(asc(workspaceExtensionsDb.id)),
      db
        .select({
          id: workspaceStorageSlotsDb.id,
          updatedAt: workspaceStorageSlotsDb.updatedAt,
        })
        .from(workspaceStorageSlotsDb)
        .where(eq(workspaceStorageSlotsDb.workspaceId, workspaceId))
        .orderBy(asc(workspaceStorageSlotsDb.id)),
      db
        .select({
          id: workspaceStorageValuesDb.id,
          updatedAt: workspaceStorageValuesDb.updatedAt,
        })
        .from(workspaceStorageValuesDb)
        .where(eq(workspaceStorageValuesDb.workspaceId, workspaceId))
        .orderBy(asc(workspaceStorageValuesDb.id)),
    ]);
    return {
      documents: documents.map((document) => ({
        id: document.id,
        updatedAt: document.updatedAt.toISOString(),
      })),
      items: items.map((item) => ({
        id: item.id,
        updatedAt: item.updatedAt.toISOString(),
      })),
      workspaceId,
      workspaceExtensions: extensions.map((extension) => ({
        descriptorBytes: extension.descriptorBytes,
        descriptorSha256: extension.descriptorSha256,
        descriptorUrl: extension.descriptorUrl,
        enabled: extension.enabled,
        extensionId: extension.extensionId,
        id: extension.id,
        registryId: extension.registryId,
        updatedAt: extension.updatedAt.toISOString(),
        version: extension.version,
      })),
      revision: workspace.updatedAt.toISOString(),
      storageSlots: slots.map((slot) => ({
        id: slot.id,
        updatedAt: slot.updatedAt.toISOString(),
      })),
      storageValues: values.map((value) => ({
        id: value.id,
        updatedAt: value.updatedAt.toISOString(),
      })),
    };
  }

  private async resourceSnapshot(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    db: DatabaseOrTx = this.database.db,
    userId?: string,
    expectedResourceTypeId?: string
  ) {
    await assertWorkspaceAccess(db, workspaceId, organizationId, userId);
    const rows = await db
      .select({
        id: workspaceResourcesDb.id,
        parentId: workspaceResourcesDb.parentId,
        resourceTypeId: workspaceResourcesDb.resourceTypeId,
        updatedAt: workspaceResourcesDb.updatedAt,
      })
      .from(workspaceResourcesDb)
      .where(
        and(
          eq(workspaceResourcesDb.workspaceId, workspaceId),
          notExists(
            db
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
          )
        )
      );
    const target = rows.find((row) => row.id === resourceId);
    if (
      !target ||
      (expectedResourceTypeId !== undefined &&
        target.resourceTypeId !== expectedResourceTypeId)
    ) {
      throw new NotFoundException("Workspace resource not found");
    }
    const included = new Set([resourceId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (
          row.parentId &&
          included.has(row.parentId) &&
          !included.has(row.id)
        ) {
          included.add(row.id);
          changed = true;
        }
      }
    }
    return rows
      .filter((row) => included.has(row.id))
      .map((row) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private async resolveStorage(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    kind: "file" | "key-value" | "yjs",
    userId?: string
  ) {
    await assertWorkspaceAccess(
      this.database.db,
      workspaceId,
      organizationId,
      userId
    );
    const [slot] = await this.database.db
      .select({
        backingId: workspaceStorageSlotsDb.backingId,
        kind: workspaceStorageSlotsDb.kind,
        metadata: workspaceStorageSlotsDb.metadata,
        resourceId: workspaceStorageSlotsDb.resourceId,
        resourceTypeId: workspaceResourcesDb.resourceTypeId,
      })
      .from(workspaceStorageSlotsDb)
      .innerJoin(
        workspaceResourcesDb,
        and(
          eq(workspaceStorageSlotsDb.resourceId, workspaceResourcesDb.id),
          eq(
            workspaceStorageSlotsDb.workspaceId,
            workspaceResourcesDb.workspaceId
          )
        )
      )
      .where(
        and(
          eq(workspaceStorageSlotsDb.id, storageId),
          eq(workspaceStorageSlotsDb.workspaceId, workspaceId),
          eq(workspaceStorageSlotsDb.kind, kind),
          notExists(
            this.database.db
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id))
          )
        )
      )
      .limit(1);
    if (!slot?.resourceId) {
      throw new NotFoundException(`${kind} storage not found`);
    }
    if (kind !== "key-value" && !slot.backingId) {
      throw new ConflictException(`${kind} storage backing is missing`);
    }
    return {
      ...slot,
      backingId: slot.backingId ?? "",
      resourceId: slot.resourceId,
    };
  }

  private async memberSnapshot(
    organizationId: string,
    memberId: string,
    db: DatabaseOrTx = this.database.db
  ) {
    const [target] = await db
      .select({ id: member.id, role: member.role, userId: member.userId })
      .from(member)
      .where(
        and(eq(member.id, memberId), eq(member.organizationId, organizationId))
      )
      .limit(1);
    if (!target) {
      throw new NotFoundException("Organization member not found");
    }
    return target;
  }

  private async currentPreviewFingerprint(read: () => Promise<unknown>) {
    try {
      return fingerprint(await read());
    } catch (error) {
      if (error instanceof NotFoundException) {
        return fingerprint({ state: "missing-after-preview" });
      }
      throw error;
    }
  }

  private async sendInvitation(params: {
    email: string;
    id: string;
    inviterName: string;
    role: string;
    organizationName: string;
  }) {
    if (!this.resend) {
      useLogger().set({ invitation: { delivery: "skipped", id: params.id } });
      return;
    }
    const url = new URL("/auth/accept-invitation", this.appConfig.frontendUrl);
    url.searchParams.set("invitationId", params.id);
    await this.resend.emails.send({
      from: "Lunaris <noreply@mail.lunaris.app>",
      html: `<p>Hi,</p><p>${escapeHtml(params.inviterName)} invited you to join <strong>${escapeHtml(params.organizationName)}</strong> on Lunaris as <strong>${escapeHtml(params.role)}</strong>.</p><p><a href="${url}">Accept invitation</a></p>`,
      replyTo: "Lunaris <hello@lunaris.app>",
      subject: `${stripLines(params.inviterName)} invited you to ${stripLines(params.organizationName)}`,
      to: params.email,
    });
  }
}

const organizationCursorSchema = z.object({ id: z.string(), name: z.string() });
const memberCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string(),
});
const workspaceResourceSearchCursorSchema = z.object({
  resourceId: z.string(),
  itemName: z.string(),
  workspaceName: z.string(),
  rank: z.number().int().min(0).max(2),
});
const fileStorageMetadataSchema = z.object({
  fileExtension: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
});

function parseJson(value: string | null) {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function escapeLikePattern(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripLines(value: string) {
  return value.replace(/[\r\n]/g, " ");
}

function organizationRevision(organization: {
  logo: string | null;
  name: string;
  slug: string;
}) {
  return fingerprint({
    logo: organization.logo,
    name: organization.name,
    slug: organization.slug,
  });
}

export function cloudProvenance() {
  return {
    asOf: new Date().toISOString(),
    source: "cloud-live" as const,
    syncState: "current" as const,
  };
}

export function withCloudProvenance<T extends object>(value: T) {
  return {
    ...value,
    provenance: cloudProvenance(),
  };
}

export function withCloudPage<T extends object>(page: {
  items: T[];
  nextCursor: string | null;
}) {
  const provenance = cloudProvenance();
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      provenance,
    })),
    snapshot: {
      completeness: "complete" as const,
      confirmedAt: provenance.asOf,
      syncState: "current" as const,
    },
  };
}
