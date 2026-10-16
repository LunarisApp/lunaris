import { describe, expect, it } from "vitest";
import { createAppSchema } from "../index";

describe("organization directory tables", () => {
  it("registers only the published directory columns", () => {
    const tables = createAppSchema().tables;
    const columns = (name: string) =>
      tables
        .find((table) => table.name === name)
        ?.columns.map((column) => column.name);

    expect(columns("organization")).toEqual([
      "name",
      "slug",
      "logo",
      "created_at",
      "is_personal",
      "yjs_retention_days",
      "deletion_requested_at",
      "deletion_purge_after",
    ]);
    expect(columns("member")).toEqual([
      "organization_id",
      "user_id",
      "role",
      "created_at",
    ]);
    expect(columns("user")).toEqual(["name", "email", "image"]);
    expect(columns("team")).toEqual([
      "name",
      "organization_id",
      "created_at",
      "updated_at",
    ]);
    expect(columns("team_member")).toEqual([
      "team_id",
      "user_id",
      "created_at",
    ]);
  });

  it("registers membership lookup indexes", () => {
    const member = createAppSchema().tables.find(
      (table) => table.name === "member"
    );

    expect(member?.indexes.map((index) => index.name)).toEqual([
      "member_organization_idx",
      "member_organization_user_idx",
      "member_user_idx",
    ]);
  });
});
