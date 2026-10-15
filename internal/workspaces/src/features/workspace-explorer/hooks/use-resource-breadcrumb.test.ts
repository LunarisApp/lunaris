import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useResourceBreadcrumb } from "./use-resource-breadcrumb";

let resourcesMap = new Map<string, WorkspaceResourceEntity>();

vi.mock("../store", () => ({
  useWorkspaceResourcesMap: () => resourcesMap,
}));

function makeItem(
  overrides: Partial<WorkspaceResourceEntity> & { id: string }
): WorkspaceResourceEntity {
  return {
    workspace_id: "workspace_1",
    name: "item",
    icon: null,
    position: 0,
    parent_id: null,
    resource_type_id: null,
    schema_version: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("useResourceBreadcrumb", () => {
  it("includes resourceTypeId from workspace resource rows", () => {
    resourcesMap = new Map([
      [
        "folder",
        makeItem({
          id: "folder",
          name: "Folder",
          parent_id: null,
          resource_type_id: "lunaris.folder",
        }),
      ],
      [
        "doc",
        makeItem({
          id: "doc",
          name: "Doc",
          parent_id: "folder",
          resource_type_id: "lunaris.rich-text",
        }),
      ],
    ]);

    const { result } = renderHook(() => useResourceBreadcrumb("doc"));

    expect(result.current).toEqual([
      {
        id: "folder",
        isLast: false,
        name: "Folder",
        resourceTypeId: "lunaris.folder",
        schemaVersion: 1,
      },
      {
        id: "doc",
        isLast: true,
        name: "Doc",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
      },
    ]);
  });
});
