import { describe, expect, it } from "vitest";
import {
  isValidOrganizationSlug,
  RESERVED_ORGANIZATION_SLUGS,
  organizationSlugSchema,
} from "./schemas";

describe("organizationSlugSchema", () => {
  it("accepts a valid ws-<hex> slug", () => {
    expect(organizationSlugSchema.safeParse("ws-a1b2c3d4").success).toBe(true);
  });

  it("accepts a custom hyphenated slug", () => {
    expect(organizationSlugSchema.safeParse("acme-co").success).toBe(true);
  });

  it("rejects a slug shorter than 3 characters", () => {
    expect(organizationSlugSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects leading hyphen", () => {
    expect(organizationSlugSchema.safeParse("-acme").success).toBe(false);
  });

  it("rejects trailing hyphen", () => {
    expect(organizationSlugSchema.safeParse("acme-").success).toBe(false);
  });

  it.each(["auth", "settings", "workspaces", "organizations", "api"])(
    "rejects reserved slug '%s'",
    (slug) => {
      const result = organizationSlugSchema.safeParse(slug);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Slug is reserved");
      }
    }
  );

  it("exports reserved set for router sync", () => {
    for (const slug of [
      "auth",
      "settings",
      "workspaces",
      "organizations",
      "api",
    ]) {
      expect(RESERVED_ORGANIZATION_SLUGS.has(slug)).toBe(true);
    }
  });
});

describe("isValidOrganizationSlug", () => {
  it("returns true for a valid slug", () => {
    expect(isValidOrganizationSlug("ws-abc123")).toBe(true);
  });

  it("returns false for a reserved slug", () => {
    expect(isValidOrganizationSlug("settings")).toBe(false);
  });
});
