/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MouseEventHandler, ReactNode, RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stableLoadingState = vi.hoisted(() => ({
  showEmpty: false,
  showSkeleton: false,
}));

interface TreeHotkeyArgs {
  target: RefObject<HTMLDivElement | null>;
}

const useDeleteKeyboardShortcutMock = vi.fn((_args: TreeHotkeyArgs) => ({
  confirmDeleteOpen: false,
  handleConfirmDelete: vi.fn(),
  itemsToDelete: [],
  setConfirmDeleteOpen: vi.fn(),
}));
const useRenameKeyboardShortcutMock = vi.fn((_args: TreeHotkeyArgs) => {});
const useResourceClipboardShortcutsMock = vi.fn((_args: TreeHotkeyArgs) => {});
const addItemMock = vi.fn();
const openResourceMock = vi.fn();
const registerTreeMock = vi.fn();
const tree = {
  collapseAll: vi.fn(),
  getItemInstance: vi.fn(),
  getItems: () => [{ getId: () => "item-1" }],
  setSelectedItems: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@lunarisapp/ui/blocks/confirmation-dialog", () => ({
  ConfirmationDialog: () => null,
}));

vi.mock("@lunarisapp/ui/components/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ContextMenuTrigger: ({
    children,
    className,
    onClick,
  }: {
    children: ReactNode;
    className?: string;
    onClick?: MouseEventHandler<HTMLDivElement>;
  }) => (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  ),
}));

vi.mock("@lunarisapp/ui/components/tree", () => ({
  AssistiveTreeDescription: () => null,
  Tree: ({ children }: { children: ReactNode }) => (
    <div data-testid="tree-root">{children}</div>
  ),
  TreeDragLine: () => null,
}));

vi.mock("@repo/features/sync-status", () => ({
  useStableInitialLoading: () => stableLoadingState,
}));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({
    openResource: openResourceMock,
  }),
}));

vi.mock("../hooks/use-available-resources", () => ({
  useAvailableResources: () => [],
}));

vi.mock("../hooks/use-delete-keyboard-shortcut", () => ({
  useDeleteKeyboardShortcut: (args: TreeHotkeyArgs) =>
    useDeleteKeyboardShortcutMock(args),
}));

vi.mock("../hooks/use-resource-clipboard-shortcuts", () => ({
  useResourceClipboardShortcuts: (args: TreeHotkeyArgs) =>
    useResourceClipboardShortcutsMock(args),
}));

vi.mock("../hooks/use-filtered-resources", () => ({
  useFilteredResources: (query: string) =>
    query
      ? [
          {
            id: "result-1",
            resource_type_id: "plugin.rich-text",
            name: "Result",
          },
        ]
      : [],
}));

vi.mock("../hooks/use-workspace-tree", () => ({
  useWorkspaceTree: () => ({ tree }),
}));

vi.mock("../hooks/use-workspace-resource-creation", () => ({
  useWorkspaceResourceCreation: () => ({
    canCreate: true,
    createFolder: vi.fn(),
    createResource: addItemMock,
  }),
}));

vi.mock("../hooks/use-rename-keyboard-shortcut", () => ({
  useRenameKeyboardShortcut: (args: TreeHotkeyArgs) =>
    useRenameKeyboardShortcutMock(args),
}));

vi.mock("../store", () => ({
  useWorkspaceActions: () => ({
    createFolder: vi.fn(),
    createResource: addItemMock,
  }),
  useWorkspaceResources: () => [{ id: "item-1" }],
  useWorkspaceTrashMap: () => new Map(),
  useRegisterTree: () => registerTreeMock,
}));

vi.mock("../utils", () => ({
  getDeleteDescriptionI18n: () => ({
    key: "explorer.deleteConfirmation",
    params: {},
  }),
}));

vi.mock("./context-menu-config", () => ({
  AddFolderMenuItem: () => null,
  AddItemSubmenu: ({
    onAddItem,
  }: {
    onAddItem: (resource: {
      resourceTypeId: string;
      schema: { currentVersion: number };
    }) => Promise<void>;
  }) => (
    <button
      onClick={() =>
        onAddItem({
          resourceTypeId: "lunaris.file",
          schema: { currentVersion: 1 },
        })
      }
      type="button"
    >
      add file
    </button>
  ),
}));

vi.mock("./workspace-tree-empty", () => ({
  WorkspaceTreeEmpty: () => <div>empty</div>,
}));

vi.mock("./workspace-tree-flat-list", () => ({
  WorkspaceTreeFlatList: () => <div data-testid="search-list">search</div>,
}));

