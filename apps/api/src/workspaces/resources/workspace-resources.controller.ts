import {
  ActionApi,
  CreateApi,
  DeleteApi,
  ListApi,
  RetrieveApi,
  UpdateApi,
} from "@app/utils/openapi";
import { Body, Controller, Param, Query } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import { RequirePermission } from "../../security/permissions/permission.decorator";
import { UserDataAccessService } from "../core/user-data-access.service";
import {
  CreateWorkspaceResourceDto,
  WorkspaceResourceActionDto,
  WorkspaceResourceDto,
  WorkspaceResourceParamsDto,
  WorkspaceResourcesListQueryDto,
  WorkspaceResourcesListResponseDto,
  WorkspaceResourcesParamsDto,
  UpdateWorkspaceResourceDto,
} from "./workspace-resources.schema";
import { WorkspaceResourcesService } from "./workspace-resources.service";

@Controller("workspaces/:workspaceId/resources")
export class WorkspaceResourcesController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly resources: WorkspaceResourcesService,
  ) {}

  @ListApi({
    paginatedSerializer: WorkspaceResourcesListResponseDto,
    operation: { summary: "List workspace resources" },
  })
  @RequirePermission(permission.content.read)
  async list(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourcesParamsDto })
    params: WorkspaceResourcesParamsDto,
    @Query({ schema: WorkspaceResourcesListQueryDto })
    query: WorkspaceResourcesListQueryDto,
  ): Promise<WorkspaceResourcesListResponseDto> {
    const organization = await this.access.requireOrganization(session);
    this.log("list", params.workspaceId);
    return this.resources.list({ ...query, ...organization, ...params });
  }

  @CreateApi({
    serializer: WorkspaceResourceDto,
    operation: { summary: "Create a workspace resource" },
  })
  @RequirePermission(permission.content.write)
  async create(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourcesParamsDto })
    params: WorkspaceResourcesParamsDto,
    @Body({ schema: CreateWorkspaceResourceDto })
    body: CreateWorkspaceResourceDto,
  ): Promise<WorkspaceResourceDto> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("create", params.workspaceId);
    return this.resources.create(
      body,
      params.workspaceId,
      organizationId,
      userId,
    );
  }

  @RetrieveApi({
    path: ":resourceId",
    serializer: WorkspaceResourceDto,
    operation: { summary: "Get a workspace resource" },
  })
  @RequirePermission(permission.content.read)
  async get(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourceParamsDto })
    params: WorkspaceResourceParamsDto,
  ): Promise<WorkspaceResourceDto> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("get", params.workspaceId, params.resourceId);
    return this.resources.get(
      params.resourceId,
      params.workspaceId,
      organizationId,
      userId,
    );
  }

  @UpdateApi({
    path: ":resourceId",
    serializer: WorkspaceResourceDto,
    operation: { summary: "Update a workspace resource" },
  })
  @RequirePermission(permission.content.write)
  async update(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourceParamsDto })
    params: WorkspaceResourceParamsDto,
    @Body({ schema: UpdateWorkspaceResourceDto })
    body: UpdateWorkspaceResourceDto,
  ): Promise<WorkspaceResourceDto> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("update", params.workspaceId, params.resourceId);
    return this.resources.update(
      params.resourceId,
      body,
      params.workspaceId,
      organizationId,
      undefined,
      userId,
    );
  }

  @DeleteApi({
    path: ":resourceId",
    operation: { summary: "Move a workspace resource subtree to Trash" },
  })
  @RequirePermission(permission.content.delete)
  async delete(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourceParamsDto })
    params: WorkspaceResourceParamsDto,
  ): Promise<{ id: string }> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("delete", params.workspaceId, params.resourceId);
    return this.resources.delete(
      params.resourceId,
      params.workspaceId,
      organizationId,
      userId,
    );
  }

  @ActionApi({
    path: ":resourceId/restore",
    serializer: WorkspaceResourceActionDto,
    operation: { summary: "Restore a workspace resource subtree from Trash" },
  })
  @RequirePermission(permission.content.write)
  async restore(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourceParamsDto })
    params: WorkspaceResourceParamsDto,
  ): Promise<{ id: string }> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("restore", params.workspaceId, params.resourceId);
    return this.resources.restore(
      params.resourceId,
      params.workspaceId,
      organizationId,
      userId,
    );
  }

  @DeleteApi({
    path: ":resourceId/purge",
    operation: { summary: "Permanently delete a trashed resource subtree" },
  })
  @RequirePermission(permission.content.delete)
  async purge(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceResourceParamsDto })
    params: WorkspaceResourceParamsDto,
  ): Promise<{ id: string }> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("purge", params.workspaceId, params.resourceId);
    return this.resources.purge(
      params.resourceId,
      params.workspaceId,
      organizationId,
      userId,
    );
  }

  private log(operation: string, workspaceId: string, resourceId?: string) {
    useLogger().set({
      userData: {
        entity: "workspaceResource",
        resourceId,
        operation,
        workspaceId,
      },
    });
  }
}
