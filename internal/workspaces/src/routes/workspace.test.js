import { describe, expect, it } from "vitest";
import {
  getWorkspacePath,
  getWorkspaceSubviewPath,
  resolveWorkspaceView,
} from "./workspace-deep-link";

function makeItemsMap() {
  return new Map([
    [
      "item_1",
      {
        id: "item_1",
        workspace_id: "workspace_1",
        name: "Spec",
        icon: null,
        position: 0,
        parent_id: null,
        resource_type_id: "lunaris.rich-text",
        schema_version: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ],
    [
      "item_folder",
      {
        id: "item_folder",
        workspace_id: "workspace_1",
        name: "Drafts",
        icon: null,
        position: 1,
        parent_id: null,
        resource_type_id: "lunaris.folder",
        schema_version: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ],
    [
      "item_board",
      {
        id: "item_board",
        workspace_id: "workspace_1",
        name: "Roadmap",
        icon: null,
        position: 3,
        parent_id: null,
        resource_type_id: "lunaris.kanban",
        schema_version: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ],
    [
      "item_plugin_only",
      {
        id: "item_plugin_only",
        workspace_id: "workspace_1",
        name: "Timeline",
        icon: null,
        position: 2,
        parent_id: null,
        resource_type_id: "lunaris.timeline",
        schema_version: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ],
  ]);
}

describe("getWorkspacePath", () => {
  it("builds the workspace root path without a viewId", () => {
    expect(getWorkspacePath("ws-abc", "novel")).toBe("/ws-abc/novel");
  });

  it("builds the canonical workspace view path", () => {
    expect(getWorkspacePath("ws-abc", "novel", "item_1")).toBe(
      "/ws-abc/novel/item_1"
    );
  });

  it("builds a canonical plugin subview path", () => {
    expect(
      getWorkspaceSubviewPath("ws-abc", "novel", "item_board", "task", "task_1")
    ).toBe("/ws-abc/novel/item_board/task/task_1");
  });
});

describe("resolveWorkspaceView", () => {
  it("returns { kind: 'none' } when no viewId is present", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: null,
      })
    ).toEqual({ kind: "none" });
  });

  it("resolves a document item by item id", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "item_1",
      })
    ).toEqual({
      kind: "resource",
      resourceId: "item_1",
      resourceTypeId: "lunaris.rich-text",
      parentId: null,
      schemaVersion: 1,
      title: "Spec",
    });
  });

  it("resolves a plugin-only item (no yjs doc) by item id", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "item_plugin_only",
      })
    ).toEqual({
      kind: "resource",
      resourceId: "item_plugin_only",
      resourceTypeId: "lunaris.timeline",
      parentId: null,
      schemaVersion: 1,
      title: "Timeline",
    });
  });

  it("redirects the unsupported legacy Kanban task subview", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        subviewPath: "task",
        subviewId: "task_1",
        viewId: "item_board",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel/item_board" });
  });

  it("redirects an unknown plugin subview to its board", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        subviewPath: "unknown",
        subviewId: "task_1",
        viewId: "item_board",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel/item_board" });
  });

  it("redirects a plugin subview with a missing board to workspace root", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        subviewPath: "task",
        subviewId: "task_1",
        viewId: "item_missing",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel" });
  });

  it("resolves a folder to the folder kind", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "item_folder",
      })
    ).toEqual({ kind: "folder", resourceId: "item_folder" });
  });

  it("redirects a missing item id to the workspace root", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "item_missing",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel" });
  });

  it("redirects unsupported Yjs deep links to the workspace root", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "yjs_1",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel" });
  });

  it("redirects legacy yjs_ URLs for deleted items to the workspace root", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "yjs_missing",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel" });
  });

  it("resolves a tool id via the tool registry", () => {
    const result = resolveWorkspaceView({
      resourcesMap: makeItemsMap(),
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "debugger",
    });
    expect(result.kind).toBe("tool");
    if (result.kind === "tool") {
      expect(result.tool.toolId).toBe("debugger");
    }
  });

  it("resolves the extensions tool id via the tool registry", () => {
    const result = resolveWorkspaceView({
      resourcesMap: makeItemsMap(),
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "extensions",
    });
    expect(result.kind).toBe("tool");
  });

  it("resolves the settings tool id via the tool registry", () => {
    const result = resolveWorkspaceView({
      resourcesMap: makeItemsMap(),
      organizationSlug: "ws-abc",
      workspaceSlug: "novel",
      viewId: "settings",
    });
    expect(result.kind).toBe("tool");
    if (result.kind === "tool") {
      expect(result.tool.toolId).toBe("settings");
    }
  });

  it("treats the retired workspace settings slug as an unknown view", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "workspace-settings",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel" });
  });

  it("resolves a plugin view", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "view:acme.assistant",
        views: [
          {
            extensionId: "acme.assistant-plugin",
            definition: {
              icon: {},
              name: "Demo Panel",
              renderer: () => null,
              target: {
                kind: "standalone",
                launcher: { defaultPlacement: "secondary" },
              },
              type: "view",
              viewId: "acme.assistant",
            },
          },
        ],
      })
    ).toEqual({
      kind: "view",
      viewId: "acme.assistant",
      placement: "secondary",
      extensionId: "acme.assistant-plugin",
      title: "Demo Panel",
      viewInstanceId: "view:acme.assistant",
    });
  });

  it("redirects an unknown viewId to the workspace root", () => {
    expect(
      resolveWorkspaceView({
        resourcesMap: makeItemsMap(),
        organizationSlug: "ws-abc",
        workspaceSlug: "novel",
        viewId: "garbage",
      })
    ).toEqual({ kind: "redirect", to: "/ws-abc/novel" });
  });
});
