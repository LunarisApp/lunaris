import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "./workspace-resources.entity";

describe("workspaceResourcesDb", () => {
  it("indexes workspace-scoped resource ordering", () => {
    const config = getTableConfig(workspaceResourcesDb);
    const listIndex = config.indexes.find(
      (candidate) =>
        candidate.config.name === "workspace_resources_workspace_position_created_idx",
    );

    expect(
      listIndex?.config.columns.map((column) =>
        "name" in column ? column.name : null,
      ),
    ).toEqual(["workspaceId", "position", "createdAt", "id"]);
  });

  it("indexes case-insensitive resource-name search with trigrams", async () => {
    const config = getTableConfig(workspaceResourcesDb);
    const searchIndex = config.indexes.find(
      (candidate) => candidate.config.name === "workspace_resources_name_trgm_idx",
    );
    const migration = await Bun.file(
      new URL("../../../drizzle/0029_confused_scalphunter.sql", import.meta.url),
    ).text();

    expect(searchIndex?.config.method).toBe("gin");
    expect(searchIndex?.config.columns[0]).toMatchObject({
      indexConfig: { opClass: "gin_trgm_ops" },
      name: "name",
    });
    expect(migration.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm")).toBeLessThan(
      migration.indexOf('CREATE INDEX "pi_name_trgm_idx"'),
    );
  });

  it("publishes resource trash for PowerSync", async () => {
    const config = getTableConfig(workspaceResourceTrashDb);
    const migration = await Bun.file(
      new URL("../../../drizzle/0045_clear_wasp.sql", import.meta.url),
    ).text();

    expect(config.name).toBe("workspace_resource_trash");
    expect(migration).toContain(
      "ALTER PUBLICATION powersync ADD TABLE project_resource_trash",
    );
  });
});
