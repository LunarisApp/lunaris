import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import type { infer as Infer } from "zod";
import { z } from "zod";
import { paginationQuerySchema } from "@app/utils/pagination";

const reservedWorkspaceSlugs = new Set(["settings"]);

export const workspaceSlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase with hyphens only",
  )
  .refine((slug) => !reservedWorkspaceSlugs.has(slug), "Slug is reserved");

export const workspaceSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  name: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  updatedAt: z.string(),
  lastActivityAt: z.string().optional(),
  visibility: z.enum([
    WORKSPACE_VISIBILITY.private,
    WORKSPACE_VISIBILITY.shared,
  ]),
});

export const WorkspaceDto = workspaceSchema.meta({ id: "WorkspaceDto" });
export type WorkspaceDto = Infer<typeof WorkspaceDto>;

export const workspacesListResponseSchema = z.object({
  items: z.array(workspaceSchema),
  nextCursor: z.string().nullable(),
});

export const WorkspacesListResponseDto = workspacesListResponseSchema.meta({
  id: "WorkspacesListResponseDto",
});
export type WorkspacesListResponseDto = Infer<typeof WorkspacesListResponseDto>;

export const WorkspacesListQueryDto = paginationQuerySchema.meta({
  id: "WorkspacesListQueryDto",
});
export type WorkspacesListQueryDto = Infer<typeof WorkspacesListQueryDto>;

export const createWorkspaceSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  slug: workspaceSlugSchema,
  visibility: z
    .enum([
      WORKSPACE_VISIBILITY.local,
      WORKSPACE_VISIBILITY.private,
      WORKSPACE_VISIBILITY.shared,
    ])
    .default(WORKSPACE_VISIBILITY.shared),
});

export const CreateWorkspaceDto = createWorkspaceSchema.meta({
  id: "CreateWorkspaceDto",
});
export type CreateWorkspaceDto = Infer<typeof CreateWorkspaceDto>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(3, "Name must be at least 3 characters").optional(),
    slug: workspaceSlugSchema.optional(),
    visibility: z
      .enum([WORKSPACE_VISIBILITY.private, WORKSPACE_VISIBILITY.shared])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const updatesDetails = value.name !== undefined || value.slug !== undefined;
    const updatesVisibility = value.visibility !== undefined;
    if (!(updatesDetails || updatesVisibility)) {
      context.addIssue({
        code: "custom",
        message: "At least one field is required",
      });
    }
    if (updatesDetails && updatesVisibility) {
      context.addIssue({
        code: "custom",
        message: "Visibility must be updated separately",
      });
    }
  });

export const UpdateWorkspaceDto = updateWorkspaceSchema.meta({
  id: "UpdateWorkspaceDto",
});
export type UpdateWorkspaceDto = Infer<typeof UpdateWorkspaceDto>;

export const WorkspaceParamsDto = z
  .object({ workspaceId: z.string().min(1) })
  .meta({ id: "WorkspaceParamsDto" });
export type WorkspaceParamsDto = Infer<typeof WorkspaceParamsDto>;

export const workspaceCursorSchema = z.object({
  id: z.string(),
  updatedAt: z.string().datetime(),
});

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
