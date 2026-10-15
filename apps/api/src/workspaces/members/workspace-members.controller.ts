import {
  ActionApi,
  CreateApi,
  DeleteApi,
  RetrieveApi,
  UpdateApi,
} from "@app/utils/openapi";
import { Body, Controller, Param } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import { DeferPermissionCheck } from "../../security/permissions/permission.decorator";
import { UserDataAccessService } from "../core/user-data-access.service";
import {
  AddWorkspaceMemberDto,
  WorkspaceIdResponseDto,
  WorkspaceMemberDto,
  WorkspaceMemberParamsDto,
  WorkspaceMembersDto,
  WorkspaceMembersParamsDto,
  TransferWorkspaceDto,
  UpdateWorkspaceMemberDto,
} from "./workspace-members.schema";
import { WorkspaceMembersService } from "./workspace-members.service";

@Controller("workspaces/:workspaceId")
@DeferPermissionCheck()
export class WorkspaceMembersController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly workspaceMembers: WorkspaceMembersService,
  ) {}

  @RetrieveApi({
    path: "members",
    serializer: WorkspaceMembersDto,
    operation: { summary: "List private workspace members" },
  })
  async list(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceMembersParamsDto })
    params: WorkspaceMembersParamsDto,
  ): Promise<WorkspaceMembersDto> {
    const organization = await this.access.requireOrganization(session);
    this.log("list", params.workspaceId);
    return this.workspaceMembers.list(
      params.workspaceId,
      organization.organizationId,
      organization.userId,
    );
  }

  @CreateApi({
    path: "members",
    serializer: WorkspaceMemberDto,
    operation: { summary: "Grant private workspace access" },
  })
  async add(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceMembersParamsDto })
    params: WorkspaceMembersParamsDto,
    @Body({ schema: AddWorkspaceMemberDto }) body: AddWorkspaceMemberDto,
  ): Promise<WorkspaceMemberDto> {
    const organization = await this.access.requireOrganization(session);
    this.log("add", params.workspaceId);
    return this.workspaceMembers.add({
      organizationId: organization.organizationId,
      ownerId: organization.userId,
      workspaceId: params.workspaceId,
      role: body.role,
      userId: body.userId,
    });
  }

  @UpdateApi({
    path: "members/:memberId",
    serializer: WorkspaceMemberDto,
    operation: { summary: "Change private workspace role" },
  })
  async update(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceMemberParamsDto })
    params: WorkspaceMemberParamsDto,
    @Body({ schema: UpdateWorkspaceMemberDto }) body: UpdateWorkspaceMemberDto,
  ): Promise<WorkspaceMemberDto> {
    const organization = await this.access.requireOrganization(session);
    this.log("update", params.workspaceId);
    return this.workspaceMembers.update({
      ...body,
      ...params,
      ...organization,
      ownerId: organization.userId,
    });
  }

  @DeleteApi({
    path: "members/:memberId",
    operation: { summary: "Revoke private workspace access" },
  })
  async remove(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceMemberParamsDto })
    params: WorkspaceMemberParamsDto,
  ): Promise<{ id: string }> {
    const organization = await this.access.requireOrganization(session);
    this.log("remove", params.workspaceId);
    return this.workspaceMembers.remove({
      ...params,
      ...organization,
      ownerId: organization.userId,
    });
  }

  @ActionApi({
    path: "transfer",
    serializer: WorkspaceIdResponseDto,
    operation: { summary: "Transfer private workspace ownership" },
  })
  async transfer(
    @Session() session: UserSession,
    @Param({ schema: WorkspaceMembersParamsDto })
    params: WorkspaceMembersParamsDto,
    @Body({ schema: TransferWorkspaceDto }) body: TransferWorkspaceDto,
  ): Promise<{ id: string }> {
    const organization = await this.access.requireOrganization(session);
    this.log("transfer", params.workspaceId);
    return this.workspaceMembers.transfer({
      organizationId: organization.organizationId,
      ownerId: organization.userId,
      workspaceId: params.workspaceId,
      userId: body.userId,
    });
  }

  private log(operation: string, workspaceId: string) {
    useLogger().set({
      userData: { entity: "workspaceMember", operation, workspaceId },
    });
  }
}
