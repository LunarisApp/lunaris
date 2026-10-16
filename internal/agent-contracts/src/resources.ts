import type { AgentOperationId } from "./operations";

export interface AgentResourceDefinition {
  name: string;
  operation: AgentOperationId;
  uriTemplate: string;
}

export const agentResourceDefinitions = [
  {
    name: "organization",
    operation: "get_organization",
    uriTemplate: "lunaris://organizations/{organizationId}",
  },
  {
    name: "organization-members",
    operation: "list_organization_members",
    uriTemplate: "lunaris://organizations/{organizationId}/members",
  },
  {
    name: "workspace",
    operation: "get_workspace",
    uriTemplate:
      "lunaris://organizations/{organizationId}/workspaces/{workspaceId}",
  },
  {
    name: "workspace-resources",
    operation: "list_resources",
    uriTemplate:
      "lunaris://organizations/{organizationId}/workspaces/{workspaceId}/resources",
  },
  {
    name: "yjs-storage-json",
    operation: "get_yjs_storage_json",
    uriTemplate:
      "lunaris://organizations/{organizationId}/workspaces/{workspaceId}/storage/{storageId}/yjs",
  },
] as const satisfies readonly AgentResourceDefinition[];
