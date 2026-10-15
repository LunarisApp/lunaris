import { describe, expect, it } from "vitest";
import {
  getCloudContentWorkspaceIds,
  getSearchableResources,
  searchResourcesByTitle,
} from "./resources";

describe("resource search helpers", () => {
  const resourceTypes = new Map([
    [
      "plugin-text",
      { extensionId: "acme.writer", name: "Text Document" },
    ],
    ["lunaris.file", { extensionId: "lunaris.file", name: "File" }],
    [
      "lunaris.kanban.task",
      { extensionId: "lunaris.kanban", name: "Kanban Task" },
    ],
  ]);
  const items = [
    {
      id: "item-1",
      name: "Workspace Plan",
      resource_type_id: "plugin-text",
      workspace_id: "workspace-1",
      workspace_name: "Alpha",
      workspace_slug: "alpha",
      workspace_visibility: "shared",
    },
    {
      id: "item-2",
      name: null,
      resource_type_id: "plugin-text",
      workspace_id: "workspace-1",
      workspace_name: "Alpha",
      workspace_slug: "alpha",
      workspace_visibility: "shared",
    },
    {
      id: "item-file",
      name: "notes.md",
      resource_type_id: "lunaris.file",
      workspace_id: "workspace-2",
      workspace_name: "Beta",
      workspace_slug: "beta",
      workspace_visibility: "shared",
    },
    {
      id: "task-hidden",
      name: "Hidden Kanban Task",
      resource_type_id: "lunaris.kanban.task",
      workspace_id: "workspace-2",
      workspace_name: "Beta",
      workspace_slug: "beta",
      workspace_visibility: "shared",
    },
    {
      id: "folder-1",
      name: "Folder",
      resource_type_id: "lunaris.folder",
      workspace_id: "workspace-1",
      workspace_name: "Alpha",
      workspace_slug: "alpha",
      workspace_visibility: "shared",
    },
  ];

  it("maps searchable plugin items", () => {
    expect(getSearchableResources(items)).toEqual([
      {
        resourceId: "item-1",
        name: "Workspace Plan",
        pluginId: "plugin-text",
        workspaceId: "workspace-1",
        workspaceName: "Alpha",
        workspaceSlug: "alpha",
        workspaceVisibility: "shared",
      },
      {
        resourceId: "item-2",
        name: "Untitled",
        pluginId: "plugin-text",
        workspaceId: "workspace-1",
        workspaceName: "Alpha",
        workspaceSlug: "alpha",
        workspaceVisibility: "shared",
      },
      {
        resourceId: "item-file",
        name: "notes.md",
        pluginId: "lunaris.file",
        workspaceId: "workspace-2",
        workspaceName: "Beta",
        workspaceSlug: "beta",
        workspaceVisibility: "shared",
      },
      {
        resourceId: "task-hidden",
        name: "Hidden Kanban Task",
        pluginId: "lunaris.kanban.task",
        workspaceId: "workspace-2",
        workspaceName: "Beta",
        workspaceSlug: "beta",
        workspaceVisibility: "shared",
      },
    ]);
  });

  it("syncs content only for other cloud workspaces", () => {
    const resources = getSearchableResources(items);
    resources.push({
      ...resources[0]!,
      resourceId: "item-local",
      workspaceId: "workspace-local",
      workspaceVisibility: "local",
    });

    expect(getCloudContentWorkspaceIds(resources, "workspace-1")).toEqual(["workspace-2"]);
  });

  it("searches titles case-insensitively", () => {
    const results = searchResourcesByTitle(getSearchableResources(items), "plan");

    expect(results).toEqual([
      {
        id: "item-1",
        type: "resource",
        label: "Workspace Plan",
        resourceId: "item-1",
        pluginId: "plugin-text",
        workspaceId: "workspace-1",
        workspaceName: "Alpha",
        workspaceSlug: "alpha",
      },
    ]);
  });

  it("finds file items by filename", () => {
    const results = searchResourcesByTitle(getSearchableResources(items), "notes");

    expect(results).toEqual([
      {
        id: "item-file",
        type: "resource",
        label: "notes.md",
        resourceId: "item-file",
        pluginId: "lunaris.file",
        workspaceId: "workspace-2",
        workspaceName: "Beta",
        workspaceSlug: "beta",
      },
    ]);
  });

  it("finds hidden content items by title", () => {
    const results = searchResourcesByTitle(
      getSearchableResources(items),
      "kanban task"
    );

    expect(results[0]).toMatchObject({
      resourceId: "task-hidden",
      label: "Hidden Kanban Task",
      pluginId: "lunaris.kanban.task",
    });
  });

  it("treats a standalone workspace filter as workspace-only search", () => {
    expect(
      searchResourcesByTitle(
        getSearchableResources(items, "Untitled", resourceTypes),
        "workspace:Alpha",
      ),
    ).toEqual([]);
  });

  it("combines workspace and title terms with AND", () => {
    const resources = getSearchableResources(items, "Untitled", resourceTypes);
    expect(
      searchResourcesByTitle(resources, 'workspace:Alpha title:"Workspace Plan"'),
    ).toHaveLength(1);
    expect(
      searchResourcesByTitle(resources, 'workspace:Beta title:"Workspace Plan"'),
    ).toEqual([]);
  });

  it("filters by owning extension ID", () => {
    const resources = getSearchableResources(items, "Untitled", resourceTypes);
    expect(
      searchResourcesByTitle(resources, "extension:lunaris.kanban").map(
        (result) => result.resourceId,
      ),
    ).toEqual(["task-hidden"]);
  });

  it("filters by resource-type ID or display name", () => {
    const resources = getSearchableResources(items, "Untitled", resourceTypes);
    expect(
      searchResourcesByTitle(resources, "resource-type:plugin-text").map(
        (result) => result.resourceId,
      ),
    ).toEqual(["item-1", "item-2"]);
    expect(
      searchResourcesByTitle(resources, 'resource-type:"Kanban Task"').map(
        (result) => result.resourceId,
      ),
    ).toEqual(["task-hidden"]);
  });

  it("lists resources for an empty title completion", () => {
    expect(
      searchResourcesByTitle(getSearchableResources(items), "", {
        includeAllWhenEmpty: true,
      }),
    ).toHaveLength(4);
  });
});
