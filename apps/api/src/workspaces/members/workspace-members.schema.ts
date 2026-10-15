import { WORKSPACE_ROLE } from "@repo/auth/sync-access";
import type { infer as Infer } from "zod";
import { z } from "zod";

export const workspaceRoleSchema = z.enum([
  WORKSPACE_ROLE.editor,
  WORKSPACE_ROLE.viewer,
]);

export const workspaceMemberSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  workspaceId: z.string(),
  role: workspaceRoleSchema,
  updatedAt: z.string(),
  user: z.object({
    email: z.string(),
    id: z.string(),
    image: z.string().nullable(),
    name: z.string(),
  }),
});

export const WorkspaceMemberDto = workspaceMemberSchema.meta({
  id: "WorkspaceMemberDto",
});
export type WorkspaceMemberDto = Infer<typeof WorkspaceMemberDto>;
export const WorkspaceMembersDto = z
  .object({ items: z.array(workspaceMemberSchema) })
  .meta({ id: "WorkspaceMembersDto" });
export type WorkspaceMembersDto = Infer<typeof WorkspaceMembersDto>;
export const AddWorkspaceMemberDto = z
  .object({ role: workspaceRoleSchema, userId: z.string().min(1) })
  .meta({ id: "AddWorkspaceMemberDto" });
export type AddWorkspaceMemberDto = Infer<typeof AddWorkspaceMemberDto>;
export const UpdateWorkspaceMemberDto = z
  .object({ role: workspaceRoleSchema })
  .meta({ id: "UpdateWorkspaceMemberDto" });
export type UpdateWorkspaceMemberDto = Infer<typeof UpdateWorkspaceMemberDto>;
export const TransferWorkspaceDto = z
  .object({ userId: z.string().min(1) })
  .meta({ id: "TransferWorkspaceDto" });
export type TransferWorkspaceDto = Infer<typeof TransferWorkspaceDto>;
export const WorkspaceMemberParamsDto = z
  .object({
    memberId: z.string().min(1),
    workspaceId: z.string().min(1),
  })
  .meta({ id: "WorkspaceMemberParamsDto" });
export type WorkspaceMemberParamsDto = Infer<typeof WorkspaceMemberParamsDto>;
export const WorkspaceMembersParamsDto = z
  .object({ workspaceId: z.string().min(1) })
  .meta({ id: "WorkspaceMembersParamsDto" });
export type WorkspaceMembersParamsDto = Infer<typeof WorkspaceMembersParamsDto>;
export const WorkspaceIdResponseDto = z
  .object({ id: z.string() })
  .meta({ id: "WorkspaceIdResponseDto" });
export type WorkspaceIdResponseDto = Infer<typeof WorkspaceIdResponseDto>;
