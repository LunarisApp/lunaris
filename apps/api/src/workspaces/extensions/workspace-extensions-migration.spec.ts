import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const migration = readFileSync(
  new URL("../../../drizzle/0040_demonic_tattoo.sql", import.meta.url),
  "utf8",
);

describe("workspace extensions migration", () => {
  it("backfills enabled extensions and preserves an explicitly empty list", () => {
    expect(migration).toContain("jsonb_array_elements");
    expect(migration).toContain("jsonb_typeof(extension.value) = 'string'");
    expect(migration).toContain("jsonb_typeof(invalid_plugin.value) <> 'string'");
    expect(migration).toContain("jsonb_array_length(data.enabled_plugins) = 0");
    expect(migration).toContain("'lunaris.rich-text', false");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
  });

  it("tolerates malformed legacy JSON and publishes the table", () => {
    expect(migration).toContain("EXCEPTION WHEN others THEN");
    expect(migration).toContain(
      "ALTER PUBLICATION powersync ADD TABLE project_extensions",
    );
  });
});
