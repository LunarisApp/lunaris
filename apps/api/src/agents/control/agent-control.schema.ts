import {
  createWorkspaceResourceInputSchema,
  inviteOrganizationMemberInputSchema,
  workspaceResourceChangesSchema,
  workspaceResourceFiltersSchema,
  workspaceResourceSearchInputSchema,
  organizationChangesSchema,
} from "@repo/agent-contracts";
import type { infer as Infer } from "zod";
import { paginationQuerySchema } from "@app/utils/pagination";

export const AgentResourceFiltersDto = workspaceResourceFiltersSchema
  .extend({ limit: paginationQuerySchema.shape.limit })
  .meta({ id: "AgentResourceFiltersDto" });
export type AgentResourceFiltersDto = Infer<typeof AgentResourceFiltersDto>;
export const AgentResourceSearchDto = workspaceResourceSearchInputSchema
  .extend({
    limit: paginationQuerySchema.shape.limit,
  })
  .meta({ id: "AgentResourceSearchDto" });
export type AgentResourceSearchDto = Infer<typeof AgentResourceSearchDto>;
export const AgentCreateResourceDto = createWorkspaceResourceInputSchema.meta({
  id: "AgentCreateResourceDto",
});
export type AgentCreateResourceDto = Infer<typeof AgentCreateResourceDto>;
export const AgentPaginationDto = paginationQuerySchema.meta({
  id: "AgentPaginationDto",
});
export type AgentPaginationDto = Infer<typeof AgentPaginationDto>;
export const UpdateOrganizationDto = organizationChangesSchema.meta({
  id: "UpdateOrganizationDto",
});
export type UpdateOrganizationDto = Infer<typeof UpdateOrganizationDto>;
export const AgentUpdateResourceDto = workspaceResourceChangesSchema.meta({
  id: "AgentUpdateResourceDto",
});
export type AgentUpdateResourceDto = Infer<typeof AgentUpdateResourceDto>;
export const InviteOrganizationMemberDto =
  inviteOrganizationMemberInputSchema.meta({
    id: "InviteOrganizationMemberDto",
  });
export type InviteOrganizationMemberDto = Infer<
  typeof InviteOrganizationMemberDto
>;
