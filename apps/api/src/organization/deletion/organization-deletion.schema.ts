import type { infer as Infer } from "zod";
import { z } from "zod";

export const organizationDeletionRequestSchema = z.object({
  organizationId: z.string().min(1),
  confirmationSlug: z.string().min(1),
});
export const OrganizationDeletionRequestDto =
  organizationDeletionRequestSchema.meta({
    id: "OrganizationDeletionRequestDto",
  });
export type OrganizationDeletionRequestDto = Infer<
  typeof OrganizationDeletionRequestDto
>;
export const OrganizationDeletionTargetDto = z
  .object({ organizationId: z.string().min(1) })
  .meta({ id: "OrganizationDeletionTargetDto" });
export type OrganizationDeletionTargetDto = Infer<
  typeof OrganizationDeletionTargetDto
>;
export const organizationDeletionResponseSchema = z.object({
  workspaceIds: z.array(z.string()),
  success: z.boolean(),
  purgeAfter: z.string().nullable(),
  status: z.enum(["active", "scheduled", "purging", "unavailable"]),
  canRestore: z.boolean(),
  billingStopped: z.boolean(),
});
export const OrganizationDeletionResponseDto =
  organizationDeletionResponseSchema.meta({
    id: "OrganizationDeletionResponseDto",
  });
export type OrganizationDeletionResponseDto = Infer<
  typeof OrganizationDeletionResponseDto
>;
