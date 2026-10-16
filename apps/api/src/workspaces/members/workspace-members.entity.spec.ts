import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { workspaceMembersDb } from "./workspace-members.entity";

describe("workspaceMembersDb", () => {
  it("allows one grant per organization member and workspace", () => {
    const config = getTableConfig(workspaceMembersDb);
    const uniqueGrant = config.uniqueConstraints.find(
      (constraint) =>
        constraint.getName() ===
        "workspace_members_workspace_organization_member_unique"
    );

    expect(uniqueGrant?.columns.map((column) => column.name)).toEqual([
      "workspaceId",
      "organizationMemberId",
    ]);
  });

  it("cascades grants with workspace and organization membership", () => {
    const references = getTableConfig(workspaceMembersDb).foreignKeys.map(
      (foreignKey) => ({
        column: foreignKey.reference().columns[0]?.name,
        onDelete: foreignKey.onDelete,
      })
    );

    expect(references).toContainEqual({
      column: "workspaceId",
      onDelete: "cascade",
    });
    expect(references).toContainEqual({
      column: "organizationMemberId",
      onDelete: "cascade",
    });
  });
});
