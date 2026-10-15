import { SetMetadata } from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import type { AgentScope } from "@repo/agent-contracts";

export const AGENT_SCOPE_METADATA = Symbol("agent-scope");

export type AgentPrincipal =
  | {
      actorId: string;
      credentialId: string;
      kind: "apiKey";
      scopes: AgentScope[];
      organizationIds: string[];
    }
  | {
      actorId: string;
      clientId: string;
      kind: "oauth";
      scopes: AgentScope[];
      organizationIds: null;
    }
  | {
      actorId: string;
      kind: "session";
      scopes: AgentScope[];
      organizationIds: null;
    };

export const RequireAgentScope = (scope: AgentScope): MethodDecorator =>
  (target, propertyKey, descriptor) => {
    SetMetadata(AGENT_SCOPE_METADATA, scope)(target, propertyKey, descriptor);
    ApiOperation({ operationId: agentOperationId(String(propertyKey)) })(
      target,
      propertyKey,
      descriptor,
    );
  };

export function agentOperationId(handlerName: string) {
  const names: Record<string, string> = {
    inviteMember: "invite_organization_member",
    listMembers: "list_organization_members",
    previewRemoveMember: "preview_remove_organization_member",
    removeMember: "remove_organization_member",
  };
  return (
    names[handlerName] ??
    handlerName.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)
  );
}
