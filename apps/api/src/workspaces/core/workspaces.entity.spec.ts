import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { workspacesDb } from "./workspaces.entity";

describe("workspacesDb", () => {
  it("indexes organization-scoped updated ordering", () => {
    const config = getTableConfig(workspacesDb);
    const listIndex = config.indexes.find(
      (candidate) =>
        candidate.config.name === "workspaces_org_visibility_updated_idx",
    );

    expect(
      listIndex?.config.columns.map((column) =>
        "name" in column ? column.name : null,
      ),
    ).toEqual(["organizationId", "visibility", "updatedAt", "id"]);
  });

  it("scopes slug uniqueness by organization", () => {
    const config = getTableConfig(workspacesDb);
    const orgSlugUnique = config.uniqueConstraints.find(
      (constraint) => constraint.getName() === "workspaces_org_slug_unique"
    );

    expect(orgSlugUnique).toBeDefined();
    expect(orgSlugUnique?.columns.map((column) => column.name)).toEqual([
      "organizationId",
      "slug",
    ]);
  });

  it("deletes private workspaces when their owner is deleted", () => {
    const config = getTableConfig(workspacesDb);
    const ownerReference = config.foreignKeys.find(
      (foreignKey) =>
        foreignKey.reference().columns[0]?.name === workspacesDb.ownerId.name,
    );

    expect(ownerReference?.onDelete).toBe("cascade");
  });
});
