import { describe, expect, it } from "bun:test";

const migration = await Bun.file(
  new URL("./0046_rename_domain_concepts.sql", import.meta.url)
).text();

describe("domain rename migration", () => {
  it("retargets the organization setup trigger after renaming its table", () => {
    const tableRename =
      'ALTER TABLE "workspace_extension_registries" RENAME TO "organization_extension_registries"';
    const functionReplacement =
      'CREATE OR REPLACE FUNCTION "install_official_extension_registry"';

    expect(migration).toContain(tableRename);
    expect(migration).toContain(functionReplacement);
    expect(migration).toContain(
      "INSERT INTO public.organization_extension_registries"
    );
    expect(migration.indexOf(tableRename)).toBeLessThan(
      migration.indexOf(functionReplacement)
    );
  });

  it("creates composite uniques before their foreign keys", () => {
    const resourceUnique =
      'ADD CONSTRAINT "workspace_resources_id_workspace_unique" UNIQUE';
    const resourceForeignKey =
      'ADD CONSTRAINT "workspace_storage_slots_resource_workspace_fk" FOREIGN KEY';
    const storageUnique =
      'ADD CONSTRAINT "workspace_storage_slots_id_workspace_unique" UNIQUE';
    const storageForeignKey =
      'ADD CONSTRAINT "workspace_storage_values_storage_workspace_fk" FOREIGN KEY';

    expect(migration.indexOf(resourceUnique)).toBeLessThan(
      migration.indexOf(resourceForeignKey)
    );
    expect(migration.indexOf(storageUnique)).toBeLessThan(
      migration.indexOf(storageForeignKey)
    );
  });

  it("renames primary-key metadata with each workspace table", () => {
    for (const [oldName, newName] of [
      ["project_extensions_pkey", "workspace_extensions_pkey"],
      ["project_members_pkey", "workspace_members_pkey"],
      ["project_resource_trash_pkey", "workspace_resource_trash_pkey"],
      ["project_resources_pkey", "workspace_resources_pkey"],
      ["project_storage_slots_pkey", "workspace_storage_slots_pkey"],
      ["project_storage_values_pkey", "workspace_storage_values_pkey"],
      ["projects_pkey", "workspaces_pkey"],
    ]) {
      expect(migration).toContain(
        `RENAME CONSTRAINT "${oldName}" TO "${newName}"`
      );
    }
  });
});
