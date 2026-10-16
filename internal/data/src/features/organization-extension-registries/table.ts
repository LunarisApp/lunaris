import { column, type RowType, Table } from "@powersync/common";

export const ORGANIZATION_EXTENSION_REGISTRIES_TABLE =
  "organization_extension_registries";

export const createOrganizationExtensionRegistriesTable = () =>
  new Table(
    {
      registry_id: column.text,
      organization_id: column.text,
      kind: column.text,
      location: column.text,
      manifest_url: column.text,
      official: column.integer,
      added_by: column.text,
      added_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        organization_extension_registries_org_idx: ["organization_id"],
      },
    }
  );

export type OrganizationExtensionRegistryEntity = RowType<
  ReturnType<typeof createOrganizationExtensionRegistriesTable>
>;
