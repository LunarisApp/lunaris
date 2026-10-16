import { describe, expect, it } from "vitest";
import { getResourceName } from "./resource-name";

describe("getResourceName", () => {
  it("reads the document name via documentId lookup", () => {
    const resourcesMap: import("@lunarisapp/plugin-sdk").PluginResourcesMap =
      new Map([
        [
          "item_1",
          {
            workspace_id: "workspace_1",
            name: "My Doc",
            icon: null,
            position: 0,
            parentId: null,
            resourceTypeId: "lunaris.rich-text",
            resourceId: "item_1",
            schemaVersion: 1,
            storage: { content: { kind: "yjs", storageId: "yjs_1" } },
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
          },
        ],
      ]);

    expect(getResourceName(resourcesMap, "item_1")).toBe("My Doc");
  });

  it("returns empty string when the document has no matching item", () => {
    expect(getResourceName(new Map(), "missing")).toBe("");
  });
});
