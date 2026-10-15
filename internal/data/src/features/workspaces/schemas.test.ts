import { describe, expect, it } from "vitest";
import { workspaceSlugSchema, RESERVED_WORKSPACE_SLUGS } from "./schemas";

describe("workspaceSlugSchema", () => {
  it("accepts a valid lowercase-hyphenated slug", () => {
    expect(workspaceSlugSchema.safeParse("my-workspace").success).toBe(true);
  });

  it("rejects a slug shorter than 3 characters", () => {
    expect(workspaceSlugSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(workspaceSlugSchema.safeParse("My-Workspace").success).toBe(false);
  });

  it("rejects underscores", () => {
    expect(workspaceSlugSchema.safeParse("my_workspace").success).toBe(false);
  });

  it("rejects reserved slug 'settings'", () => {
    const result = workspaceSlugSchema.safeParse("settings");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Slug is reserved");
    }
  });

  it("exports the reserved set for router sync", () => {
    expect(RESERVED_WORKSPACE_SLUGS.has("settings")).toBe(true);
  });
});
