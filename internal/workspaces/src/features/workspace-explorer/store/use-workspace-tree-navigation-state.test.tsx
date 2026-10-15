/** @vitest-environment happy-dom */

import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceResourcesMap } from "../types";
import { useWorkspaceTreeNavigationState } from "./use-workspace-tree-navigation-state";

function createResource(
  overrides: Partial<WorkspaceResourceEntity> & Pick<WorkspaceResourceEntity, "id">
): WorkspaceResourceEntity {
  return {
    created_at: "",
    icon: null,
    name: "",
    parent_id: null,
    resource_type_id: null,
    schema_version: 1,
    position: 0,
    workspace_id: "workspace-1",
    updated_at: "",
    ...overrides,
  };
}

interface MockItemInstance {
  expand: () => void;
  getId: () => string;
  getParent: () => MockItemInstance | undefined;
  scrollTo: () => void;
  startRenaming: () => void;
}

function createItemInstance(parent?: MockItemInstance): MockItemInstance {
  return {
    expand: vi.fn(),
    getId: vi.fn(() => "parent"),
    getParent: vi.fn(() => parent),
    scrollTo: vi.fn(),
    startRenaming: vi.fn(),
  };
}

describe("useWorkspaceTreeNavigationState", () => {
  it("waits for tree registration and synced item before renaming", async () => {
    const itemInstance = createItemInstance();
    const tree = {
      getItemInstance: vi.fn(() => itemInstance),
      setSelectedItems: vi.fn(),
    } as unknown as TreeInstance<WorkspaceResourceEntity>;
    const view = renderHook(
      ({ resourcesMap }) =>
        useWorkspaceTreeNavigationState({ resourcesMap, workspaceId: "workspace-1" }),
      { initialProps: { resourcesMap: new Map() as WorkspaceResourcesMap } }
    );

    act(() => {
      view.result.current.startRenamingResource("folder-new");
      view.result.current.registerTree(tree);
    });
    expect(itemInstance.startRenaming).not.toHaveBeenCalled();

    view.rerender({
      resourcesMap: new Map([
        [
          "folder-new",
          createResource({ id: "folder-new", resource_type_id: "lunaris.folder" }),
        ],
      ]),
    });

    await waitFor(() => expect(itemInstance.startRenaming).toHaveBeenCalled());
    expect(tree.setSelectedItems).toHaveBeenCalledWith(["folder-new"]);
    expect(itemInstance.expand).toHaveBeenCalled();
    expect(itemInstance.scrollTo).toHaveBeenCalled();
  });

  it("selects, reveals, and opens a navigated document", () => {
    const parentInstance = createItemInstance();
    const itemInstance = createItemInstance(parentInstance);
    const item = createResource({
      id: "item-1",
      resource_type_id: "rich-text",
    });
    const tree = {
      getItemInstance: vi.fn((id: string) =>
        id === "item-1" ? itemInstance : parentInstance
      ),
      setSelectedItems: vi.fn(),
    } as unknown as TreeInstance<WorkspaceResourceEntity>;
    const onOpenResource = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceTreeNavigationState({
        resourcesMap: new Map([[item.id, item]]),
        workspaceId: "workspace-1",
      })
    );

    act(() => {
      result.current.registerTree(tree, onOpenResource);
      result.current.navigateToResource(item.id);
    });

    expect(tree.setSelectedItems).toHaveBeenCalledWith([item.id]);
    expect(parentInstance.expand).toHaveBeenCalled();
    expect(onOpenResource).toHaveBeenCalledWith(item);
    expect(itemInstance.scrollTo).toHaveBeenCalled();
  });

  it("clears queued actions when the workspace changes", () => {
    const itemInstance = createItemInstance();
    const tree = {
      getItemInstance: vi.fn(() => itemInstance),
      setSelectedItems: vi.fn(),
    } as unknown as TreeInstance<WorkspaceResourceEntity>;
    const view = renderHook(
      ({ resourcesMap, workspaceId }) =>
        useWorkspaceTreeNavigationState({ resourcesMap, workspaceId }),
      {
        initialProps: {
          resourcesMap: new Map() as WorkspaceResourcesMap,
          workspaceId: "workspace-1",
        },
      }
    );

    act(() => {
      view.result.current.startRenamingResource("folder-old");
      view.result.current.registerTree(tree);
    });
    view.rerender({
      resourcesMap: new Map() as WorkspaceResourcesMap,
      workspaceId: "workspace-2",
    });
    view.rerender({
      resourcesMap: new Map([
        ["folder-old", createResource({ id: "folder-old" })],
      ]),
      workspaceId: "workspace-2",
    });

    expect(itemInstance.startRenaming).not.toHaveBeenCalled();
  });
});
