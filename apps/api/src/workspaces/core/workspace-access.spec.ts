import { describe, expect, it } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { workspaceAccessCondition } from "./workspace-access";

describe("workspaceAccessCondition", () => {
  it("allows shared workspaces and only the current user's private workspaces", () => {
    const query = new PgDialect().sqlToQuery(
      workspaceAccessCondition("org_1", "user_1"),
    );

    expect(query.sql).toContain('"workspaces"."organizationId" = $1');
    expect(query.sql).toContain('"workspaces"."visibility"');
    expect(query.sql).toContain(
      '"organization"."deletion_requested_at" IS NULL',
    );
    expect(query.sql).toContain('"workspaces"."ownerId"');
    expect(query.params).toEqual([
      "org_1",
      "org_1",
      "org_1",
      "user_1",
      "shared",
      "private",
      "user_1",
      "user_1",
    ]);
    expect(query.sql).toContain("workspace_members");
  });

  it("fails closed to shared workspaces without a user", () => {
    const query = new PgDialect().sqlToQuery(workspaceAccessCondition("org_1"));

    expect(query.sql).not.toContain('"workspaces"."ownerId"');
    expect(query.params).toEqual(["org_1", "org_1", "shared"]);
  });

  it("requires editor membership for private workspace writes", () => {
    const query = new PgDialect().sqlToQuery(
      workspaceAccessCondition("org_1", "user_1", "write"),
    );

    expect(query.sql).toContain('"workspace_members"."role"');
    expect(query.params).toContain("editor");
  });

  it("requires ownership for private workspace administration", () => {
    const query = new PgDialect().sqlToQuery(
      workspaceAccessCondition("org_1", "user_1", "owner"),
    );

    expect(query.sql).not.toContain("workspace_members");
    expect(query.params).toEqual([
      "org_1",
      "org_1",
      "org_1",
      "user_1",
      "shared",
      "private",
      "user_1",
    ]);
  });
});
