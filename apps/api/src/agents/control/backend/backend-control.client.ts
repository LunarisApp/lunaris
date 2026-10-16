import { DatabaseService } from "@app/db";
import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  type AgentScope,
  findBuiltInPluginMcpProcedure,
  type LunarisControlClient,
  type RequestOptions,
} from "@repo/agent-contracts";
import { and, eq } from "drizzle-orm";
import { useLogger } from "evlog/nestjs";
import { member } from "../../../auth/auth.entity";
import { WorkspaceResourcesService } from "../../../workspaces/resources/workspace-resources.service";
import { WorkspacesService } from "../../../workspaces/core/workspaces.service";
import {
  AgentControlService,
  withCloudProvenance,
} from "../agent-control.service";
import type { AgentPrincipal } from "../access/agent-principal";
import { BuiltInPluginOperationsService } from "../plugins/plugin-operations.service";
import { agentErrorCode, asError } from "../safety/agent-error.utils";
import { AgentSafetyService } from "../safety/agent-safety.service";

@Injectable()
export class BackendControlClientFactory {
  constructor(
    private readonly control: AgentControlService,
    private readonly database: DatabaseService,
    private readonly pluginOperations: BuiltInPluginOperationsService,
    private readonly items: WorkspaceResourcesService,
    private readonly workspaces: WorkspacesService,
    private readonly safety: AgentSafetyService
  ) {}

  create(principal: AgentPrincipal): LunarisControlClient {
    let eligibility: Promise<void> | undefined;
    const access = async (scope: AgentScope, organizationId?: string) => {
      eligibility ??= this.control.assertAgentEligible(principal.actorId);
      await eligibility;
      if (!principal.scopes.includes(scope)) {
        throw new ForbiddenException(`Missing scope: ${scope}`);
      }
      if (!organizationId) {
        return;
      }
      const [membership] = await this.database.db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.userId, principal.actorId),
            eq(member.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!membership) {
        throw new ForbiddenException("Organization membership required");
      }
    };
    const manager = async (organizationId: string) => {
      await access("organization:manage", organizationId);
      await this.control.assertOrganizationOwner(
        principal.actorId,
        organizationId
      );
    };
    const idem = (options: RequestOptions | undefined) => {
      if (!options?.idempotencyKey) {
        throw new ForbiddenException("Idempotency key required");
      }
      return options.idempotencyKey;
    };

