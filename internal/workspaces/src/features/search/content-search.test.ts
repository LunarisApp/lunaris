import { describe, expect, it } from "vitest";
import { filterDuplicateContentResults } from "./content-search";
import type { ResourceSearchResult } from "./types";

describe("content search helpers", () => {
  it("removes content results duplicated by title matches", () => {
    const contentResults = [result("item-1"), result("item-2")];
    expect(
      filterDuplicateContentResults(contentResults, [result("item-1")])
    ).toEqual([contentResults[1]]);
  });
});

function result(resourceId: string): ResourceSearchResult {
  return {
    id: `content-${resourceId}`,
    resourceId,
    label: "Doc",
    workspaceId: "workspace-1",
    workspaceName: "Alpha",
    workspaceSlug: "alpha",
    type: "resource",
  };
}
