import { describe, expect, it } from "bun:test";
import {
  createWorkspaceResourceSchema,
  updateWorkspaceResourceSchema,
} from "./workspace-resources.schema";

describe("updateWorkspaceResourceSchema", () => {
  it("rejects empty updates", () => {
    expect(updateWorkspaceResourceSchema.safeParse({}).success).toBe(false);
  });

  it("accepts mutable resource fields", () => {
    expect(updateWorkspaceResourceSchema.safeParse({ name: "Renamed" }).success).toBe(
      true,
    );
  });

  it.each(["resourceTypeId", "schemaVersion"])(
    "rejects immutable %s updates",
    (field) => {
      expect(
        updateWorkspaceResourceSchema.safeParse({
          [field]: field === "schemaVersion" ? 2 : "acme.other",
        }).success,
      ).toBe(false);
    },
  );
});

describe("createWorkspaceResourceSchema", () => {
  it("accepts valid storage definitions", () => {
    expect(
      createWorkspaceResourceSchema.safeParse({
        name: "Document",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        storage: { content: { kind: "yjs" } },
      }).success,
    ).toBe(true);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects reserved storage name %s",
    (name) => {
      expect(
        createWorkspaceResourceSchema.safeParse({
          name: "Document",
          resourceTypeId: "lunaris.rich-text",
          storage: { [name]: { kind: "yjs" } },
        }).success,
      ).toBe(false);
    },
  );
});
