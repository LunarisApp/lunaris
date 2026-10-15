import { string } from "zod";

/**
 * Slugs that collide with top-level routes. Kept in sync with `router.tsx`.
 * Organization slugs at the root of the URL cannot use these.
 */
export const RESERVED_ORGANIZATION_SLUGS = new Set([
  "auth",
  "settings",
  "workspaces",
  "organizations",
  "api",
]);

export const ORGANIZATION_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const organizationSlugSchema = string()
  .min(3, "Slug must be at least 3 characters")
  .regex(ORGANIZATION_SLUG_REGEX, "Slug must be lowercase with hyphens only")
  .refine(
    (slug) => !RESERVED_ORGANIZATION_SLUGS.has(slug),
    "Slug is reserved"
  );

export function isValidOrganizationSlug(value: string): boolean {
  return organizationSlugSchema.safeParse(value).success;
}
