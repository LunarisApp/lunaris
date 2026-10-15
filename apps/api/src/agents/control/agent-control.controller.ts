import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  DeferPermissionCheck,
  RequirePermission,
} from "../../security/permissions/permission.decorator";
import { WorkspaceResourcesService } from "../../workspaces/resources/workspace-resources.service";
import {
  CreateWorkspaceDto,
  WorkspacesListQueryDto,
  UpdateWorkspaceDto,
} from "../../workspaces/core/workspaces.schema";
import { WorkspacesService } from "../../workspaces/core/workspaces.service";
import { UserDataAccessService } from "../../workspaces/core/user-data-access.service";
import {
  AgentAccessGuard,
  type AgentRequest,
} from "./access/agent-access.guard";
import { RequireAgentScope } from "./access/agent-principal";
import { AgentAuditInterceptor } from "./audit/agent-audit.interceptor";
import {
  AgentCreateResourceDto,
  AgentResourceFiltersDto,
  AgentResourceSearchDto,
  AgentPaginationDto,
  AgentUpdateResourceDto,
  InviteOrganizationMemberDto,
  UpdateOrganizationDto,
} from "./agent-control.schema";
import {
  AgentControlService,
  withCloudProvenance,
} from "./agent-control.service";
import { AgentSafetyService } from "./safety/agent-safety.service";

