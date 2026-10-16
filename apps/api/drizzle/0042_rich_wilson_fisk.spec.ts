import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const migration = readFileSync(
  new URL("./0042_rich_wilson_fisk.sql", import.meta.url),
  "utf8"
);

describe("legacy persistence cleanup migration", () => {
  it("validates before dropping legacy persistence", () => {
    const validation = migration.indexOf("Legacy cleanup blocked:");
    const drop = migration.indexOf("DROP TABLE project_data");

    expect(validation).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(validation);
    expect(migration).toContain("malformed project_data JSON");
    expect(migration).toContain("malformed enabled_plugins data");
    expect(migration).toContain("resource has both Yjs and file content");
    expect(migration).toContain(
      "file metadata conflicts with canonical content storage"
    );
    expect(migration).toContain(
      "resource document conflicts with content storage"
    );
    expect(migration).toContain("Yjs storage backing is missing");
  });

  it("uses repeatable inserts and newer-row reconciliation", () => {
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("ON CONFLICT (storage_id, key) DO UPDATE");
    expect(migration).toContain(
      "EXCLUDED.updated_at > project_storage_values.updated_at"
    );
    expect(migration).toContain("updated_at > canonical_updated_at");
    expect(migration).toContain(
      "CREATE TEMP TABLE migration_0042_newer_enabled_plugins"
    );
    expect(migration).not.toContain("updated_at >= canonical_updated_at");
  });

  it("retains unreferenced backing data for later garbage collection", () => {
    expect(migration).toContain(
      "unreferenced Yjs documents retained for later GC"
    );
    expect(migration).toContain("orphan project_data rows archived");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+yjs_documents/i);
  });

  it("archives orphan metadata before dropping project_data", () => {
    const archive = migration.indexOf(
      "CREATE TABLE legacy_orphan_project_data"
    );
    const copy = migration.indexOf("INSERT INTO legacy_orphan_project_data");
    const drop = migration.indexOf("DROP TABLE project_data");

    expect(archive).toBeGreaterThanOrEqual(0);
    expect(copy).toBeGreaterThan(archive);
    expect(drop).toBeGreaterThan(copy);
    expect(migration).toContain("data.key LIKE 'file:%'");
    expect(migration.match(/data\.key NOT LIKE 'file:%'/g)).toHaveLength(2);
    expect(migration).toContain("'file_resource_missing'");
    expect(migration).toContain("'compiler_resource_missing'");
    expect(migration).toContain("ON CONFLICT (id) DO NOTHING");
    expect(migration).not.toContain(
      "Legacy cleanup blocked: file project_data row has no matching resource"
    );
    expect(migration).not.toContain(
      "Legacy cleanup blocked: compiler project_data row does not map to exactly one resource"
    );
  });

  it("removes only the legacy table and resource column after assertions", () => {
    expect(migration).toContain(
      "ALTER PUBLICATION powersync DROP TABLE project_data"
    );
    expect(migration).toContain("DROP INDEX pr_project_document_idx");
    expect(migration).toContain(
      "ALTER TABLE project_resources DROP COLUMN document_id"
    );
  });
});
