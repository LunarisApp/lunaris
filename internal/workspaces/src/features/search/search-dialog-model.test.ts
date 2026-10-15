import { describe, expect, it } from "vitest";
import {
  buildSearchGroups,
  getNextGroupItemValue,
} from "./search-dialog-model";
import type {
  CommandSearchResult,
  ResourceSearchResult,
  WorkspaceSearchResult,
  RecentFile,
} from "./types";

describe("search dialog model", () => {
  const labels = {
    recent: "Recent",
    resources: "Resources",
    workspaces: "Workspaces",
    contentMatches: "Content",
    commands: "Commands",
  };

  it("builds groups in display order", () => {
    const groups = buildSearchGroups({
      commandResults: [commandResult("cmd-open-workspace-settings")],
      resourceResults: [resourceResult("item-1", "doc-1")],
      hasRecent: true,
      isQueryEmpty: true,
      labels,
      workspaceResults: [workspaceResult("workspace-1")],
      recentFiles: [recentFile("doc-recent")],
      uniqueContentResults: [resourceResult("content-item-2", "doc-2")],
    });

    expect(groups).toEqual([
      { name: "Recent", items: ["recent-doc-recent"] },
      { name: "Workspaces", items: ["workspace-workspace-1"] },
      { name: "Resources", items: ["item-1"] },
      { name: "Content", items: ["content-item-2"] },
      { name: "Commands", items: ["cmd-open-workspace-settings"] },
    ]);
  });

  it("omits recent group when query is not empty", () => {
    const groups = buildSearchGroups({
      commandResults: [],
      resourceResults: [],
      hasRecent: true,
      isQueryEmpty: false,
      labels,
      workspaceResults: [],
      recentFiles: [recentFile("doc-recent")],
      uniqueContentResults: [],
    });

    expect(groups).toEqual([]);
  });

  it("cycles between first item in each group", () => {
    const groups = [
      { name: "Recent", items: ["recent-doc"] },
      { name: "Resources", items: ["item-1", "item-2"] },
      { name: "Commands", items: ["cmd-open-workspace-settings"] },
    ];

    expect(getNextGroupItemValue(groups, "item-2", "next")).toBe(
      "cmd-open-workspace-settings"
    );
    expect(getNextGroupItemValue(groups, "item-2", "previous")).toBe(
      "recent-doc"
    );
  });
});

function resourceResult(id: string, _resourceId: string): ResourceSearchResult {
  return {
    id,
    type: "resource",
    label: "Doc",
    resourceId: id,
    pluginId: "plugin-text",
    workspaceId: "workspace-1",
    workspaceName: "Alpha",
    workspaceSlug: "alpha",
  };
}

function commandResult(id: string): CommandSearchResult {
  return {
    id,
    type: "command",
    label: "Settings",
    action: () => {},
  };
}

function workspaceResult(workspaceId: string): WorkspaceSearchResult {
  return {
    id: `workspace-${workspaceId}`,
    isCurrent: false,
    label: "Workspace",
    workspaceId,
    slug: "workspace",
    type: "workspace",
  };
}

function recentFile(resourceId: string): RecentFile {
  return {
    resourceId,
    title: "Recent",
    pluginId: "plugin-text",
    openedAt: 1,
  };
}