@Controller("organizations")
@SetMetadata("PUBLIC", true)
@DeferPermissionCheck()
@UseGuards(AgentAccessGuard)
@UseInterceptors(AgentAuditInterceptor)
export class AgentControlController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly control: AgentControlService,
    private readonly items: WorkspaceResourcesService,
    private readonly workspaces: WorkspacesService,
    private readonly safety: AgentSafetyService,
  ) {}

  @Get()
  @RequireAgentScope("organization:read")
  listOrganizations(
    @Req() request: AgentRequest,
    @Query({ schema: AgentPaginationDto }) query: AgentPaginationDto,
  ) {
    return this.control.listOrganizations(
      principal(request),
      query.limit,
      query.cursor,
    );
  }

  @Get(":organizationId")
  @RequirePermission(permission.organization.read)
  @RequireAgentScope("organization:read")
  async getOrganization(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    return this.control.getOrganization(organizationId);
  }

  @Get(":organizationId/resources")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("workspace:read")
  async searchResources(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Query({ schema: AgentResourceSearchDto }) query: AgentResourceSearchDto,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.searchResources(organizationId, query, userId);
  }

  @Patch(":organizationId")
  @RequirePermission(permission.organization.update)
  @RequireAgentScope("organization:manage")
  async updateOrganization(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Body({ schema: UpdateOrganizationDto }) body: UpdateOrganizationDto,
    @Headers("if-match") expectedRevision?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    const actor = principal(request);
    const revision = requiredRevision(expectedRevision);
    await this.control.assertOrganizationOwner(actor.actorId, organizationId);
    return this.safety.idempotent({
      actorId: actor.actorId,
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: "update_organization",
      request: { body, expectedRevision: revision, organizationId },
      run: () =>
        this.control.updateOrganization(organizationId, body, revision),
    });
  }

  @Get(":organizationId/members")
  @RequirePermission(permission.member.read)
  @RequireAgentScope("organization:read")
  async listMembers(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Query({ schema: AgentPaginationDto }) query: AgentPaginationDto,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    return this.control.listMembers(organizationId, query.limit, query.cursor);
  }

  @Post(":organizationId/members/invitations")
  @RequirePermission(permission.invitation.create)
  @RequireAgentScope("organization:manage")
  async inviteMember(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Body({ schema: InviteOrganizationMemberDto })
    body: InviteOrganizationMemberDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    const actor = principal(request);
    await this.control.assertOrganizationOwner(actor.actorId, organizationId);
    return this.safety.idempotent({
      actorId: actor.actorId,
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: "invite_organization_member",
      request: { body, organizationId },
      run: () => this.control.inviteMember(organizationId, body, actor.actorId),
    });
  }

  @Post(":organizationId/members/:memberId/removal-preview")
  @RequirePermission(permission.member.delete)
  @RequireAgentScope("organization:manage")
  async previewRemoveMember(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("memberId") memberId: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    const actor = principal(request);
    await this.control.assertOrganizationOwner(actor.actorId, organizationId);
    return this.control.previewRemoveMember(
      organizationId,
      memberId,
      actor.actorId,
    );
  }

  @Delete(":organizationId/members/:memberId")
  @RequirePermission(permission.member.delete)
  @RequireAgentScope("organization:manage")
  async removeMember(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("memberId") memberId: string,
    @Headers("x-lunaris-preview") previewToken?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    const actor = principal(request);
    await this.control.assertOrganizationOwner(actor.actorId, organizationId);
    return this.control.removeMember({
      actorId: actor.actorId,
      idempotencyKey: requiredHeader(idempotencyKey, "Idempotency-Key"),
      memberId,
      previewToken: requiredHeader(previewToken, "X-Lunaris-Preview"),
      organizationId,
    });
  }

  @Get(":organizationId/workspaces")
  @RequirePermission(permission.workspace.read)
  @RequireAgentScope("workspace:read")
  async listWorkspaces(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Query({ schema: WorkspacesListQueryDto }) query: WorkspacesListQueryDto,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.listWorkspaces(organizationId, query, userId);
  }

  @Post(":organizationId/workspaces")
  @RequirePermission(permission.workspace.create)
  @RequireAgentScope("workspace:write")
  async createWorkspace(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Body({ schema: CreateWorkspaceDto }) body: CreateWorkspaceDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    const actor = principal(request);
    return this.safety.idempotent({
      actorId: actor.actorId,
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: "create_workspace",
      request: { body, organizationId },
      run: async () =>
        withCloudProvenance(
          await this.workspaces.create(body, organizationId, userId),
        ),
    });
  }

  @Get(":organizationId/workspaces/:workspaceId")
  @RequirePermission(permission.workspace.read)
  @RequireAgentScope("workspace:read")
  async getWorkspace(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.getWorkspace(organizationId, workspaceId, userId);
  }

  @Patch(":organizationId/workspaces/:workspaceId")
  @RequirePermission(permission.workspace.update)
  @RequireAgentScope("workspace:write")
  async updateWorkspace(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Body({ schema: UpdateWorkspaceDto }) body: UpdateWorkspaceDto,
    @Headers("if-match") expectedRevision?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    const actor = principal(request);
    const revision = requiredRevision(expectedRevision);
    return this.safety.idempotent({
      actorId: actor.actorId,
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: "update_workspace",
      request: {
        body,
        expectedRevision: revision,
        workspaceId,
        organizationId,
      },
      run: async () =>
        withCloudProvenance(
          await this.workspaces.update(
            workspaceId,
            body,
            organizationId,
            revision,
            userId,
          ),
        ),
    });
  }

  @Post(":organizationId/workspaces/:workspaceId/deletion-preview")
  @RequirePermission(permission.workspace.delete)
  @RequireAgentScope("workspace:delete")
  async previewDeleteWorkspace(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    return this.control.previewWorkspace(
      organizationId,
      workspaceId,
      principal(request).actorId,
    );
  }

  @Delete(":organizationId/workspaces/:workspaceId")
  @RequirePermission(permission.workspace.delete)
  @RequireAgentScope("workspace:delete")
  async deleteWorkspace(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Headers("x-lunaris-preview") previewToken?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    return this.control.deleteWorkspace({
      actorId: principal(request).actorId,
      idempotencyKey: requiredHeader(idempotencyKey, "Idempotency-Key"),
      previewToken: requiredHeader(previewToken, "X-Lunaris-Preview"),
      workspaceId,
      organizationId,
    });
  }

  @Get(":organizationId/workspaces/:workspaceId/resources")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("workspace:read")
  async listResources(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Query({ schema: AgentResourceFiltersDto }) query: AgentResourceFiltersDto,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.listResources(
      organizationId,
      workspaceId,
      query,
      userId,
    );
  }

  @Post(":organizationId/workspaces/:workspaceId/resources")
  @RequirePermission(permission.content.write)
  @RequireAgentScope("workspace:write")
  async createResource(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Body({ schema: AgentCreateResourceDto }) body: AgentCreateResourceDto,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Query("expectedParentResourceTypeId")
    expectedParentResourceTypeId?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    const actor = principal(request);
    return this.safety.idempotent({
      actorId: actor.actorId,
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: "create_resource",
      request: {
        body,
        expectedParentResourceTypeId,
        workspaceId,
        organizationId,
      },
      run: async () =>
        withCloudProvenance(
          await this.control.createResource({
            actorId: actor.actorId,
            expectedParentResourceTypeId,
            input: body,
            workspaceId,
            organizationId,
          }),
        ),
    });
  }

  @Get(":organizationId/workspaces/:workspaceId/resources/:resourceId")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("workspace:read")
  async getResource(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("resourceId") resourceId: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.getResource(
      organizationId,
      workspaceId,
      resourceId,
      userId,
    );
  }

  @Patch(":organizationId/workspaces/:workspaceId/resources/:resourceId")
  @RequirePermission(permission.content.write)
  @RequireAgentScope("workspace:write")
  async updateResource(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("resourceId") resourceId: string,
    @Body({ schema: AgentUpdateResourceDto }) body: AgentUpdateResourceDto,
    @Headers("if-match") expectedRevision?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    const actor = principal(request);
    const revision = requiredRevision(expectedRevision);
    return this.safety.idempotent({
      actorId: actor.actorId,
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: "update_resource",
      request: {
        body,
        expectedRevision: revision,
        resourceId,
        workspaceId,
        organizationId,
      },
      run: async () =>
        withCloudProvenance(
          await this.items.update(
            resourceId,
            body,
            workspaceId,
            organizationId,
            revision,
            actor.actorId,
          ),
        ),
    });
  }

  @Post(
    ":organizationId/workspaces/:workspaceId/resources/:resourceId/deletion-preview",
  )
  @RequirePermission(permission.content.delete)
  @RequireAgentScope("workspace:delete")
  async previewDeleteResource(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("resourceId") resourceId: string,
    @Query("expectedResourceTypeId") expectedResourceTypeId?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    return this.control.previewResource(
      organizationId,
      workspaceId,
      resourceId,
      principal(request).actorId,
      expectedResourceTypeId,
    );
  }

  @Delete(":organizationId/workspaces/:workspaceId/resources/:resourceId")
  @RequirePermission(permission.content.delete)
  @RequireAgentScope("workspace:delete")
  async deleteResource(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("resourceId") resourceId: string,
    @Query("expectedResourceTypeId") expectedResourceTypeId?: string,
    @Headers("x-lunaris-preview") previewToken?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.access.requireOrganizationId(session, organizationId);
    return this.control.deleteResource({
      actorId: principal(request).actorId,
      idempotencyKey: requiredHeader(idempotencyKey, "Idempotency-Key"),
      expectedResourceTypeId,
      resourceId,
      previewToken: requiredHeader(previewToken, "X-Lunaris-Preview"),
      workspaceId,
      organizationId,
    });
  }

  @Get(":organizationId/workspaces/:workspaceId/storage/:storageId/yjs/json")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("content:read")
  async getYjsStorageJson(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("storageId") storageId: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.getYjsStorageJson(
      organizationId,
      workspaceId,
      storageId,
      userId,
    );
  }

  @Get(":organizationId/workspaces/:workspaceId/storage/:storageId/yjs/state")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("content:read")
  async getYjsStorageState(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("storageId") storageId: string,
    @Query("stateVectorB64") stateVectorB64?: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.getYjsStorageState({
      workspaceId,
      stateVectorB64,
      storageId,
      userId,
      organizationId,
    });
  }

  @Get(":organizationId/workspaces/:workspaceId/storage/:storageId/values")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("content:read")
  async listKeyValueStorage(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("storageId") storageId: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.listKeyValueStorage(
      organizationId,
      workspaceId,
      storageId,
      userId,
    );
  }

  @Get(
    ":organizationId/workspaces/:workspaceId/storage/:storageId/file/download-url",
  )
  @RequirePermission(permission.content.read)
  @RequireAgentScope("file:read")
  async getFileDownloadUrl(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("storageId") storageId: string,
  ) {
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    return this.control.getFileDownloadUrl(
      organizationId,
      workspaceId,
      storageId,
      userId,
    );
  }
}

function principal(request: AgentRequest) {
  if (!request.agentPrincipal) {
    throw new InternalServerErrorException("Agent principal missing");
  }
  return request.agentPrincipal;
}

function requiredHeader(value: string | undefined, name: string) {
  if (!value) throw new BadRequestException(`${name} header is required`);
  return value;
}

function requiredRevision(value: string | undefined) {
  return requiredHeader(value, "If-Match").replaceAll('"', "");
}
