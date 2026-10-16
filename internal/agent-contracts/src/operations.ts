import { agentOperationDescriptions } from "./descriptions";
import type { AgentScope } from "./schemas";
import { type AgentOperationWireDefinition, agentOperationWire } from "./wire";

export const agentOperationIds = [
  "list_organizations",
  "get_organization",
  "list_organization_members",
  "list_workspaces",
  "get_workspace",
  "list_resources",
  "search_resources",
  "get_resource",
  "get_yjs_storage_json",
  "get_yjs_storage_state",
  "list_key_value_storage",
  "get_file_download_url",
  "update_organization",
  "create_workspace",
  "update_workspace",
  "create_resource",
  "update_resource",
  "invite_organization_member",
  "preview_delete_workspace",
  "delete_workspace",
  "preview_delete_resource",
  "delete_resource",
  "preview_remove_organization_member",
  "remove_organization_member",
] as const;

export type AgentOperationId = (typeof agentOperationIds)[number];
export type AgentOperationOfflineAvailability = "cloud-required" | "supported";
export type AgentOperationRisk = "read" | "write" | "destructive";

export interface AgentOperationDefinition {
  description: string;
  id: AgentOperationId;
  offlineAvailability: AgentOperationOfflineAvailability;
  risk: AgentOperationRisk;
  scope: AgentScope;
  transport: AgentOperationWireDefinition;
}

type AgentOperationMetadata = Omit<
  AgentOperationDefinition,
  "offlineAvailability" | "transport"
> & {
  offlineAvailability?: AgentOperationOfflineAvailability;
};

const definitions: AgentOperationMetadata[] = [
  ...[
    "list_organizations",
    "get_organization",
    "list_organization_members",
  ].map((id) => ({
    offlineAvailability:
      id === "list_organization_members"
        ? ("cloud-required" as const)
        : ("supported" as const),
    id: id as AgentOperationId,
    description: agentOperationDescriptions[id as AgentOperationId],
    risk: "read" as const,
    scope: "organization:read" as const,
  })),
  ...[
    "list_workspaces",
    "get_workspace",
    "list_resources",
    "search_resources",
    "get_resource",
  ].map((id) => ({
    id: id as AgentOperationId,
    description: agentOperationDescriptions[id as AgentOperationId],
    risk: "read" as const,
    scope: "workspace:read" as const,
  })),
  ...[
    "get_yjs_storage_json",
    "get_yjs_storage_state",
    "list_key_value_storage",
  ].map((id) => ({
    id: id as AgentOperationId,
    description: agentOperationDescriptions[id as AgentOperationId],
    risk: "read" as const,
    scope: "content:read" as const,
  })),
  {
    id: "get_file_download_url",
    description: agentOperationDescriptions.get_file_download_url,
    risk: "read",
    scope: "file:read",
  },
  ...[
    "create_workspace",
    "update_workspace",
    "create_resource",
    "update_resource",
  ].map((id) => ({
    id: id as AgentOperationId,
    description: agentOperationDescriptions[id as AgentOperationId],
    risk: "write" as const,
    scope: "workspace:write" as const,
  })),
  ...["update_organization", "invite_organization_member"].map((id) => ({
    offlineAvailability: "cloud-required" as const,
    id: id as AgentOperationId,
    description: agentOperationDescriptions[id as AgentOperationId],
    risk: "write" as const,
    scope: "organization:manage" as const,
  })),
  ...[
    "preview_delete_workspace",
    "delete_workspace",
    "preview_delete_resource",
    "delete_resource",
  ].map((id) => ({
    id: id as AgentOperationId,
    description: agentOperationDescriptions[id as AgentOperationId],
    risk: id.startsWith("preview")
      ? ("read" as const)
      : ("destructive" as const),
    scope: "workspace:delete" as const,
  })),
  ...["preview_remove_organization_member", "remove_organization_member"].map(
    (id) => ({
      offlineAvailability: "cloud-required" as const,
      id: id as AgentOperationId,
      description: agentOperationDescriptions[id as AgentOperationId],
      risk: id.startsWith("preview")
        ? ("read" as const)
        : ("destructive" as const),
      scope: "organization:manage" as const,
    })
  ),
];

export const agentOperations = Object.fromEntries(
  definitions.map((definition) => [
    definition.id,
    {
      offlineAvailability: "supported",
      ...definition,
      transport: agentOperationWire[definition.id],
    },
  ])
) as Record<AgentOperationId, AgentOperationDefinition>;
