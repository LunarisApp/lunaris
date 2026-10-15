import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { yjsDocumentsDb } from "./yjs.entity";

describe("yjsDocumentsDb", () => {
  it("indexes workspace-scoped updated ordering", () => {
    const config = getTableConfig(yjsDocumentsDb);
    const documentListIndex = config.indexes.find(
      (candidate) =>
        candidate.config.name === "yjs_documents_workspace_updated_idx",
    );

    expect(documentListIndex).toBeDefined();
    expect(
      documentListIndex?.config.columns.map((column) =>
        "name" in column ? column.name : null,
      ),
    ).toEqual(["workspaceId", "updatedAt", "id"]);
  });
});
