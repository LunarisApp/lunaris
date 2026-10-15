import { describe, expect, it } from "bun:test";
import {
  LocalOnlySyncAccessError,
  NoActiveOrganizationError,
  OrganizationMismatchError,
} from "./sync.errors";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

describe("sync.errors response hygiene", () => {
  it("OrganizationMismatchError (403) does not echo entity UUIDs in the wire fields", () => {
    const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
    const orgId = "f81d4fae-7dec-11d0-a765-00a0c91e6bf6";
    const err = new OrganizationMismatchError("Workspace", workspaceId, orgId);

    expect(err.status).toBe(403);
    expect(err.message).not.toMatch(UUID_RE);
    expect(err.why ?? "").not.toMatch(UUID_RE);
    expect(err.fix ?? "").not.toMatch(UUID_RE);
    expect(err.reason).toBe("entitlements.organization_mismatch");
  });

  it("LocalOnlySyncAccessError (403) carries no caller-specific identifiers", () => {
    const err = new LocalOnlySyncAccessError("anonymous");
    expect(err.status).toBe(403);
    expect(err.why ?? "").not.toMatch(UUID_RE);
    expect(err.reason).toBe("entitlements.local_only_anonymous");
  });

  it("NoActiveOrganizationError carries a typed reason", () => {
    const err = new NoActiveOrganizationError();
    expect(err.reason).toBe("entitlements.no_active_organization");
  });
});
