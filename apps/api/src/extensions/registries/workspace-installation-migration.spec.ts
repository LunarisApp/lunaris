import { describe, expect, it } from "bun:test";

const migration = await Bun.file(
  new URL("../../../drizzle/0043_adorable_cerebro.sql", import.meta.url),
).text();

describe("workspace extension installation migration", () => {
  it("moves enabled releases before dropping legacy extension state", () => {
    expect(migration).toContain('DROP TABLE "workspace_plugins" CASCADE');
    for (const column of [
      "registry_id",
      "version",
      "descriptor_url",
      "descriptor_bytes",
      "descriptor_sha256",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE "project_extensions" ADD COLUMN IF NOT EXISTS "${column}"`,
      );
    }
    expect(migration).toContain(
      'UPDATE "project_extensions" AS "project_extension"',
    );
    expect(migration).toContain(
      '"project_extension"."enabled" = true',
    );
    expect(migration).toContain('INSERT INTO "project_extensions"');
    expect(migration).toContain(
      '"workspace_plugin"."plugin_id" = \'lunaris.excalidraw\'',
    );
    expect(migration).toContain("AND NOT EXISTS");
    expect(migration.indexOf('UPDATE "project_extensions"')).toBeLessThan(
      migration.indexOf('DROP TABLE "workspace_plugins"'),
    );
  });

  it("can run before and after the staged finalizer", () => {
    expect(migration).toContain(
      "IF to_regclass('public.workspace_plugins') IS NOT NULL",
    );
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "install_official_extension_registry"',
    );
    expect(migration).toContain(
      'DROP TRIGGER IF EXISTS "organization_install_official_extension_registry"',
    );
  });

  it("replaces the Excalidraw trigger with registry-only setup", () => {
    expect(migration).toContain(
      'DROP TRIGGER IF EXISTS "organization_install_default_excalidraw"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "organization_install_official_extension_registry"',
    );
    expect(migration).toContain(
      "INSERT INTO public.workspace_extension_registries",
    );
    expect(migration).not.toMatch(/INSERT INTO public\.workspace_plugins/i);
  });
});
