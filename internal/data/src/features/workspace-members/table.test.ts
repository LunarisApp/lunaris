import { describe, expect, it } from "vitest";
import { createAppSchema } from "../index";

describe("workspace member table", () => {
  it("registers synced grant columns and indexes", () => {
    const table = createAppSchema().tables.find(
      (candidate) => candidate.name === "workspace_members",
    );

    expect(table?.columns.map((column) => column.name)).toEqual([
      "workspace_id",
      "organization_member_id",
      "role",
      "created_at",
      "updated_at",
    ]);
    expect(table?.indexes.map((index) => index.name)).toEqual([
      "workspace_members_workspace_idx",
      "workspace_members_organization_member_idx",
    ]);
  });
});
