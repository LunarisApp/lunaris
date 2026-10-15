import { describe, expect, it } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { workspaceExtensionsDb } from "./workspace-extensions.entity";

describe("workspaceExtensionsDb", () => {
  it("enforces one state row per workspace and extension", () => {
    const config = getTableConfig(workspaceExtensionsDb);
    expect(
      config.uniqueConstraints.some(
        (constraint) =>
          constraint.getName() === "workspace_extensions_workspace_extension_unique",
      ),
    ).toBe(true);
    expect(Object.keys(getTableColumns(workspaceExtensionsDb))).toEqual(
      expect.arrayContaining([
        "registryId",
        "version",
        "descriptorUrl",
        "descriptorBytes",
        "descriptorSha256",
      ]),
    );
  });
});