    const client: LunarisControlClient = {
      createWorkspace: async (organizationId, input, options) => {
        await access("workspace:write", organizationId);
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: "create_workspace",
          request: { input, organizationId },
          run: async () =>
            withCloudProvenance(
              await this.workspaces.create(
                input,
                organizationId,
                principal.actorId
              )
            ),
        });
      },
      createWorkspaceResource: async (
        organizationId,
        workspaceId,
        input,
        options
      ) => {
        await access("workspace:write", organizationId);
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: "create_resource",
          request: {
            expectedParentResourceTypeId: options?.expectedParentResourceTypeId,
            input,
            workspaceId,
            organizationId,
          },
          run: async () =>
            withCloudProvenance(
              await this.control.createResource({
                actorId: principal.actorId,
                expectedParentResourceTypeId:
                  options?.expectedParentResourceTypeId,
                input,
                workspaceId,
                organizationId,
              })
            ),
        });
      },
      deleteWorkspace: async (
        organizationId,
        workspaceId,
        previewToken,
        options
      ) => {
        await access("workspace:delete", organizationId);
        return this.control.deleteWorkspace({
          actorId: principal.actorId,
          idempotencyKey: idem(options),
          previewToken,
          workspaceId,
          organizationId,
        });
      },
      deleteWorkspaceResource: async (
        organizationId,
        workspaceId,
        resourceId,
        previewToken,
        options
      ) => {
        await access("workspace:delete", organizationId);
        return this.control.deleteResource({
          actorId: principal.actorId,
          expectedResourceTypeId: options?.expectedResourceTypeId,
          idempotencyKey: idem(options),
          resourceId,
          previewToken,
          workspaceId,
          organizationId,
        });
      },
      executePluginOperation: async (
        organizationId,
        workspaceId,
        pluginId,
        operation,
        input,
        options
      ) => {
        const definition = findBuiltInPluginMcpProcedure(pluginId, operation);
        if (!definition) {
          throw new ForbiddenException("Unknown built-in extension operation");
        }
        await access(definition.execution.scope, organizationId);
        const run = () =>
          this.pluginOperations.execute({
            actorId: principal.actorId,
            input,
            operation,
            pluginId,
            workspaceId,
            organizationId,
          });
        if (definition.execution.risk === "read") {
          return run();
        }
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: `${pluginId}:${operation}`,
          request: { input, pluginId, workspaceId, organizationId },
          run,
        });
      },
      getYjsStorageJson: async (organizationId, workspaceId, storageId) => {
        await access("content:read", organizationId);
        return this.control.getYjsStorageJson(
          organizationId,
          workspaceId,
          storageId,
          principal.actorId
        );
      },
      getYjsStorageState: async (
        organizationId,
        workspaceId,
        storageId,
        stateVectorB64
      ) => {
        await access("content:read", organizationId);
        return this.control.getYjsStorageState({
          workspaceId,
          stateVectorB64,
          storageId,
          userId: principal.actorId,
          organizationId,
        });
      },
      getFileDownloadUrl: async (organizationId, workspaceId, storageId) => {
        await access("file:read", organizationId);
        return this.control.getFileDownloadUrl(
          organizationId,
          workspaceId,
          storageId,
          principal.actorId
        );
      },
      getWorkspace: async (organizationId, workspaceId) => {
        await access("workspace:read", organizationId);
        return this.control.getWorkspace(
          organizationId,
          workspaceId,
          principal.actorId
        );
      },
      listKeyValueStorage: async (organizationId, workspaceId, storageId) => {
        await access("content:read", organizationId);
        return this.control.listKeyValueStorage(
          organizationId,
          workspaceId,
          storageId,
          principal.actorId
        );
      },
      getWorkspaceResource: async (organizationId, workspaceId, resourceId) => {
        await access("workspace:read", organizationId);
        return this.control.getResource(
          organizationId,
          workspaceId,
          resourceId,
          principal.actorId
        );
      },
      getOrganization: async (organizationId) => {
        await access("organization:read", organizationId);
        return this.control.getOrganization(organizationId);
      },
      inviteOrganizationMember: async (organizationId, input, options) => {
        await manager(organizationId);
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: "invite_organization_member",
          request: { input, organizationId },
          run: () =>
            this.control.inviteMember(organizationId, input, principal.actorId),
        });
      },
      listWorkspaceResources: async (
        organizationId,
        workspaceId,
        input = {}
      ) => {
        await access("workspace:read", organizationId);
        return this.control.listResources(
          organizationId,
          workspaceId,
          input,
          principal.actorId
        );
      },
      searchResources: async (organizationId, input) => {
        await access("workspace:read", organizationId);
        return this.control.searchResources(
          organizationId,
          input,
          principal.actorId
        );
      },
      listWorkspaces: async (organizationId, input = {}) => {
        await access("workspace:read", organizationId);
        return this.control.listWorkspaces(
          organizationId,
          input,
          principal.actorId
        );
      },
      listOrganizationMembers: async (organizationId, input = {}) => {
        await access("organization:read", organizationId);
        return this.control.listMembers(
          organizationId,
          input.limit ?? 50,
          input.cursor
        );
      },
      listOrganizations: async (input = {}) => {
        await access("organization:read");
        return this.control.listOrganizations(
          principal,
          input.limit ?? 50,
          input.cursor
        );
      },
      previewDeleteWorkspace: async (organizationId, workspaceId) => {
        await access("workspace:delete", organizationId);
        return this.control.previewWorkspace(
          organizationId,
          workspaceId,
          principal.actorId
        );
      },
      previewDeleteWorkspaceResource: async (
        organizationId,
        workspaceId,
        resourceId,
        options
      ) => {
        await access("workspace:delete", organizationId);
        return this.control.previewResource(
          organizationId,
          workspaceId,
          resourceId,
          principal.actorId,
          options?.expectedResourceTypeId
        );
      },
      previewRemoveOrganizationMember: async (organizationId, memberId) => {
        await manager(organizationId);
        return this.control.previewRemoveMember(
          organizationId,
          memberId,
          principal.actorId
        );
      },
      removeOrganizationMember: async (
        organizationId,
        memberId,
        previewToken,
        options
      ) => {
        await manager(organizationId);
        return this.control.removeMember({
          actorId: principal.actorId,
          idempotencyKey: idem(options),
          memberId,
          previewToken,
          organizationId,
        });
      },
      updateWorkspace: async (organizationId, workspaceId, input, options) => {
        await access("workspace:write", organizationId);
        const { expectedRevision: _, ...update } = input;
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: "update_workspace",
          request: { input, workspaceId, organizationId },
          run: async () =>
            withCloudProvenance(
              await this.workspaces.update(
                workspaceId,
                update,
                organizationId,
                input.expectedRevision,
                principal.actorId
              )
            ),
        });
      },
      updateWorkspaceResource: async (
        organizationId,
        workspaceId,
        resourceId,
        input,
        options
      ) => {
        await access("workspace:write", organizationId);
        const { expectedRevision: _, ...update } = input;
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: "update_resource",
          request: { input, resourceId, workspaceId, organizationId },
          run: async () =>
            withCloudProvenance(
              await this.items.update(
                resourceId,
                update,
                workspaceId,
                organizationId,
                input.expectedRevision,
                principal.actorId
              )
            ),
        });
      },
      updateOrganization: async (organizationId, input, options) => {
        await manager(organizationId);
        const { expectedRevision, ...update } = input;
        return this.safety.idempotent({
          actorId: principal.actorId,
          key: idem(options),
          operation: "update_organization",
          request: { input, organizationId },
          run: () =>
            this.control.updateOrganization(
              organizationId,
              update,
              expectedRevision
            ),
        });
      },
    };
    return auditedClient(client, principal, this.safety);
  }
}

