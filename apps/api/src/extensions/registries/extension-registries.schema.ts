import type { infer as Infer } from "zod";
import { z } from "zod";

export const organizationExtensionRegistrySchema = z.object({
  addedAt: z.string(),
  addedBy: z.string().nullable(),
  id: z.string(),
  kind: z.enum(["github", "https"]),
  location: z.string(),
  manifestUrl: z.string(),
  official: z.boolean(),
  organizationId: z.string(),
  updatedAt: z.string(),
});

export const OrganizationExtensionRegistryDto =
  organizationExtensionRegistrySchema.meta({
    id: "OrganizationExtensionRegistryDto",
  });
export type OrganizationExtensionRegistryDto = Infer<
  typeof OrganizationExtensionRegistryDto
>;

export const OrganizationExtensionRegistryListDto = z
  .array(organizationExtensionRegistrySchema)
  .meta({ id: "OrganizationExtensionRegistryListDto" });
export type OrganizationExtensionRegistryListDto = Infer<
  typeof OrganizationExtensionRegistryListDto
>;

export const AddOrganizationExtensionRegistryDto = z
  .object({ url: z.url() })
  .strict()
  .meta({ id: "AddOrganizationExtensionRegistryDto" });
export type AddOrganizationExtensionRegistryDto = Infer<
  typeof AddOrganizationExtensionRegistryDto
>;

export const OrganizationExtensionRegistryParamsDto = z
  .object({ registryId: z.string().min(1), organizationId: z.string().min(1) })
  .meta({ id: "OrganizationExtensionRegistryParamsDto" });
export type OrganizationExtensionRegistryParamsDto = Infer<
  typeof OrganizationExtensionRegistryParamsDto
>;

export const OrganizationDeveloperModeDto = z
  .object({ enabled: z.boolean() })
  .strict()
  .meta({ id: "OrganizationDeveloperModeDto" });
export type OrganizationDeveloperModeDto = Infer<
  typeof OrganizationDeveloperModeDto
>;
