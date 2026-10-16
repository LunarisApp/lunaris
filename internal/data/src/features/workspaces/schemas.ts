import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { object, string, type TypeOf, enum as zEnum } from "zod";

/**
 * Slugs that collide with nested routes under `/:organizationSlug/*`.
 * Kept in sync with `router.tsx` organization-scoped children.
 */
export const RESERVED_WORKSPACE_SLUGS = new Set(["settings"]);

export const workspaceSlugSchema = string()
  .min(3, "Slug must be at least 3 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase with hyphens only"
  )
  .refine((slug) => !RESERVED_WORKSPACE_SLUGS.has(slug), "Slug is reserved");

export const createWorkspaceSchema = object({
  name: string().min(3, "Name must be at least 3 characters"),
  slug: workspaceSlugSchema.optional(),
  organizationId: string(),
  visibility: zEnum([
    WORKSPACE_VISIBILITY.shared,
    WORKSPACE_VISIBILITY.private,
    WORKSPACE_VISIBILITY.local,
  ]),
});
export type CreateWorkspaceSchema = TypeOf<typeof createWorkspaceSchema>;
