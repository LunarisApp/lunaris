import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("audit events migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0031_nifty_krista_starr.sql"),
    "utf8",
  );

  it("creates indexed, idempotent audit storage", () => {
    expect(migration).toContain('CREATE TABLE "audit_events"');
    expect(migration).toContain('"audit_events_idempotency_unique"');
    expect(migration).toContain('"audit_events_tenant_occurred_idx"');
  });

  it("blocks mutation and enforces seven-year retention", () => {
    expect(migration).toContain('CREATE TRIGGER "audit_events_immutable"');
    expect(migration).toContain("audit_events is append-only");
    expect(migration).toContain("interval '7 years'");
    expect(migration).toContain(
      "DISABLE TRIGGER audit_events_immutable",
    );
    expect(migration).not.toContain("app.audit_retention_purge");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION "purge_expired_audit_events"',
    );
  });
});
