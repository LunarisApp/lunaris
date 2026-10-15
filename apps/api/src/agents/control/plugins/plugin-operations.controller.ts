import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { findBuiltInPluginMcpProcedure } from "@repo/agent-contracts";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  DeferPermissionCheck,
  RequirePermission,
} from "../../../security/permissions/permission.decorator";
import { UserDataAccessService } from "../../../workspaces/core/user-data-access.service";
import {
  AgentAccessGuard,
  type AgentRequest,
} from "../access/agent-access.guard";
import { RequireAgentScope } from "../access/agent-principal";
import { AgentAuditInterceptor } from "../audit/agent-audit.interceptor";
import { AgentSafetyService } from "../safety/agent-safety.service";
import { BuiltInPluginOperationsService } from "./plugin-operations.service";

@Controller("organizations/:organizationId/workspaces/:workspaceId/plugins")
@SetMetadata("PUBLIC", true)
@DeferPermissionCheck()
@UseGuards(AgentAccessGuard)
@UseInterceptors(AgentAuditInterceptor)
export class BuiltInPluginControlController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly operations: BuiltInPluginOperationsService,
    private readonly safety: AgentSafetyService,
  ) {}

  @Get(":pluginId/operations/:operation")
  @RequirePermission(permission.content.read)
  @RequireAgentScope("workspace:read")
  async getPluginOperation(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("pluginId") pluginId: string,
    @Param("operation") operation: string,
    @Query() input: Record<string, unknown>,
  ) {
    assertProcedureMode(pluginId, operation, "read");
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    principal(request);
    return this.operations.execute({
      actorId: userId,
      input,
      operation,
      pluginId,
      workspaceId,
      organizationId,
    });
  }

  @Post(":pluginId/operations/:operation")
  @RequirePermission(permission.content.write)
  @RequireAgentScope("workspace:write")
  async executePluginOperation(
    @Req() request: AgentRequest,
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("pluginId") pluginId: string,
    @Param("operation") operation: string,
    @Body() body: Record<string, unknown>,
    @Headers("if-match") expectedRevision?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    assertProcedureMode(pluginId, operation, "mutation");
    const { userId } = await this.access.requireOrganizationId(
      session,
      organizationId,
    );
    const input = {
      ...body,
      ...(expectedRevision
        ? { expectedRevision: expectedRevision.replaceAll('"', "") }
        : {}),
    };
    return this.safety.idempotent({
      actorId: principal(request),
      key: requiredHeader(idempotencyKey, "Idempotency-Key"),
      operation: `${pluginId}:${operation}`,
      request: { input, pluginId, workspaceId, organizationId },
      run: () =>
        this.operations.execute({
          actorId: userId,
          input,
          operation,
          pluginId,
          workspaceId,
          organizationId,
        }),
    });
  }
}

function assertProcedureMode(
  pluginId: string,
  operation: string,
  mode: "mutation" | "read",
) {
  const procedure = findBuiltInPluginMcpProcedure(pluginId, operation);
  if (
    !procedure ||
    (procedure.execution.risk === "read") !== (mode === "read")
  ) {
    throw new NotFoundException("Built-in extension operation not found");
  }
}

function principal(request: AgentRequest) {
  if (!request.agentPrincipal) {
    throw new InternalServerErrorException("Agent principal missing");
  }
  return request.agentPrincipal.actorId;
}

function requiredHeader(value: string | undefined, name: string) {
  if (!value) throw new BadRequestException(`${name} header is required`);
  return value;
}
