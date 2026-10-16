import {
  type DragTarget,
  dragAndDropFeature,
  type ItemInstance,
  keyboardDragAndDropFeature,
  renamingFeature,
} from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { describe, expect, it, vi } from "vitest";
import {
  applyWorkspaceTreeDrop,
  getWorkspaceTreeFeatures,
  isWorkspaceTreeItemOpenable,
  isWorkspaceTreeItemVisible,
} from "./use-workspace-tree";

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

function makeItemInstance(
  id: string,
  options: {
    isFolder?: boolean;
    parentId?: string;
  } = {}
): ItemInstance<WorkspaceResourceEntity> {
  return {
    getId: () => id,
    getParent: () =>
      options.parentId
        ? ({
            getId: () => options.parentId,
          } as ItemInstance<WorkspaceResourceEntity>)
        : undefined,
    isFolder: () => options.isFolder ?? false,
  } as ItemInstance<WorkspaceResourceEntity>;
}

function makeOrderedTarget(
  item: ItemInstance<WorkspaceResourceEntity>,
  insertionIndex: number
): DragTarget<WorkspaceResourceEntity> {
  return {
    item,
    childIndex: insertionIndex,
    insertionIndex,
    dragLineIndex: insertionIndex,
    dragLineLevel: 0,
  };
}

describe("applyWorkspaceTreeDrop", () => {
  it("moves an item into a folder when dropped on the folder row", async () => {
    const moveResource = vi.fn().mockResolvedValue(undefined);
    const reorderChildren = vi.fn().mockResolvedValue(undefined);
    const targetFolder = makeItemInstance("folder", { isFolder: true });
    const draggedItem = makeItemInstance("doc", { parentId: "root" });
    const childrenMap = new Map([
      ["folder", [makeItem({ id: "existing", parent_id: "folder" })]],
      ["root", [makeItem({ id: "doc", parent_id: "root" })]],
    ]);

    await applyWorkspaceTreeDrop({
      childrenMap,
      draggedItems: [draggedItem],
      moveResource,
      reorderChildren,
      target: { item: targetFolder },
    });

    expect(moveResource).toHaveBeenCalledWith("doc", "folder", 1);
    expect(reorderChildren).toHaveBeenNthCalledWith(1, "root", []);
    expect(reorderChildren).toHaveBeenNthCalledWith(2, "folder", [
      "existing",
      "doc",
    ]);
  });

  it("appends multiple dragged items in order when dropped on a folder row", async () => {
    const moveResource = vi.fn().mockResolvedValue(undefined);
    const reorderChildren = vi.fn().mockResolvedValue(undefined);
    const targetFolder = makeItemInstance("folder", { isFolder: true });
    const firstDraggedItem = makeItemInstance("doc-a", { parentId: "root" });
    const secondDraggedItem = makeItemInstance("doc-b", {
      parentId: "other-root",
    });
    const childrenMap = new Map([
      ["folder", [makeItem({ id: "existing", parent_id: "folder" })]],
      [
        "root",
        [
          makeItem({ id: "doc-a", parent_id: "root" }),
          makeItem({ id: "sibling", parent_id: "root" }),
        ],
      ],
      ["other-root", [makeItem({ id: "doc-b", parent_id: "other-root" })]],
    ]);

    await applyWorkspaceTreeDrop({
      childrenMap,
      draggedItems: [firstDraggedItem, secondDraggedItem],
      moveResource,
      reorderChildren,
      target: { item: targetFolder },
    });

    expect(moveResource).toHaveBeenNthCalledWith(1, "doc-a", "folder", 1);
    expect(moveResource).toHaveBeenNthCalledWith(2, "doc-b", "folder", 2);
    expect(reorderChildren).toHaveBeenNthCalledWith(1, "root", ["sibling"]);
    expect(reorderChildren).toHaveBeenNthCalledWith(2, "other-root", []);
    expect(reorderChildren).toHaveBeenNthCalledWith(3, "folder", [
      "existing",
      "doc-a",
      "doc-b",
    ]);
  });

  it("moves a same-parent item to the end when dropped on its folder row", async () => {
    const moveResource = vi.fn().mockResolvedValue(undefined);
    const reorderChildren = vi.fn().mockResolvedValue(undefined);
    const targetFolder = makeItemInstance("folder", { isFolder: true });
    const draggedItem = makeItemInstance("doc-a", { parentId: "folder" });
    const childrenMap = new Map([
      [
        "folder",
        [
          makeItem({ id: "doc-a", parent_id: "folder" }),
          makeItem({ id: "doc-b", parent_id: "folder" }),
        ],
      ],
    ]);

    await applyWorkspaceTreeDrop({
      childrenMap,
      draggedItems: [draggedItem],
      moveResource,
      reorderChildren,
      target: { item: targetFolder },
    });

    expect(moveResource).not.toHaveBeenCalled();
    expect(reorderChildren).toHaveBeenCalledTimes(1);
    expect(reorderChildren).toHaveBeenCalledWith("folder", ["doc-b", "doc-a"]);
  });

  it("keeps ordered targets working for between-row drops", async () => {
    const moveResource = vi.fn().mockResolvedValue(undefined);
    const reorderChildren = vi.fn().mockResolvedValue(undefined);
    const targetFolder = makeItemInstance("folder", { isFolder: true });
    const draggedItem = makeItemInstance("doc", { parentId: "root" });
    const childrenMap = new Map([
      [
        "folder",
        [
          makeItem({ id: "first", parent_id: "folder" }),
          makeItem({ id: "second", parent_id: "folder" }),
        ],
      ],
      ["root", [makeItem({ id: "doc", parent_id: "root" })]],
    ]);

    await applyWorkspaceTreeDrop({
      childrenMap,
      draggedItems: [draggedItem],
      moveResource,
      reorderChildren,
      target: makeOrderedTarget(targetFolder, 1),
    });

    expect(moveResource).toHaveBeenCalledWith("doc", "folder", 1);
    expect(reorderChildren).toHaveBeenNthCalledWith(1, "root", []);
    expect(reorderChildren).toHaveBeenNthCalledWith(2, "folder", [
      "first",
      "doc",
      "second",
    ]);
  });

  it("ignores unordered drops on non-folder items", async () => {
    const moveResource = vi.fn().mockResolvedValue(undefined);
    const reorderChildren = vi.fn().mockResolvedValue(undefined);
    const targetItem = makeItemInstance("doc-target", { isFolder: false });
    const draggedItem = makeItemInstance("doc", { parentId: "root" });

    await applyWorkspaceTreeDrop({
      childrenMap: new Map(),
      draggedItems: [draggedItem],
      moveResource,
      reorderChildren,
      target: { item: targetItem },
    });

    expect(moveResource).not.toHaveBeenCalled();
    expect(reorderChildren).not.toHaveBeenCalled();
  });
});

