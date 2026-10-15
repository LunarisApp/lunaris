import { describe, expect, it } from "vitest";
import { getEntityReferencePath } from "./entity-reference-navigation";

describe("getEntityReferencePath", () => {
  it("creates workspace and item deep links", () => {
    expect(
      getEntityReferencePath("my organization", "launch plan", {
        workspaceId: "workspace_1",
        type: "workspace",
      })
    ).toBe("/my%20organization/launch%20plan");
    expect(
      getEntityReferencePath("my organization", "launch plan", {
        resourceId: "item/1",
        workspaceId: "workspace_1",
        type: "workspace-resource",
      })
    ).toBe("/my%20organization/launch%20plan/item%2F1");
  });
});
