import * as z from "zod";
import type { AgentOperationId } from "./operations";
import {
  actionPreviewSchema,
  createWorkspaceInputSchema,
  createWorkspaceResourceInputSchema,
  deletedResourceSchema,
  fileDownloadSchema,
  keyValueStorageSchema,
  inviteOrganizationMemberInputSchema,
  pageSchema,
  paginationInputSchema,
  workspaceResourceFiltersSchema,
  workspaceResourceSchema,
  workspaceResourceSearchInputSchema,
  workspaceResourceSearchResultSchema,
  workspaceSchema,
  updateWorkspaceInputSchema,
  updateWorkspaceResourceInputSchema,
  updateOrganizationInputSchema,
  organizationInvitationSchema,
  organizationMemberSchema,
  organizationSchema,
  yjsStorageJsonSchema,
  yjsStorageStateSchema,
} from "./schemas";

const organizationId = z.string().min(1).describe("Exact organization ID.");
const workspaceId = z.string().min(1).describe("Exact workspace ID.");
const resourceId = z.string().min(1).describe("Exact workspace resource ID.");
const memberId = z.string().min(1).describe("Exact organization member ID.");
const storageId = z
  .string()
  .min(1)
  .describe("Opaque storage handle ID returned with a resource.");
const resourceTypeId = z.string().min(1).describe("Exact resource type ID.");
const expectedResourceTypeId = resourceTypeId
  .optional()
  .describe(
    "Optional safety guard. The target must have this exact resource type."
  );
const expectedParentResourceTypeId = resourceTypeId
  .optional()
  .describe(
    "Optional safety guard. The parent must have this exact resource type."
  );
const idempotencyKey = z
  .string()
  .min(8)
  .max(200)
  .describe(
    "Stable unique key for this mutation. Reuse only when retrying the identical request; use a new key for a distinct action."
  );
const previewToken = z
  .string()
  .min(1)
  .describe(
    "Short-lived token returned by the matching preview operation for this exact target."
  );

export interface AgentOperationContract {
  input: z.ZodType;
  output: z.ZodObject;
}

export const agentOperationContracts = {
  create_resource: {
    input: createWorkspaceResourceInputSchema.extend({
      expectedParentResourceTypeId,
      idempotencyKey,
      workspaceId,
      organizationId,
    }),
    output: workspaceResourceSchema,
  },
  create_workspace: {
    input: createWorkspaceInputSchema.extend({
      idempotencyKey,
      organizationId,
    }),
    output: workspaceSchema,
  },
  delete_resource: {
    input: z.object({
      expectedResourceTypeId,
      idempotencyKey,
      resourceId,
      previewToken,
      workspaceId,
      organizationId,
    }),
    output: deletedResourceSchema,
  },
  delete_workspace: {
    input: z.object({
      idempotencyKey,
      previewToken,
      workspaceId,
      organizationId,
    }),
    output: deletedResourceSchema,
  },
  get_yjs_storage_json: {
    input: z.object({ storageId, workspaceId, organizationId }),
    output: yjsStorageJsonSchema,
  },
  get_yjs_storage_state: {
    input: z.object({
      storageId,
      workspaceId,
      stateVectorB64: z
        .string()
        .optional()
        .describe(
          "Base64 Yjs state vector already held by the caller. Omit to receive the full document update."
        ),
      organizationId,
    }),
    output: yjsStorageStateSchema,
  },
  list_key_value_storage: {
    input: z.object({ storageId, workspaceId, organizationId }),
    output: keyValueStorageSchema,
  },
  get_file_download_url: {
    input: z.object({
      storageId,
      workspaceId,
      organizationId,
    }),
    output: fileDownloadSchema,
  },
  get_resource: {
    input: z.object({ resourceId, workspaceId, organizationId }),
    output: workspaceResourceSchema,
  },
  get_workspace: {
    input: z.object({ workspaceId, organizationId }),
    output: workspaceSchema,
  },
  get_organization: {
    input: z.object({ organizationId }),
    output: organizationSchema,
  },
  invite_organization_member: {
    input: inviteOrganizationMemberInputSchema.extend({
      idempotencyKey,
      organizationId,
    }),
    output: organizationInvitationSchema,
  },
  list_resources: {
    input: workspaceResourceFiltersSchema.extend({
      workspaceId,
      organizationId,
    }),
    output: pageSchema(workspaceResourceSchema),
  },
  search_resources: {
    input: workspaceResourceSearchInputSchema.extend({ organizationId }),
    output: pageSchema(workspaceResourceSearchResultSchema),
  },
  list_workspaces: {
    input: paginationInputSchema.extend({ organizationId }),
    output: pageSchema(workspaceSchema),
  },
  list_organization_members: {
    input: paginationInputSchema.extend({ organizationId }),
    output: pageSchema(organizationMemberSchema),
  },
  list_organizations: {
    input: paginationInputSchema,
    output: pageSchema(organizationSchema),
  },
  preview_delete_resource: {
    input: z.object({
      expectedResourceTypeId,
      resourceId,
      workspaceId,
      organizationId,
    }),
    output: actionPreviewSchema,
  },
  preview_delete_workspace: {
    input: z.object({ workspaceId, organizationId }),
    output: actionPreviewSchema,
  },
  preview_remove_organization_member: {
    input: z.object({ memberId, organizationId }),
    output: actionPreviewSchema,
  },
  remove_organization_member: {
    input: z.object({ idempotencyKey, memberId, previewToken, organizationId }),
    output: deletedResourceSchema,
  },
  update_resource: {
    input: updateWorkspaceResourceInputSchema.extend({
      idempotencyKey,
      resourceId,
      workspaceId,
      organizationId,
    }),
    output: workspaceResourceSchema,
  },
  update_workspace: {
    input: updateWorkspaceInputSchema.extend({
      idempotencyKey,
      workspaceId,
      organizationId,
    }),
    output: workspaceSchema,
  },
  update_organization: {
    input: updateOrganizationInputSchema.extend({
      idempotencyKey,
      organizationId,
    }),
    output: organizationSchema,
  },
} satisfies Record<AgentOperationId, AgentOperationContract>;