describe("isWorkspaceTreeItemVisible", () => {
  it("hides hidden resource types without removing normal resources", () => {
    const hidden = new Set(["lunaris.kanban.task"]);

    expect(
      isWorkspaceTreeItemVisible(
        makeItem({ id: "task", resource_type_id: "lunaris.kanban.task" }),
        hidden
      )
    ).toBe(false);
    expect(
      isWorkspaceTreeItemVisible(
        makeItem({ id: "board", resource_type_id: "lunaris.kanban" }),
        hidden
      )
    ).toBe(true);
    expect(isWorkspaceTreeItemVisible(makeItem({ id: "folder" }), hidden)).toBe(
      true
    );
  });
});

describe("isWorkspaceTreeItemOpenable", () => {
  it("opens content resources", () => {
    expect(
      isWorkspaceTreeItemOpenable(
        makeItem({ id: "doc", resource_type_id: "lunaris.rich-text" })
      )
    ).toBe(true);
  });

  it("does not open folders as content", () => {
    expect(
      isWorkspaceTreeItemOpenable(
        makeItem({ id: "folder", resource_type_id: "lunaris.folder" })
      )
    ).toBe(false);
  });

  it("does not open untyped resources", () => {
    expect(isWorkspaceTreeItemOpenable(makeItem({ id: "untyped" }))).toBe(
      false
    );
  });
});

describe("getWorkspaceTreeFeatures", () => {
  it("keeps renaming methods available for read-only trees", () => {
    const features = getWorkspaceTreeFeatures(false);

    expect(features).toContain(renamingFeature);
    expect(features).not.toContain(dragAndDropFeature);
    expect(features).not.toContain(keyboardDragAndDropFeature);
  });
});
