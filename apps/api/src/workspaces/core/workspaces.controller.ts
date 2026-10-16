import {
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
import { UserDataAccessService } from "./user-data-access.service";
import {
  CreateWorkspaceDto,
  WorkspaceDto,
  WorkspaceParamsDto,
  WorkspacesListQueryDto,
  WorkspacesListResponseDto,
  UpdateWorkspaceDto,
} from "./workspaces.schema";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly workspaces: WorkspacesService
  ) {}

  @ListApi({
    paginatedSerializer: WorkspacesListResponseDto,
    operation: { summary: "List workspaces in active organization" },
  })
  @RequirePermission(permission.workspace.read)
  async list(
    @Session() session: UserSession,
    @Query({ schema: WorkspacesListQueryDto }) query: WorkspacesListQueryDto
  ): Promise<WorkspacesListResponseDto> {
    const organization = await this.access.requireOrganization(session);
    this.log("list");
    return this.workspaces.list({ ...query, ...organization });
  }

  @CreateApi({
    serializer: WorkspaceDto,
    operation: { summary: "Create a shared workspace" },
  })
  @RequirePermission(permission.workspace.create)
  async create(
    @Session() session: UserSession,
    @Body({ schema: CreateWorkspaceDto }) body: CreateWorkspaceDto
  ): Promise<WorkspaceDto> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("create");
    return this.workspaces.create(body, organizationId, userId);
  }

  @RetrieveApi({
    path: ":workspaceId",
    serializer: WorkspaceDto,
    operation: { summary: "Get a workspace" },
  })
  @RequirePermission(permission.workspace.read)
  async get(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceParamsDto }) params: WorkspaceParamsDto
  ): Promise<WorkspaceDto> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("get", params.workspaceId);
    return this.workspaces.get(params.workspaceId, organizationId, userId);
  }

  @UpdateApi({
    path: ":workspaceId",
    serializer: WorkspaceDto,
    operation: { summary: "Update a workspace" },
  })
  @RequirePermission(permission.workspace.update)
  async update(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceParamsDto }) params: WorkspaceParamsDto,
    @Body({ schema: UpdateWorkspaceDto }) body: UpdateWorkspaceDto
  ): Promise<WorkspaceDto> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("update", params.workspaceId);
    return this.workspaces.update(
      params.workspaceId,
      body,
      organizationId,
      undefined,
      userId
    );
  }

  @DeleteApi({
    path: ":workspaceId",
    operation: { summary: "Delete a workspace" },
  })
  @RequirePermission(permission.workspace.delete)
  async delete(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceParamsDto }) params: WorkspaceParamsDto
  ): Promise<{ id: string }> {
    const { organizationId, userId } =
      await this.access.requireOrganization(session);
    this.log("delete", params.workspaceId);
    return this.workspaces.delete(params.workspaceId, organizationId, userId);
  }

  private log(operation: string, workspaceId?: string) {
    useLogger().set({
      userData: { entity: "workspace", operation, workspaceId },
    });
  }
}
