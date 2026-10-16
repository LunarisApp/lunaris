import { describe, expect, it } from "bun:test";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceSchema,
} from "./workspaces.schema";

describe("createWorkspaceSchema", () => {
  it("accepts valid names and rejects reserved slugs", () => {
    expect(
      createWorkspaceSchema.safeParse({
        name: "Workspace",
        slug: "my-workspace",
      }).success
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({ name: "Workspace", slug: "settings" })
        .success
    ).toBe(false);
  });
});

describe("workspaceSchema", () => {
  it("serializes only cloud workspaces", () => {
    const workspace = {
      createdAt: new Date().toISOString(),
      id: "workspace_1",
      name: "Workspace",
      organizationId: "org_1",
      slug: "workspace",
      updatedAt: new Date().toISOString(),
    };

    expect(
      workspaceSchema.safeParse({
        ...workspace,
        visibility: WORKSPACE_VISIBILITY.shared,
      }).success
    ).toBe(true);
    expect(
      workspaceSchema.safeParse({
        ...workspace,
        visibility: WORKSPACE_VISIBILITY.local,
      }).success
    ).toBe(false);
  });
});

describe("updateWorkspaceSchema", () => {
  it("rejects empty updates", () => {
    expect(updateWorkspaceSchema.safeParse({}).success).toBe(false);
  });

  it("accepts workspace detail updates", () => {
    expect(updateWorkspaceSchema.safeParse({ name: "New name" }).success).toBe(
      true
    );
  });

  it("accepts cloud visibility updates", () => {
    expect(
      updateWorkspaceSchema.safeParse({
        visibility: WORKSPACE_VISIBILITY.private,
      }).success
    ).toBe(true);
  });

  it("rejects local and mixed visibility updates", () => {
    expect(
      updateWorkspaceSchema.safeParse({
        visibility: WORKSPACE_VISIBILITY.local,
      }).success
    ).toBe(false);
    expect(
      updateWorkspaceSchema.safeParse({
        name: "New name",
        visibility: WORKSPACE_VISIBILITY.private,
      }).success
    ).toBe(false);
  });
});