function auditedClient(
  client: LunarisControlClient,
  principal: AgentPrincipal,
  safety: AgentSafetyService
) {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return async (...args: unknown[]) => {
        const startedAt = performance.now();
        try {
          const result = await value(...args);
          await audit("success");
          return result;
        } catch (error) {
          await audit("failure", error);
          throw error;
        }

        async function audit(status: "failure" | "success", error?: unknown) {
          const operation = clientOperation(String(property), args);
          try {
            await safety.audit({
              actorId: principal.actorId,
              clientId:
                principal.kind === "oauth"
                  ? principal.clientId
                  : principal.kind === "apiKey"
                    ? principal.credentialId
                    : undefined,
              durationMs: Math.round(performance.now() - startedAt),
              errorCode:
                status === "failure" ? agentErrorCode(error) : undefined,
              operation,
              status,
              targetId: clientTargetId(String(property), args),
              organizationId: typeof args[0] === "string" ? args[0] : undefined,
            });
          } catch (cause) {
            useLogger().error(asError(cause, "Agent audit write failed"), {
              agentAudit: { operation, status, write: "failed" },
            });
          }
        }
      };
    },
  });
}

function clientOperation(method: string, args: unknown[]) {
  if (method === "executePluginOperation") {
    const pluginId = args[2];
    const operation = args[3];
    if (typeof pluginId === "string" && typeof operation === "string") {
      return `${pluginId}:${operation}`;
    }
  }
  const names: Record<string, string> = {
    createWorkspaceResource: "create_resource",
    deleteWorkspaceResource: "delete_resource",
    getWorkspaceResource: "get_resource",
    inviteOrganizationMember: "invite_organization_member",
    listWorkspaceResources: "list_resources",
    previewDeleteWorkspaceResource: "preview_delete_resource",
    removeOrganizationMember: "remove_organization_member",
    updateWorkspaceResource: "update_resource",
  };
  return (
    names[method] ??
    method.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)
  );
}

function clientTargetId(method: string, args: unknown[]) {
  if (method === "executePluginOperation") {
    const input = args[4];
    if (typeof input === "object" && input !== null) {
      const values = input as Record<string, unknown>;
      if (typeof values.documentResourceId === "string") {
        return values.documentResourceId;
      }
      if (typeof values.taskId === "string") {
        return values.taskId;
      }
      if (typeof values.boardId === "string") {
        return values.boardId;
      }
    }
    return;
  }
  return typeof args[2] === "string"
    ? args[2]
    : typeof args[1] === "string"
      ? args[1]
      : undefined;
}
