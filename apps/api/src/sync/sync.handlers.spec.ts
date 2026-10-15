import { describe, expect, it } from "bun:test";
import { permission } from "@repo/auth/permissions";
import { HANDLERS, isUniqueViolation } from "./sync.handlers";

describe("isUniqueViolation", () => {
  it("returns true for code 23505", () => {
    const err = Object.assign(new Error("unique"), { code: "23505" });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("returns true when constraint includes specified column", () => {
    const err = Object.assign(new Error(), {
      code: "23505",
      constraint: "workspaces_org_slug_unique",
    });
    expect(isUniqueViolation(err, "slug")).toBe(true);
  });

  it("returns false when constraint doesn't include column", () => {
    const err = Object.assign(new Error(), {
      code: "23505",
      constraint: "workspaces_name_unique",
    });
    expect(isUniqueViolation(err, "slug")).toBe(false);
  });

  it("returns false for non-Error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(false);
  });

  it("returns false for different code", () => {
    const err = Object.assign(new Error(), { code: "42P01" });
    expect(isUniqueViolation(err)).toBe(false);
  });

  it("returns true for wrapped code 23505", () => {
    const err = Object.assign(new Error("wrapped"), {
      cause: { code: "23505" },
    });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("returns true for wrapped slug constraint", () => {
    const err = Object.assign(new Error("wrapped"), {
      cause: {
        code: "23505",
        constraint: "workspaces_org_slug_unique",
      },
    });
    expect(isUniqueViolation(err, "slug")).toBe(true);
  });

  it("returns false for wrapped non-slug constraint", () => {
    const err = Object.assign(new Error("wrapped"), {
      cause: {
        code: "23505",
        constraint: "workspaces_name_unique",
      },
    });
    expect(isUniqueViolation(err, "slug")).toBe(false);
  });
});

describe("sync permissions", () => {
  it("maps every mutation type to its resource action", () => {
    expect(HANDLERS.workspaces.permissions).toEqual({
      DELETE: permission.workspace.delete,
      PATCH: permission.workspace.update,
      PUT: permission.workspace.create,
    });
    expect(HANDLERS.workspace_resources.permissions).toEqual({
      DELETE: permission.content.delete,
      PATCH: permission.content.write,
      PUT: permission.content.write,
    });
    expect(HANDLERS.workspace_resource_trash.permissions).toEqual({
      DELETE: permission.content.write,
      PATCH: permission.content.delete,
      PUT: permission.content.delete,
    });
    expect(HANDLERS.workspace_extensions.permissions).toEqual({
      DELETE: permission.content.write,
      PATCH: permission.content.write,
      PUT: permission.content.write,
    });
    expect(HANDLERS.yjs_documents.permissions).toEqual({
      DELETE: permission.content.delete,
      PATCH: permission.content.write,
      PUT: permission.content.write,
    });
    expect(HANDLERS.yjs_document_updates.permissions).toEqual({
      DELETE: permission.content.write,
      PATCH: permission.content.write,
      PUT: permission.content.write,
    });
  });
});