vi.mock("./workspace-tree-header", () => ({
  WorkspaceTreeHeader: ({
    onSearchChange,
  }: {
    onSearchChange: (value: string) => void;
  }) => (
    <button onClick={() => onSearchChange("query")} type="button">
      search
    </button>
  ),
}));

vi.mock("./workspace-tree-item", () => ({
  WorkspaceTreeItem: ({ item }: { item: { getId: () => string } }) => (
    <div data-testid={`tree-item-${item.getId()}`} />
  ),
}));

vi.mock("./workspace-tree-skeleton", () => ({
  WorkspaceTreeSkeleton: () => <div>skeleton</div>,
}));

import { WorkspaceExplorerTree } from "./workspace-tree";

describe("WorkspaceExplorerTree", () => {
  beforeEach(() => {
    addItemMock.mockReset();
    openResourceMock.mockReset();
    stableLoadingState.showEmpty = false;
    stableLoadingState.showSkeleton = false;
  });

  it("shows workspace tree skeleton immediately", () => {
    stableLoadingState.showSkeleton = true;

    render(<WorkspaceExplorerTree />);

    expect(screen.getByText("skeleton")).toBeTruthy();
  });

  it("removes workspace tree skeleton when loading resolves", () => {
    stableLoadingState.showSkeleton = true;

    const view = render(<WorkspaceExplorerTree />);
    expect(screen.getByText("skeleton")).toBeTruthy();

    stableLoadingState.showSkeleton = false;
    view.rerender(<WorkspaceExplorerTree />);

    expect(screen.queryByText("skeleton")).toBeNull();
  });

  it("passes the tree-region ref to tree hotkey hooks", () => {
    render(<WorkspaceExplorerTree />);

    const treeRoot = screen.getByTestId("tree-root");
    const deleteArgs = useDeleteKeyboardShortcutMock.mock.lastCall?.[0];
    const clipboardArgs = useResourceClipboardShortcutsMock.mock.lastCall?.[0];
    const renameArgs = useRenameKeyboardShortcutMock.mock.lastCall?.[0];

    expect(deleteArgs?.target).toBe(clipboardArgs?.target);
    expect(deleteArgs?.target).toBe(renameArgs?.target);
    expect(deleteArgs?.target.current).not.toBeNull();
    expect(deleteArgs?.target.current).not.toBe(treeRoot);
    expect(deleteArgs?.target.current?.contains(treeRoot)).toBe(true);
  });

  it("places trash left and workspace actions right in the footer", () => {
    render(
      <WorkspaceExplorerTree
        footerActions={
          <>
            <button type="button">Extensions</button>
            <button type="button">Settings</button>
          </>
        }
      />
    );

    const leading = screen.getByTestId("workspace-explorer-footer-leading");
    const trailing = screen.getByTestId("workspace-explorer-footer-trailing");

    expect(
      leading.querySelector("[data-testid='workspace-trash-trigger']")
    ).not.toBeNull();
    expect(
      Array.from(trailing.children).map((child) => child.textContent)
    ).toEqual(["Extensions", "Settings"]);
  });

  it("clears the tree hotkey target when search results replace the tree", () => {
    render(<WorkspaceExplorerTree />);

    fireEvent.click(screen.getByRole("button", { name: "search" }));

    expect(screen.getByTestId("search-list")).toBeTruthy();
    const deleteArgs = useDeleteKeyboardShortcutMock.mock.lastCall?.[0];
    const clipboardArgs = useResourceClipboardShortcutsMock.mock.lastCall?.[0];
    const renameArgs = useRenameKeyboardShortcutMock.mock.lastCall?.[0];

    expect(deleteArgs?.target).toBe(clipboardArgs?.target);
    expect(deleteArgs?.target).toBe(renameArgs?.target);
    expect(deleteArgs?.target.current).toBeNull();
  });

  it("opens newly uploaded files with the created item name", async () => {
    addItemMock.mockResolvedValue({
      resourceId: "item-file",
      name: "notes.txt",
    });

    render(<WorkspaceExplorerTree />);

    fireEvent.click(screen.getByRole("button", { name: "add file" }));

    await waitFor(() => {
      expect(openResourceMock).toHaveBeenCalledWith({
        resourceId: "item-file",
        resourceTypeId: "lunaris.file",
        schemaVersion: 1,
        title: "notes.txt",
      });
    });
  });
});

vi.mock("../../workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace-1" }),
}));
vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  useWorkspaceStorageSlots: () => ({ data: [] }),
}));
