import { describe, expect, it } from "vitest";
import { searchWorkspaces } from "./workspaces";

describe("searchWorkspaces", () => {
  const workspaces = [
    { id: "workspace_1", name: "Alpha Notes", slug: "alpha-notes" },
    { id: "workspace_2", name: "Notes Archive", slug: "archive" },
    { id: "workspace_3", name: null, slug: "untitled-workspace" },
  ];

  it("searches names and slugs and marks the current workspace", () => {
    expect(searchWorkspaces(workspaces, "alpha", "workspace_1", "Untitled")).toEqual([
      {
        id: "workspace-workspace_1",
        isCurrent: true,
        label: "Alpha Notes",
        workspaceId: "workspace_1",
        slug: "alpha-notes",
        type: "workspace",
      },
    ]);

    expect(
      searchWorkspaces(workspaces, "archive", "workspace_1", "Untitled")[0]
    ).toMatchObject({ workspaceId: "workspace_2" });
  });

  it("ranks exact and prefix matches before substring matches", () => {
    expect(
      searchWorkspaces(workspaces, "notes", "workspace_1", "Untitled").map(
        (workspace) => workspace.workspaceId
      )
    ).toEqual(["workspace_2", "workspace_1"]);
  });

  it("uses the localized untitled label and skips workspaces without slugs", () => {
    expect(
      searchWorkspaces(workspaces, "untitled", "", "Untitled")[0]?.label
    ).toBe("Untitled");
    expect(
      searchWorkspaces(
        [...workspaces, { id: "workspace_4", name: "Hidden", slug: null }],
        "hidden",
        "",
        "Untitled"
      )
    ).toEqual([]);
  });

  it("supports standalone workspace filters", () => {
    expect(
      searchWorkspaces(workspaces, 'workspace:"Alpha Notes"', "workspace_1", "Untitled"),
    ).toHaveLength(1);
    expect(
      searchWorkspaces(
        workspaces,
        'workspace:"Alpha Notes" roadmap',
        "workspace_1",
        "Untitled",
      ),
    ).toEqual([]);
  });

  it("suppresses workspaces for item-scoped filters", () => {
    expect(
      searchWorkspaces(workspaces, "title:notes", "workspace_1", "Untitled"),
    ).toEqual([]);
  });

  it("lists workspaces for an empty value completion", () => {
    expect(
      searchWorkspaces(workspaces, "", "workspace_1", "Untitled", {
        includeAllWhenEmpty: true,
      }).map((workspace) => workspace.workspaceId),
    ).toEqual(["workspace_1", "workspace_2", "workspace_3"]);
  });

  it("limits default workspace suggestions", () => {
    const results = searchWorkspaces(
      [
        { id: "workspace_4", name: "Writing", slug: "writing" },
        { id: "workspace_2", name: "Notes Archive", slug: "archive" },
        { id: "workspace_1", name: "Alpha Notes", slug: "alpha-notes" },
        { id: "workspace_3", name: null, slug: "untitled-workspace" },
      ],
      "",
      "workspace_1",
      "Untitled",
      {
        excludeCurrentWorkspace: true,
        includeAllWhenEmpty: true,
        limit: 3,
      },
    );

    expect(results.map((workspace) => workspace.workspaceId)).toEqual([
      "workspace_4",
      "workspace_2",
      "workspace_3",
    ]);
  });
});
